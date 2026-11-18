// How notifications look. Anything can post one with notify({ title, body,
// level, icon, action }); replace this mod to restyle them all. Click to
// run its action (e.g. go to the agent) and dismiss it.

import { View, div, image } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { props, closeOverlay, run, theme } from "herdr";

// Shared by every toast copy (module scope): which overlay shows each notice now.
const LIVE = new Map();

const QUIET_KEEP = new Set(["error", "warning"]);

const DOT = { error: "blocked", warning: "working", success: "done", info: "accent" };

export default class StudioToast extends View {
  // The same notice twice (title, body, level) keeps one toast: the newest
  // closes the one before it and counts how many it stands for.
  init(_props, cx) {
    const p = props() ?? {};
    // Quiet by default: agent and info notices go away at once (the dots on tabs,
    // dock and status bar already say it); only problems are shown.
    if (!QUIET_KEEP.has(p.level) || String(p.action?.name ?? "").startsWith("agent.") || /needs you|finished/i.test(`${p.title} ${p.body}`)) { this.silent = true; if (p.overlay) closeOverlay(p.overlay); return; }
    this.key = [p.title, p.body, p.level].join("\u0000");
    this.overlay = p.overlay;
    const before = LIVE.get(this.key);
    if (before && before.overlay !== p.overlay) closeOverlay(before.overlay);
    this.count = before && before.overlay !== p.overlay ? before.count + 1 : 1;
    LIVE.set(this.key, { overlay: p.overlay, count: this.count });
    this.shown = false;
    cx.timer.after(30, (c) => { this.shown = true; c.notify(); });
  }

  async close() {
    if (this.silent) return;
    if (LIVE.get(this.key)?.overlay === this.overlay) LIVE.delete(this.key);
  }

  render(cx) {
    if (this.silent) return div();
    const t = theme();
    const p = props() ?? {};
    const login = /^([a-z0-9][a-z0-9_.-]{0,31}) needs login; run hc machine login \1$/.exec(p.body ?? "");
    const command = login ? `hc machine login ${login[1]}` : null;
    return h_flex()
      .id("toast")
      .size_full()
      .px(18)
      .gap(14)
      .items_center()
      .bg(t.popover)
      .opacity(this.shown ? 1 : 0)
      .transition("opacity", { duration: 180, easing: "ease-out" })
      .cursor_pointer()
      .hover((s) => s.bg(t.hover))
      .on_click(() => {
        if (p.action?.name) run(p.action.name, p.action.args ?? {});
        closeOverlay(p.overlay);
      })
      .child(p.icon ? image(p.icon).w(22).h(22).flex_none() : div().size(10).rounded(5).flex_none().bg(t[DOT[p.level] ?? "accent"]))
      .child(
        v_flex()
          .flex_1()
          .overflow_hidden()
          .child(div().truncate().font_semibold().text_size(14.5).text_color(t.foreground).child(login ? `${login[1]} needs a login: run` : p.title ?? ""))
          .when(!login && Boolean(p.body), (el) => el.child(div().truncate().text_size(12.5).text_color(t.muted).child(p.body ?? "")))
          .when(Boolean(login), (el) => el.child(h_flex().gap(8).items_center()
            .child(div().flex_1().min_w(0).truncate().tooltip(command).text_size(12).text_color(t.muted).child(command))
            .child(div().id("toast-login-copy").flex_none().px(6).py(3).rounded(4).bg(t.raised)
              .text_size(12).text_color(t.foreground).cursor_pointer().hover(s => s.bg(t.hover))
              .on_click((_e, cx) => { cx.stop_propagation(); cx.write_to_clipboard(command); this.copied = true; cx.notify(); })
              .child(this.copied ? "Copied" : "Copy")))),
      )
      .when(Boolean(p.action?.name) && !login, (el) => el.child(div().flex_none().px(10).h(26).flex().items_center().rounded(13)
        .bg(t.accent).text_size(12.5).font_semibold().text_color(t.accent_foreground).child("Go")))
      .when(this.count > 1, (el) => el.child(div().flex_none().px(7).h(20).flex().items_center().rounded(10)
        .bg(t.raised).text_size(11.5).font_semibold().text_color(t.muted).child(`×${this.count}`)));
  }
}
