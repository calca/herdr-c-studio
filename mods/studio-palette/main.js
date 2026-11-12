// Spotlight-style palette: one input, one flat list of tabs and quick actions.
import { View, div, svg } from "gpui-kit";
import { v_flex, h_flex, InputState, Input } from "gpui-base";
import { spaces, panes, run, theme, props, closeOverlay, shared, setShared, focused, layout } from "herdr";

function find(node, id) {
  if (node?.id === id) return node;
  for (const child of node?.children ?? []) {
    const found = find(child, id);
    if (found) return found;
  }
  return null;
}

function togglePanel(id) {
  const root = layout(), panel = find(root, "panel"), body = find(root, "panel-body");
  if (!panel) return;
  if (!panel.hidden && body?.active === id) run("layout.hide", { id: "panel" });
  else { run("layout.select", { stack: "panel-body", child: id }); run("layout.show", { id: "panel" }); }
}

const ROW_H = 44;
const VISIBLE = 8;

const ACTIONS = [
  { label: "New tab", hint: "⌘T", icon: "+", go: () => { const f = focused(); run("tab.new", { name: "New tab", mod: "studio-launch", props: { space: f?.space, folder: f?.cwd ?? undefined } }); } },
  { label: "New space", hint: "⌘N", icon: "+", go: () => run("space.new") },
  { label: "Split right", hint: "⌘D", icon: "▥", go: () => run("pane.split", { direction: "right" }) },
  { label: "Split down", hint: "⇧⌘D", icon: "▤", go: () => run("pane.split", { direction: "down" }) },
  { label: "Zoom pane", hint: "⇧⌘↩", icon: "⤢", go: () => run("pane.zoom") },
  { label: "Close pane", hint: "⇧⌘W", icon: "✕", go: () => run("pane.close") },
  { label: "Close tab", hint: "⌘W", icon: "✕", go: () => run("tab.close") },
  { label: "Rename tab", icon: "✎", go: () => run("tab.rename") },
  { label: "Rename space", icon: "✎", go: () => run("space.rename") },
  { label: "Toggle dock", hint: "⌘B", icon: "◧", go: () => {
    const v = shared("dock.pinned") !== true;
    setShared("dock.pinned", v);
    run("layout.resize", { id: "sidebar", px: v ? 296 : 56 });
  } },
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
    this.input = InputState.new({ placeholder: "Search tabs and actions…" });
    this.input.on("change", (_e, cx) => { this.filter = this.input.value(); this.at = 0; cx.notify(); });
    this.input.on("submit", (_e, cx) => this.go(this.items()[this.at]));
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
    const tabs = spaces().flatMap((w) => w.tabs.map((c) => {
      const lead = all.find((p) => p.tab === c.id && p.program?.agent) ?? all.find((p) => p.tab === c.id);
      const session = lead?.program?.agent && lead.title && lead.title !== lead.program.name ? lead.title : null;
      return { c, w, name: c.named ? c.name : session ?? lead?.program?.name ?? "Terminal" };
    })).map(({ c, w, name }) => ({
      kind: "tab", label: name, sub: w.name, status: c.status, here: w.active && c.active,
      go: () => run("tab.select", { id: c.id }),
    }));
    const rank = { blocked: 0, done: 1, working: 2 };
    tabs.sort((a, b) => (rank[a.status] ?? 3) - (rank[b.status] ?? 3));
    const spaceItems = spaces().map((w) => ({
      kind: "action", label: w.name, sub: "Space", icon: "◇", go: () => run("space.select", { id: w.id }),
    }));
    const known = (shared("new-menu.agents") ?? {})[""] ?? [];
    const agentItems = known.filter((a) => a.installed).map((a) => ({
      kind: "action", label: `New ${a.name}`, sub: "Agent", icon: "✦", go: () => run("tab.new", { name: a.name, argv: a.run }),
    }));
    const acts = [...spaceItems, ...agentItems, ...ACTIONS.map((a) => ({ kind: "action", ...a }))];
    const words = this.filter.toLowerCase().split(/\s+/).filter(Boolean);
    const list = [...tabs, ...acts];
    if (!words.length) return list;
    return list.filter((i) => {
      const hay = `${i.label} ${i.sub ?? ""}`.toLowerCase();
      return words.every((w) => hay.includes(w));
    });
  }

  go(item) {
    if (!item) return;
    this.close();
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
        .child(item.kind === "tab" ? dot(item.status) : div().w(14).flex_none().text_color(t.muted).child(item.icon))
        .child(div().flex_1().truncate().text_size(14.5).text_color(t.foreground).when(item.here, (d) => d.font_semibold()).child(item.label))
        .when(item.sub, (el) => el.child(div().text_size(12).text_color(t.dim).child(item.sub)))
        .when(item.hint, (el) => el.child(div().text_size(12).text_color(t.dim).child(item.hint)));
    };

    return v_flex().id("studio-palette").track_focus(this.handle).w_full().min_h(0).py(8).gap(6).bg(t.popover).text_size(13).rounded(14).border(1).border_color(t.foreground + "26")
      .opacity(this.shown ? 1 : 0).transition("opacity", { duration: 160, easing: "ease-out" })
      .on_key_down((e, cx) => {
        const k = e.key;
        if (k === "escape") return this.close();
        if (k === "down") this.at = (this.at + 1) % Math.max(1, items.length);
        else if (k === "up") this.at = (this.at + items.length - 1) % Math.max(1, items.length);
        else return;
        cx.stop_propagation();
        cx.notify();
      })
      .child(h_flex().h(52).flex_none().px(18).gap(12).items_center().border_b(1).border_color(t.border)
        .child(svg("mods/workspace-chrome/search.svg").size(18).text_color(t.dim))
        .child(Input.new(this.input).flex_1().h_full().text_size(17).text_color(t.foreground)))
      .child(items.length
        ? v_flex().h(Math.min(items.length, VISIBLE) * ROW_H).min_h(0).overflow_hidden().children(shown.map(row))
        : div().h(ROW_H).px(18).items_center().flex().text_color(t.dim).child("No results"));
  }
}
