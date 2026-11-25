// Spotlight-style palette: one input, one flat list of tabs and quick actions.
import { View, div, svg } from "gpui-kit";
import { v_flex, h_flex, InputState, Input } from "gpui-base";
import { spaces, panes, run, theme, props, closeOverlay, shared, setShared, focused, terminals } from "herdr";
import { togglePanel, pinDock, tabName, openLauncher, newTerminal, closeTab, dropPlaceholders } from "./kit.js";

const ROW_H = 44;
const RECENT = "c-studio-palette.recent";
const RECENT_MAX = 6;
const SCOPE = "c-studio-palette.space";

// Higher is better, 0 = no match. Whole substring beats word initials ("cc"
// finds Claude Code), which beat letters in order ("clcd").
function score(query, text) {
  const q = query.toLowerCase(), h = text.toLowerCase();
  if (!q) return 1;
  const at = h.indexOf(q);
  if (at === 0) return 100;
  if (at > 0) return /[\s/·-]/.test(h[at - 1]) ? 80 : 60;
  const initials = h.split(/[\s/·-]+/).filter(Boolean).map((w) => w[0]).join("");
  if (initials.startsWith(q)) return 50;
  if (initials.includes(q)) return 40;
  let i = 0, gaps = 0;
  for (const ch of h) {
    if (ch === q[i]) i++;
    else if (i > 0 && i < q.length) gaps++;
    if (i === q.length) return Math.max(1, 30 - gaps);
  }
  return 0;
}
const VISIBLE = 8;

const ACTIONS = [
  { label: "New tab", hint: "⌘T", icon: "+", go: () => { const f = focused(); newTerminal(f?.space, f?.cwd); } },
  { label: "New tab…", icon: "+", go: () => { const f = focused(); openLauncher(f?.space, f?.cwd); } },
  { label: "New space", hint: "⌘N", icon: "+", go: () => run("space.new") },
  { label: "Split right", hint: "⌘D", icon: "▥", go: () => run("pane.split", { direction: "right" }) },
  { label: "Split down", hint: "⇧⌘D", icon: "▤", go: () => run("pane.split", { direction: "down" }) },
  { label: "Zoom pane", hint: "⇧⌘↩", icon: "⤢", go: () => run("pane.zoom") },
  { label: "Close pane", hint: "⇧⌘W", icon: "✕", go: () => run("pane.close") },
  { label: "Close tab", hint: "⌘W", icon: "✕", go: () => closeTab(focused()?.tab) },
  { label: "Rename tab", icon: "✎", go: () => run("tab.rename") },
  { label: "Rename space", icon: "✎", go: () => run("space.rename") },
  { label: "Toggle dock", hint: "⌘B", icon: "◧", go: () => pinDock(shared("dock.pinned") !== true) },
  { label: "Files panel", hint: "⇧⌘E", icon: "▤", go: () => togglePanel("files") },
  { label: "Changes panel", hint: "⇧⌘G", icon: "±", go: () => togglePanel("changes") },
  { label: "Switch layout", hint: "⇧⌘L", icon: "◫", go: () => run("layout.switch") },
  { label: "Settings", hint: "⌘,", icon: "⚙", go: () => run("app.settings") },
  { label: "Command palette", hint: "⇧⌘P", icon: "›", go: () => run("app.palette") },
];

export default class StudioPalette extends View {
  init(_props, cx) {
    this.filter = "";
    this.at = 0;
    // Opened from the tab bar's overflow button: only that space's tabs, in order.
    this.scope = spaces().find((w) => w.id === shared(SCOPE)) ?? null;
    if (shared(SCOPE)) setShared(SCOPE, null);
    this.input = InputState.new({ placeholder: this.scope ? `Tabs in ${this.scope.name}…` : "Search tabs and actions…" });
    this.input.on("change", (_e, cx) => {
      if (this.renaming) return;
      this.filter = this.input.value(); this.at = 0; cx.notify();
    });
    this.input.on("submit", (_e, cx) => {
      if (!this.renaming) return this.go(this.items()[this.at]);
      const name = this.input.value().trim();
      this.close();
      if (name) run("tab.rename", { id: this.renaming.id, name });
    });
    this.input.focus();
    cx.timer.after(600, () => this.input.focus());
    this.handle = cx.focus_handle();
    this.shown = false;
    cx.timer.after(30, (c) => { this.shown = true; c.notify(); });
  }

  close() {
    closeOverlay(props().overlay);
  }

  items() {
    const all = panes();
    const tabs = spaces().filter((w) => !this.scope || w.id === this.scope.id).flatMap((w) => w.tabs.map((c) => ({ c, w, name: tabName(c, all).name })))
      .map(({ c, w, name }) => ({
      kind: "tab", key: `tab:${c.id}`, id: c.id, label: name, sub: w.name, status: c.status, here: w.active && c.active,
      go: () => run("tab.select", { id: c.id }),
    }));
    const rank = { blocked: 0, done: 1, working: 2 };
    if (!this.scope) tabs.sort((a, b) => (rank[a.status] ?? 3) - (rank[b.status] ?? 3));
    const spaceItems = spaces().map((w) => ({
      kind: "action", key: `space:${w.id}`, label: w.name, sub: "Space", icon: "◇", go: () => run("space.select", { id: w.id }),
    }));
    const f = focused();
    const here = spaces().find((w) => w.id === f?.space);
    const moveItems = f?.tab ? spaces().filter((w) => w.id !== here?.id && (w.machine ?? null) === (here?.machine ?? null)).map((w) => ({
      kind: "action", key: `move:${w.id}`, label: `Move tab to ${w.name}`, sub: "Space", icon: "→", go: () => setShared("c-studio.move", { tab: f.tab, space: w.id }),
    })) : [];
    // Parked: still running, but Herdr took its pane and its space/tab labels away.
    const shown = new Set(all.map((p) => p.terminal));
    const parked = terminals().filter((x) => x.state === "live" && !x.parent && x.labels && "herdr.seen" in x.labels
      && !x.labels["herdr.space"] && !shown.has(x.address)).map((x) => ({
      kind: "parked", key: `parked:${x.address}`, id: x.address, status: x.status,
      label: x.name || x.program?.name || x.foreground?.name || x.address,
      sub: `Parked · ${(x.cwd ?? "").split("/").pop() || "~"}`,
      go: () => run("terminal.keep", { terminal: x.address }),
    }));
    const known = (shared("new-menu.agents") ?? {})[""] ?? [];
    const agentItems = known.filter((a) => a.installed).map((a) => ({
      kind: "action", key: `agent:${a.name}`, label: `New ${a.name}`, sub: "Agent", icon: "✦", go: () => { run("tab.new", { name: a.name, argv: a.run }); dropPlaceholders(f?.space); },
    }));
    const acts = [...spaceItems, ...moveItems, ...agentItems, ...ACTIONS.map((a) => ({ kind: "action", key: `act:${a.label}`, ...a }))];
    const words = this.filter.toLowerCase().split(/\s+/).filter(Boolean);
    const list = this.scope ? tabs : [...tabs, ...parked, ...acts];
    if (!words.length && this.scope) return list;
    if (!words.length) {
      const recent = (shared(RECENT) ?? []).map((k) => list.find((i) => i.key === k)).filter(Boolean);
      recent.forEach((i) => { i.recent = true; });
      return [...recent, ...list.filter((i) => !i.recent)];
    }
    return list
      .map((i, n) => {
        let total = 0;
        for (const w of words) {
          const best = Math.max(score(w, i.label), score(w, i.sub ?? "") * 0.6);
          if (!best) return null;
          total += best;
        }
        return { i, n, total };
      })
      .filter(Boolean)
      .sort((a, b) => b.total - a.total || a.n - b.n)
      .map((x) => x.i);
  }

  remember(item) {
    const keep = (shared(RECENT) ?? []).filter((k) => k !== item.key && !k.startsWith("tab:") && !k.startsWith("move:") && !k.startsWith("parked:"));
    setShared(RECENT, [item.key, ...keep].slice(0, RECENT_MAX));
  }

  go(item) {
    if (!item) return;
    this.close();
    if (item.kind === "action") this.remember(item);
    item.go();
  }

  render() {
    const t = theme();
    const items = this.items();
    this.at = Math.max(0, Math.min(this.at, items.length - 1));
    this.top = Math.min(this.top ?? 0, this.at);
    if (this.at >= this.top + VISIBLE) this.top = this.at - VISIBLE + 1;
    const shown = items.slice(this.top, this.top + VISIBLE);

    const dot = (st) => div().w(14).flex_none().text_color(t[st] ?? t.dim).child(st === "idle" ? "○" : st ? "●" : "·");
    const row = (item, i) => {
      const on = this.top + i === this.at;
      return h_flex().id(`sp-${this.top + i}`).h(ROW_H).mx(6).px(12).gap(12).items_center().rounded(10).cursor_pointer()
        .when(on, (el) => el.bg(t.selected))
        .hover((s) => s.bg(t.hover))
        .on_click(() => this.go(item))
        .child(item.kind !== "action" ? dot(item.status) : div().w(14).flex_none().text_color(t.muted).child(item.icon))
        .child(div().flex_1().truncate().text_size(14.5).text_color(t.foreground).when(item.here, (d) => d.font_semibold()).child(item.label))
        .when(on && item.kind === "tab", (el) => el.child(div().text_size(11.5).text_color(t.dim).child("⌘R rename · ⌘⌫ close")))
        .when(on && item.kind === "parked", (el) => el.child(div().text_size(11.5).text_color(t.dim).child("↵ resume as tab · ⌘⌫ end")))
        .when(item.sub && !(on && item.kind !== "action"), (el) => el.child(div().text_size(12).text_color(t.dim).child(item.sub)))
        .when(item.hint, (el) => el.child(div().text_size(12).text_color(t.dim).child(item.hint)));
    };

    return v_flex().id("c-studio-palette").track_focus(this.handle).w_full().min_h(0).py(8).gap(6).bg(t.popover.slice(0, 7) + "eb").text_size(13).rounded(14).shadow_lg().border(1).border_color(t.foreground + "26")
      .opacity(this.shown ? 1 : 0).transition("opacity", { duration: 160, easing: "ease-out" })
      .on_key_down((e, cx) => {
        const k = e.key;
        if (k === "escape" && this.renaming) {
          this.renaming = null;
          this.input.set_value(this.filter);
          cx.stop_propagation();
          return cx.notify();
        }
        if (k === "escape") return this.close();
        if (this.renaming) return;
        const sel = items[this.at];
        if (e.modifiers.platform && sel?.kind === "tab" && k === "backspace") {
          cx.stop_propagation();
          this.close();
          return closeTab(sel.id);
        }
        if (e.modifiers.platform && sel?.kind === "parked" && k === "backspace") {
          cx.stop_propagation();
          run("terminal.kill", { terminal: sel.id });
          return cx.notify();
        }
        if (e.modifiers.platform && sel?.kind === "tab" && k === "r") {
          cx.stop_propagation();
          this.renaming = sel;
          this.input.set_value(sel.label);
          this.input.set_selected_range({ start: 0, end: sel.label.length });
          return cx.notify();
        }
        if (k === "down") this.at = (this.at + 1) % Math.max(1, items.length);
        else if (k === "up") this.at = (this.at + items.length - 1) % Math.max(1, items.length);
        else return;
        cx.stop_propagation();
        cx.notify();
      })
      .child(h_flex().h(52).flex_none().px(18).gap(12).items_center().border_b(1).border_color(t.border)
        .child(this.renaming
          ? div().flex_none().text_size(13).text_color(t.dim).child("Rename")
          : svg("mods/workspace-chrome/search.svg").size(18).text_color(t.dim))
        .child(Input.new(this.input).flex_1().h_full().text_size(17).text_color(t.foreground)))
      .child(this.renaming
        ? div().h(ROW_H).px(18).items_center().flex().text_size(12).text_color(t.dim).child("↵ save · esc back")
        : items.length
        ? v_flex().h(Math.min(items.length, VISIBLE) * ROW_H).min_h(0).overflow_hidden().children(shown.map(row))
        : div().h(ROW_H).px(18).items_center().flex().text_color(t.dim).child("No results"));
  }
}
