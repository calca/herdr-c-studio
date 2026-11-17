// A new tab's first screen: pick a terminal or an agent, it starts in the
// folder the tab was opened from and this launcher closes itself.

import { View, div } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { props, theme, run, focused, panes, spaces, shared, setShared, knownAgents, pickFolder, home, nextCommand, openOverlay } from "herdr";

const KNOWN = "new-menu.agents";
const RECENT = "c-studio-launch.folders";
const RECENT_MAX = 12;
const CHIPS = 5;

export default class StudioLaunch extends View {
  init(_props, cx) {
    const p = props() ?? {};
    const f = focused();
    this.space = p.space ?? f?.space ?? null;
    this.folder = p.folder ?? null;
    this.sel = 0;
    this.shown = false;
    this.handle = cx.focus_handle();
    this.handle.focus();
    cx.timer.after(30, (c) => { this.shown = true; this.handle.focus(); c.notify(); });
    const machine = spaces().find((s) => s.id === this.space)?.machine;
    this.machine = machine ?? "";
    cx.spawn(async (c) => {
      try {
        const list = await knownAgents({ on: machine });
        setShared(KNOWN, { ...shared(KNOWN), [this.machine]: list });
      } catch {}
      c.notify();
    });
    cx.spawn(async (c) => {
      for (;;) {
        if ((await nextCommand()) === "focus") this.handle.focus();
        c.notify();
      }
    });
  }

  choices() {
    const agents = ((shared(KNOWN) ?? {})[this.machine] ?? []).filter((a) => a.installed);
    return [{ key: "shell", name: "Terminal", run: null }, ...agents];
  }

  // Folders to jump to: the last ones started in, then those open in other tabs.
  recents() {
    const h = home();
    const open = panes().filter((p) => p.cwd && p.mod !== "c-studio-launch").map((p) => p.cwd);
    const seen = new Set([this.folder ?? h, h]);
    const out = [];
    for (const f of [...((shared(RECENT) ?? {})[this.machine] ?? []), ...open]) {
      if (seen.has(f)) continue;
      seen.add(f);
      out.push(f);
      if (out.length === CHIPS) break;
    }
    return out;
  }

  remember() {
    if (!this.folder) return;
    const all = shared(RECENT) ?? {};
    const list = [this.folder, ...(all[this.machine] ?? []).filter((f) => f !== this.folder)];
    setShared(RECENT, { ...all, [this.machine]: list.slice(0, RECENT_MAX) });
  }

  worktree() {
    openOverlay({ mod: "worktree", kind: "dialog", width: 460, height: 280,
      props: { space: this.space ?? undefined, folder: this.folder ?? undefined, action: "new" } });
    this.cancel();
  }

  // Our tab: the shown one, and only if the launcher is all it holds.
  ownTab() {
    const tab = focused()?.tab;
    const inTab = panes().filter((p) => p.tab === tab);
    return inTab.length === 1 && inTab[0].mod === "c-studio-launch" ? tab : null;
  }

  launch(c) {
    const own = this.ownTab();
    const args = { space: this.space ?? undefined, folder: this.folder ?? undefined };
    if (c.run) Object.assign(args, { name: c.name, argv: c.run });
    this.remember();
    run("tab.new", args);
    if (own) run("tab.close", { id: own, confirmed: true });
  }

  cancel() {
    const own = this.ownTab();
    if (own) run("tab.close", { id: own, confirmed: true });
  }

  pretty(path) {
    if (!path) return "Home";
    const h = home();
    return h && path.startsWith(h) ? "~" + path.slice(h.length) : path;
  }

  tile(t, c, i) {
    const on = i === this.sel;
    return v_flex()
      .id(`launch-${c.key}`)
      .w(150).h(76).flex_none()
      .items_center().justify_center().gap(6)
      .rounded(14)
      .bg(on ? t.selected : t.raised)
      .border(1)
      .border_color(on ? t.accent : t.foreground + "14")
      .cursor_pointer()
      .hover((s) => s.bg(t.hover))
      .on_hover((h, cx) => { if (h && this.sel !== i) { this.sel = i; cx.notify(); } })
      .on_click(() => this.launch(c))
      .child(div().text_size(14).font_medium().text_color(t.foreground).truncate().max_w(130).child(c.name))
      .child(div().text_size(11).text_color(t.dim).child(i === 0 ? "↵" : i < 10 ? String(i) : ""));
  }

  render(cx) {
    const t = theme();
    const list = this.choices();
    if (this.sel >= list.length) this.sel = 0;
    const recent = this.recents();
    const key = (k) => div().px(5).py(1).rounded(4).bg(t.raised).text_color(t.muted).child(k);
    return v_flex()
      .id("launch")
      .size_full()
      .items_center()
      .justify_center()
      .gap(26)
      .bg(t.background)
      .track_focus(this.handle)
      .on_mouse_down("left", () => this.handle.focus())
      .on_key_down((e, cx) => {
        if (e.modifiers.control || e.modifiers.platform || e.modifiers.alt) return;
        const k = e.key;
        if (k === "escape") return this.cancel();
        if (k === "enter") return this.launch(list[this.sel]);
        if (k === "right" || k === "tab") this.sel = (this.sel + 1) % list.length;
        else if (k === "left") this.sel = (this.sel - 1 + list.length) % list.length;
        else if (/^[1-9]$/.test(k) && list[Number(k)]) return this.launch(list[Number(k)]);
        else return;
        cx.notify();
      })
      .opacity(this.shown ? 1 : 0)
      .transition("opacity", { duration: 200, easing: "ease-out" })
      .child(v_flex().items_center().gap(6)
        .child(div().text_size(22).font_semibold().text_color(t.foreground).child("New tab"))
        .child(h_flex().gap(6).items_center().text_size(12.5)
          .child(div().text_color(t.muted).child(this.pretty(this.folder)))
          .child(div().id("launch-folder").px(6).py(1).rounded(6).text_color(t.accent).cursor_pointer()
            .hover((s) => s.bg(t.hover))
            .on_click((_e, cx) => cx.spawn(async (c) => {
              const f = await pickFolder({ prompt: "Start in" });
              if (f) this.folder = f;
              this.handle.focus();
              c.notify();
            }))
            .child("Change…"))
          .child(div().id("launch-worktree").px(6).py(1).rounded(6).text_color(t.accent).cursor_pointer()
            .hover((s) => s.bg(t.hover))
            .on_click(() => this.worktree())
            .child("New worktree…")))
        .when(recent.length > 0, (el) => el.child(h_flex().pt(6).gap(6).flex_wrap().justify_center().max_w(700)
          .children(recent.map((f, i) => div().id(`launch-recent-${i}`).px(10).py(3).rounded(999)
            .bg(t.raised).text_size(12).text_color(t.muted).cursor_pointer()
            .hover((s) => s.bg(t.hover).text_color(t.foreground))
            .tooltip(this.pretty(f))
            .on_click((_e, cx) => { this.folder = f; this.handle.focus(); cx.notify(); })
            .child(f.split("/").pop() || f))))))
      .child(h_flex().gap(14).flex_wrap().justify_center().max_w(860).px(24)
        .children(list.map((c, i) => this.tile(t, c, i))))
      .child(h_flex().gap(14).items_center().text_size(11.5).text_color(t.dim)
        .child(h_flex().gap(5).items_center().child(key("↵")).child("open"))
        .child(h_flex().gap(5).items_center().child(key("1–9")).child("agent"))
        .child(h_flex().gap(5).items_center().child(key("←→")).child("move"))
        .child(h_flex().gap(5).items_center().child(key("esc")).child("cancel")));
  }
}
