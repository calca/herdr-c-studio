// ctrl+tab switcher: recent tabs across spaces, like cmd+tab for apps.
// Hold ctrl, press tab (shift+tab goes back), release ctrl to go there.
import { View, div, svg } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { spaces, panes, run, theme, props, closeOverlay, shared, setShared } from "herdr";
import { tabName, programIcon, spaceColor, isPinned } from "./kit.js";

const RECENT = "c-studio.recent";
const SWITCH = "c-studio-switch";
const ROW_H = 44;
const VISIBLE = 9;
const STATUS = { working: "Working", blocked: "Needs you", done: "Done" };

export default class StudioSwitch extends View {
  init(_props, cx) {
    this.done = false;
    this.handle = cx.focus_handle();
    this.handle.focus();
    cx.timer.after(40, () => this.handle.focus());
    setShared(SWITCH, { step: shared(SWITCH)?.step ?? 1, overlay: props()?.overlay });
    // A quick ctrl+tab just flips back: show the list only if ctrl is still held.
    this.shown = false;
    cx.timer.after(140, (c) => { this.shown = true; c.notify(); });
  }

  items() {
    const all = panes();
    const byId = new Map();
    for (const s of spaces()) for (const c of s.tabs) byId.set(c.id, { c, s });
    const recent = (shared(RECENT) ?? []).filter((id) => byId.has(id));
    const rest = [...byId.keys()].filter((id) => !recent.includes(id));
    return [...recent, ...rest].map((id) => {
      const { c, s } = byId.get(id);
      return { id, space: s, tab: c, ...tabName(c, all) };
    });
  }

  at(items) {
    const n = Math.max(1, items.length);
    return (((shared(SWITCH)?.step ?? 1) % n) + n) % n;
  }

  step(d) {
    const st = shared(SWITCH) ?? {};
    // `by`/`at` tell the tabs mod this key was handled here, if its ctrl+tab binding fires too.
    setShared(SWITCH, { ...st, step: (st.step ?? 1) + d, by: "switch", at: Date.now() });
  }

  finish(go) {
    if (this.done) return;
    this.done = true;
    const items = this.items();
    const pick = items[this.at(items)];
    setShared(SWITCH, null);
    closeOverlay(props()?.overlay);
    if (go && pick) run("tab.select", { id: pick.id });
  }

  async close() {
    if (shared(SWITCH)) setShared(SWITCH, null);
  }

  render() {
    const t = theme();
    const items = this.items();
    const at = this.at(items);
    const top = Math.max(0, Math.min(at - VISIBLE + 1, items.length - VISIBLE));
    const shown = items.slice(Math.max(0, top), Math.max(0, top) + VISIBLE);

    const row = (item, i) => {
      const n = Math.max(0, top) + i;
      const on = n === at;
      const color = spaceColor(t, item.space);
      const st = item.tab.status;
      return h_flex().id(`sw-${item.id}`).h(ROW_H).mx(6).px(12).gap(10).items_center().rounded(10).cursor_pointer()
        .when(on, (el) => el.bg(t.foreground + "1a"))
        .hover((s) => s.bg(t.foreground + "14"))
        .on_mouse_down("left", (_e, cx) => { cx.stop_propagation(); setShared(SWITCH, { ...(shared(SWITCH) ?? {}), step: n }); this.finish(true); })
        .child(div().w(8).flex_none().flex().justify_center().child(st && st !== "idle" ? div().size(6).rounded(3).bg(t[st] ?? t.dim) : div()))
        .child(div().w(18).flex_none().flex().justify_center().when(Boolean(item.program?.icon), (el) => el.child(programIcon(item.program, 15, on ? t.foreground : t.muted))))
        .child(div().flex_1().min_w(0).truncate().text_size(14).text_color(on ? t.foreground : t.muted).when(on, (d) => d.font_semibold()).child(item.name))
        .when(isPinned(item.id), (el) => el.child(svg("mods/workspace-chrome/pin.svg").size(12).flex_none().text_color(t.dim)))
        .when(st === "blocked" || st === "working" || st === "done", (el) => el.child(div().flex_none().text_size(11.5).text_color(t[st] ?? t.dim).child(STATUS[st])))
        .child(h_flex().flex_none().gap(6).items_center()
          .child(div().size(7).rounded(4).bg(color))
          .child(div().text_size(12).text_color(t.dim).child(item.space.name)));
    };

    return v_flex().id("c-studio-switch").track_focus(this.handle).w_full().py(8).gap(2)
      .bg(t.popover.slice(0, 7) + "eb").rounded(14).shadow_lg().border(1).border_color(t.foreground + "26")
      .opacity(this.shown ? 1 : 0).transition("opacity", { duration: 280, easing: "ease-out" })
      .on_modifiers_changed((e) => { if (!e.modifiers.control) this.finish(true); })
      .on_key_up((e) => { if (e.key === "tab" && !e.modifiers.control) this.finish(true); })
      .on_key_down((e, cx) => {
        const k = e.key;
        if (k === "escape") { cx.stop_propagation(); return this.finish(false); }
        if (k === "enter") { cx.stop_propagation(); return this.finish(true); }
        if (k === "tab") this.step(e.modifiers.shift ? -1 : 1);
        else if (k === "down") this.step(1);
        else if (k === "up") this.step(-1);
        else return;
        cx.stop_propagation();
      })
      .child(div().px(18).pt(2).pb(6).text_size(11).font_semibold().text_color(t.muted).child("RECENT TABS"))
      .children(shown.map(row));
  }
}
