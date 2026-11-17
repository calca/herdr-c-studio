// Asked before closing a tab that runs a program or an agent: park it (the
// pane goes, the terminal keeps running in hc) or close it (it stops).

import { View, div } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { props, closeOverlay, run, theme, spaces, panes } from "herdr";
import { tabName, busyPanes } from "./kit.js";

export default class CloseTab extends View {
  init(_props, cx) {
    this.handle = cx.focus_handle();
    this.handle.focus();
    cx.timer.after(30, () => this.handle.focus());
  }

  tab() {
    const id = props()?.tab;
    return spaces().flatMap((s) => s.tabs).find((c) => c.id === id) ?? null;
  }

  done() {
    if (props()?.overlay) closeOverlay(props().overlay);
  }

  park(tab) {
    const mine = panes().filter((p) => p.tab === tab.id);
    for (const p of mine.filter((p) => p.terminal)) run("terminal.park", { terminal: p.terminal });
    // Mod panes have nothing to keep running; the tab goes with them.
    if (mine.some((p) => !p.terminal)) run("tab.close", { id: tab.id, confirmed: true });
    this.done();
  }

  close(tab) {
    run("tab.close", { id: tab.id });
    this.done();
  }

  render() {
    const t = theme();
    const tab = this.tab();
    if (!tab) { this.done(); return div(); }
    const busy = busyPanes(tab.id);
    const names = [...new Set(busy.map((p) => p.program.name))].join(", ");
    const button = (id, label, primary, action) => div().id(id).h(30).px(14).flex().items_center().rounded(8).cursor_pointer()
      .text_size(13).font_medium()
      .bg(primary ? t.accent : t.raised).text_color(primary ? t.accent_foreground : t.foreground)
      .hover((s) => s.opacity(0.85))
      .on_click(action)
      .child(label);
    return v_flex().id("close-tab").size_full().p(20).gap(8).bg(t.popover).track_focus(this.handle)
      .on_key_down((e, cx) => {
        if (e.key === "escape") this.done();
        else if (e.key === "enter") this.park(tab);
        else if (e.key === "backspace" && e.modifiers.platform) this.close(tab);
        else return;
        cx.stop_propagation();
      })
      .child(div().text_size(15).font_semibold().text_color(t.foreground).truncate().child(`Close “${tabName(tab).name}”?`))
      .child(div().text_size(13).text_color(t.muted).child(`${names || "A program"} is still running. Park keeps it running in the background; Close stops it.`))
      .child(div().flex_1())
      .child(h_flex().gap(8).justify_end()
        .child(button("close-cancel", "Cancel", false, () => this.done()))
        .child(button("close-close", "Close  ⌘⌫", false, () => this.close(tab)))
        .child(button("close-park", "Park  ↵", true, () => this.park(tab))));
  }
}
