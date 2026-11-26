// Right-click menu for a tab, in Herdr's menu style, with Pin and a Close
// that goes through closeTab (asks for pinned or busy tabs).
// props { target: { id, space } }. ↑/↓ move, Enter runs, Esc closes.
import { View, div, svg } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { run, props, closeOverlay, theme } from "herdr";
import { isPinned, togglePin, closeTab, newTerminal } from "./kit.js";

const icon = (name) => `mods/workspace-chrome/${name}.svg`;

function items(tg) {
  const pinned = isPinned(tg.id);
  return [
    { label: "Rename", icon: "square-pen", go: () => run("tab.rename", { id: tg.id }) },
    { label: pinned ? "Unpin" : "Pin", icon: pinned ? "pin-off" : "pin", hint: "⌃⌘P", go: () => togglePin(tg.id) },
    { label: "New tab", icon: "plus", hint: "⌘T", go: () => newTerminal(tg.space) },
    { label: "Close", icon: "x", hint: "⌘W", line: true, go: () => closeTab(tg.id) },
  ];
}

export default class TabMenu extends View {
  init(_props, cx) {
    this.at = 0;
    this.handle = cx.focus_handle();
    this.handle.focus();
  }

  choose(it) {
    if (!it) return;
    closeOverlay(props()?.overlay);
    it.go();
  }

  render() {
    const t = theme();
    const list = items(props()?.target ?? {});
    return v_flex().id("c-studio-menu").track_focus(this.handle).w_full().min_h(0).p(5).bg(t.popover).text_size(12.8)
      .on_key_down((e, cx) => {
        if (e.key === "down") this.at = (this.at + 1) % list.length;
        else if (e.key === "up") this.at = (this.at + list.length - 1) % list.length;
        else if (e.key === "enter") return this.choose(list[this.at]);
        else if (e.key === "escape") return closeOverlay(props()?.overlay);
        else return;
        cx.notify();
      })
      .children(list.map((it, i) => v_flex()
        .when(Boolean(it.line), (el) => el.child(div().mx(7).my(4).h(1).bg(t.border)))
        .child(h_flex().id(`cm-${i}`).h(31).px(8).gap(9).rounded(7).items_center().text_color(t.foreground)
          .when(i === this.at, (el) => el.bg(t.selected))
          .hover((s) => s.bg(t.hover))
          .on_click(() => this.choose(it))
          .child(svg(icon(it.icon)).size(14).flex_none().text_color(t.muted))
          .child(div().flex_1().child(it.label))
          .child(div().text_size(11).text_color(t.dim).child(it.hint ?? "")))));
  }
}
