import { View, div, svg } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { spaces, agents, theme, run, props, placement, shared, setShared, openOverlay, nextCommand, keys } from "herdr";

const OPEN_W = 276;
const PEEK_W = 56;

const initial = (name) => (name || "?").trim().charAt(0).toUpperCase();

function ago(ms) {
  if (!ms) return "";
  const m = Math.max(0, Math.floor((Date.now() - ms) / 60000));
  if (m < 1) return "<1m";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return h < 24 ? `${h}h` : `${Math.floor(h / 24)}d`;
}

const STATUS = {
  working: { label: "Working", key: "working" },
  blocked: { label: "Needs you", key: "blocked" },
  done: { label: "Done", key: "done" },
  idle: { label: "Idle", key: "dim" },
};

export default class GigiDock extends View {
  init(_props, cx) {
    this.hover = null;
    this.docked = Boolean(props()?.docked);
    cx.timer.every(20000, (c) => c.notify());
    if (!this.docked) {
      this.apply(shared("dock.pinned") === true);
      cx.spawn(async (c) => {
        for (;;) {
          if ((await nextCommand()) === "toggle") this.setPinned(shared("dock.pinned") !== true);
          c.notify();
        }
      });
    }
  }

  apply(pinned) {
    run("layout.resize", { id: "sidebar", px: pinned ? OPEN_W : PEEK_W });
  }

  setPinned(v) {
    setShared("dock.pinned", v);
    this.apply(v);
  }

  shortcut(index) {
    const k = keys().find((x) => x.section === "global" && x.action === `space.select:${index}`);
    if (!k) return "";
    return k.keys.split("-").map((p) => ({ ctrl: "⌃", cmd: "⌘", shift: "⇧", alt: "⌥" }[p] ?? p.toUpperCase())).join("");
  }

  dot(t, status, size = 8) {
    if (status === "working") return svg("mods/workspace-chrome/spinner.svg").size(size + 4).flex_none().text_color(t.working).spin(900);
    if (status === "blocked" || status === "done") return div().size(size).flex_none().rounded(size / 2).bg(t[status]);
    return div().size(size).flex_none();
  }

  iconButton(t, id, glyph, action) {
    return div().id(id).size(22).flex_none().flex().items_center().justify_center().rounded(7)
      .text_size(14).text_color(t.dim).hover((x) => x.bg(t.raised).text_color(t.foreground))
      .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
      .on_click((_e, cx) => { cx.stop_propagation(); action(); })
      .child(glyph);
  }

  render() {
    const t = theme();
    const pinned = shared("dock.pinned") === true;
    if (this.docked !== pinned) return div();
    const open = this.docked || (placement()?.hovered ?? false);
    const list = agents();
    const all = spaces();
    const blockedTotal = list.filter((a) => a.status === "blocked").length;

    const row = (s, i) => {
      const mine = list.filter((a) => a.space === s.id);
      const needs = mine.filter((a) => a.status === "blocked").length;
      const hovered = open && this.hover === s.id;
      const sub = [s.branch, `${s.tabs.length} tab${s.tabs.length === 1 ? "" : "s"}`, mine.length ? `${mine.length} agent${mine.length === 1 ? "" : "s"}` : null].filter(Boolean).join(" · ");
      return v_flex().id(`dock-${s.id}`).gap(2)
        .on_hover((h, c) => { this.hover = h ? s.id : (this.hover === s.id ? null : this.hover); c.notify(); })
        .child(
          h_flex().id(`dock-row-${s.id}`).relative().h(46).px(8).gap(10).items_center().rounded(12)
            .hover((x) => x.bg(t.hover))
            .on_mouse_down("left", (e) => run(e.click_count === 2 ? "space.rename" : "space.select", { id: s.id }))
            .on_mouse_down("right", () => run("space.rename", { id: s.id }))
            .when(s.active, (el) => el.child(div().absolute().left(2).top(15).w(3).h(16).rounded(2).bg(t.accent)))
            .child(div().relative().size(30).flex_none()
              .child(div().size(30).flex().items_center().justify_center().rounded(9)
                .text_color(s.active ? t.foreground : t.dim)
                .text_size(14).font_semibold().child(initial(s.name)))
              .when(Boolean(s.status) && s.status !== "idle", (el) => el.child(
                div().absolute().top(-2).right(-2).size(10).rounded(5).bg(t[s.status] ?? t.dim).border(2).border_color(t.popover))))
            .child(v_flex().flex_1().min_w(0).gap(1)
              .child(div().truncate().text_size(13).font_medium().text_color(s.active ? t.foreground : t.muted).child(s.name))
              .child(div().truncate().text_size(10.5).text_color(t.dim).child(sub)))
            .when(needs > 0 && !hovered, (el) => el.child(
              div().flex_none().px(7).h(18).flex().items_center().rounded(9).bg(t.blocked + "26")
                .text_size(10.5).font_semibold().text_color(t.blocked).child(`${needs} needs you`)))
            .when(needs === 0 && !hovered && i < 9, (el) => el.child(div().flex_none().text_size(10.5).text_color(t.dim).child(this.shortcut(i + 1))))
            .when(hovered, (el) => el
              .child(this.iconButton(t, `dock-tab-${s.id}`, "+", () => {
                run("space.select", { id: s.id });
                openOverlay({ mod: "new-menu", kind: "popup", width: 250, height: 512 });
              }))
              .child(this.iconButton(t, `dock-close-${s.id}`, "×", () => run("space.close", { id: s.id })))))
        .when(open && mine.length > 0, (el) => el.children(mine.map((a) => {
          const tab = s.tabs.find((x) => x.id === a.tab);
          const st = STATUS[a.status] ?? STATUS.idle;
          const since = a.status === "working" ? tab?.working_since : tab?.changed_at;
          return h_flex().id(`dock-agent-${a.address}`).h(28).ml(30).mr(4).px(8).gap(8).items_center().rounded(8)
            .relative().hover((x) => x.bg(t.hover))
            .when(a.focused, (el) => el.child(div().absolute().bottom(0).left(8).right(8).h(2).rounded(1).bg(t.accent)))
            .on_click(() => { run("space.select", { id: s.id }); run("agent.focus", { terminal: a.address }); })
            .child(this.dot(t, a.status, 6))
            .child(div().flex_1().min_w(0).truncate().text_size(12).text_color(a.focused ? t.foreground : t.muted).child(a.title || a.program?.name || "agent"))
            .child(div().flex_none().text_size(10.5).text_color(t[st.key] ?? t.dim).child(since ? `${st.label} · ${ago(since)}` : st.label));
        })));
    };

    const footerButton = (id, glyph, label, action) =>
      h_flex().id(id).h(32).px(8).gap(10).items_center().rounded(10).text_color(t.dim)
        .hover((x) => x.bg(t.hover).text_color(t.foreground)).on_click(action)
        .child(div().w(30).flex_none().flex().justify_center().text_size(15).child(glyph))
        .child(div().text_size(12).truncate().child(label));

    
    return v_flex().w(OPEN_W).p(6).gap(4)
      .when(this.docked, (el) => el.h_full().bg(t.chrome).rounded(16).border(1).border_color(t.border).overflow_y_scrollbar())
      .child(
        h_flex().id("dock-head").h(30).px(8).items_center().gap(10)
          .child(div().w(30).flex_none().flex().justify_center().child(svg("mods/workspace-chrome/layers.svg").size(15).text_color(t.dim)))
          .child(div().flex_1().text_size(10.5).font_semibold().text_color(t.dim).child("SPACES"))
          .when(blockedTotal > 0, (el) => el.child(div().flex_none().px(6).h(16).flex().items_center().rounded(8).bg(t.blocked + "26").text_size(10).font_semibold().text_color(t.blocked).child(`${blockedTotal}`)))
          .child(this.iconButton(t, "dock-pin", pinned ? "◧" : "◨", () => this.setPinned(!pinned))))
      .children(all.map(row))
      .child(div().h(1).mx(8).my(2).bg(t.border))
      .child(footerButton("dock-new", "+", "New space", () => run("space.new")))
  }
}
