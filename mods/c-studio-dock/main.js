import { View, div, svg, image } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { spaces, agents, panes, theme, run, props, placement, shared, setShared, nextCommand, keys } from "herdr";
import { SIDEBAR, pinDock, tabName, newTerminal, spaceColor, closeTab, moveTab, setSpaceColor, MARK, SPACE_COLORS } from "./kit.js";


const FOLDED = "dock.folded";

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

export default class StudioDock extends View {
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
    run("layout.resize", { id: "sidebar", px: pinned ? SIDEBAR.open : SIDEBAR.peek });
  }

  // Folded spaces hide their tab rows; remembered across copies and restarts.
  toggleFold(id) {
    const now = (shared(FOLDED) ?? []).filter((x) => spaces().some((s) => s.id === x));
    setShared(FOLDED, now.includes(id) ? now.filter((x) => x !== id) : [...now, id]);
  }

  setPinned(v) {
    pinDock(v);
  }

  shortcut(index) {
    const k = keys().find((x) => x.section === "global" && x.action === `space.select:${index}`);
    if (!k) return "";
    return k.keys.split("-").map((p) => ({ ctrl: "⌃", cmd: "⌘", shift: "⇧", alt: "⌥" }[p] ?? p.toUpperCase())).join("");
  }

  dot(t, status, size = 8) {
    if (status === "working") return svg("mods/workspace-chrome/spinner.svg").size(size + 4).flex_none().text_color(t.working).spin(900);
    if (status === "blocked") return div().size(size).flex_none().rounded(size / 2).bg(t.blocked).loop("opacity", { from: 0.35, to: 1, period: 1400 });
    if (status === "done") return div().size(size).flex_none().rounded(size / 2).bg(t.done);
    return div().size(size).flex_none();
  }

  iconButton(t, id, glyph, action) {
    return div().id(id).size(22).flex_none().flex().items_center().justify_center().rounded(7)
      .text_size(14).text_color(t.dim).hover((x) => x.bg(t.raised).text_color(t.foreground))
      .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
      .on_click((_e, cx) => { cx.stop_propagation(); action(); })
      .child(glyph);
  }

  render(cx) {
    const t = theme();
    const pinned = shared("dock.pinned") === true;
    if (this.docked !== pinned) { this.wasShown = false; return div(); }
    if (this.docked && !this.wasShown) {
      this.wasShown = true;
      this.faded = true;
      cx.timer.after(30, (c) => { this.faded = false; c.notify(); });
    }
    const open = this.docked || (placement()?.hovered ?? false);
    if (!open) this.picking = null;
    const list = agents();
    const all = spaces();
    const blockedTotal = list.filter((a) => a.status === "blocked").length;

    const row = (s, i) => {
      const mine = list.filter((a) => a.space === s.id);
      const needs = mine.filter((a) => a.status === "blocked").length;
      const hovered = open && this.hover === s.id;
      const folded = (shared(FOLDED) ?? []).includes(s.id);
      const color = spaceColor(t, s);
      const sub = [s.branch, `${s.tabs.length} tab${s.tabs.length === 1 ? "" : "s"}`, mine.length ? `${mine.length} agent${mine.length === 1 ? "" : "s"}` : null].filter(Boolean).join(" · ");
      return v_flex().id(`dock-${s.id}`).gap(4).pb(6)
        .on_hover((h, c) => { this.hover = h ? s.id : (this.hover === s.id ? null : this.hover); c.notify(); })
        .when(this.picking === s.id, (el) => el.on_mouse_down_out((_e, cx) => { this.picking = null; cx.notify(); }))
        .child(
          h_flex().id(`dock-row-${s.id}`).relative().h(46).px(8).gap(10).items_center().rounded(12)
            .hover((x) => x.bg(t.hover))
            // A dock tab dropped on another space moves there.
            .when(Boolean(this.drag && this.drag.space !== s.id && hovered), (el) => el.bg(color + "33"))
            .on_mouse_up("left", (_e, cx) => {
              const d = this.drag; this.drag = null;
              if (d && d.space !== s.id) cx.spawn(async (c) => { await moveTab(d.tab, s.id); c.notify(); });
            })
            .on_mouse_down("left", (e) => {
              if (e.click_count === 2) return run("space.rename", { id: s.id });
              if (s.active && open && s.tabs.length > 0) return this.toggleFold(s.id);
              run("space.select", { id: s.id });
            })
            .on_mouse_down("right", (_e, cx) => { this.picking = this.picking === s.id ? null : s.id; cx.notify(); })
            .child(div().relative().size(30).flex_none()
              .child(div().size(30).flex().items_center().justify_center().rounded(15)
                .when(s.active, (d) => d.bg(color + "33"))
                .text_color(color)
                .text_size(14).font_semibold().child(initial(s.name)))
              .when(Boolean(s.status) && s.status !== "idle", (el) => el.child(
                div().absolute().top(-2).right(-2).size(10).rounded(5).bg(t[s.status] ?? t.dim).border(2).border_color(t.popover)
                  .when(s.status === "working" || s.status === "blocked", (d) => d.loop("opacity", { from: 0.35, to: 1, period: s.status === "blocked" ? 1400 : 1800 })))))
            .child(v_flex().flex_1().min_w(0).gap(1)
              .child(div().truncate().text_size(14.5).font_medium().when(s.active, (d) => d.font_semibold()).text_color(s.active ? t.foreground : t.muted).child(s.name))
              .child(div().truncate().text_size(11.5).text_color(t.dim).child(sub)))
            .when(needs > 0 && !hovered, (el) => el.child(
              div().flex_none().px(7).h(18).flex().items_center().rounded(9).bg(t.blocked + "26")
                .text_size(11.5).font_semibold().text_color(t.blocked).child(`${needs} needs you`)))
            .when(folded && needs === 0 && !hovered, (el) => el.child(div().flex_none().text_size(13).text_color(t.dim).child("›")))
            .when(!folded && needs === 0 && !hovered && i < 9, (el) => el.child(div().flex_none().text_size(11.5).text_color(t.dim).child(this.shortcut(i + 1))))
            .when(hovered, (el) => el
              .child(this.iconButton(t, `dock-tab-${s.id}`, "+", () => {
                const active = s.tabs.find((c) => c.active) ?? s.tabs[0];
                const lead = panes().find((p) => p.tab === active?.id && p.focused) ?? panes().find((p) => p.tab === active?.id && p.cwd);
                run("space.select", { id: s.id });
                newTerminal(s.id, lead?.cwd ?? s.folder);
              }))
              .child(this.iconButton(t, `dock-close-${s.id}`, "×", () => run("space.close", { id: s.id })))))
        .when(open && this.picking === s.id, (el) => el.child(h_flex().id(`dock-colors-${s.id}`).h(32).ml(48).gap(8).items_center()
          .children(SPACE_COLORS.map((k) => div().id(`dock-color-${s.id}-${k}`).size(18).rounded(9).bg(MARK[k]).cursor_pointer()
            .when(shared("space.colors")?.[s.id] === k, (d) => d.border(2).border_color(t.foreground))
            .hover((d) => d.opacity(0.8))
            .on_mouse_down("left", (_e, cx) => { cx.stop_propagation(); setSpaceColor(s.id, k); this.picking = null; cx.notify(); })))
          .child(div().w(1).h(16).bg(t.border))
          .child(div().id(`dock-rename-${s.id}`).px(6).py(2).rounded(6).text_size(12.5).text_color(t.muted).cursor_pointer()
            .hover((d) => d.bg(t.hover).text_color(t.foreground))
            .on_mouse_down("left", (_e, cx) => { cx.stop_propagation(); this.picking = null; run("space.rename", { id: s.id }); })
            .child("Rename…"))))
        .when(open && !folded && s.tabs.length > 0, (el) => el.children(s.tabs.map((c) => {
          const { name, program } = tabName(c);
          const st = c.status ? (STATUS[c.status] ?? STATUS.idle) : null;
          const since = c.status === "working" ? c.working_since : c.changed_at;
          const focused = s.active && c.active;
          const over = this.hoverTab === c.id;
          const dropHere = this.drag && this.drag.space === s.id && this.drag.tab !== c.id && over;
          return h_flex().id(`dock-tab-row-${c.id}`).h(38).ml(16).mr(4).px(10).gap(8).items_center().rounded(8).tooltip(name)
            .relative().hover((x) => x.bg(t.hover))
            .when(focused, (el) => el.bg(color + "1F").font_semibold())
            .when(dropHere, (el) => el.bg(t.hover))
            .on_hover((h, cx) => { this.hoverTab = h ? c.id : (this.hoverTab === c.id ? null : this.hoverTab); cx.notify(); })
            .on_mouse_down("left", (e) => {
              this.drag = { space: s.id, tab: c.id };
              run("space.select", { id: s.id });
              run(e.click_count === 2 ? "tab.rename" : "tab.select", { id: c.id });
            })
            // Drop on another tab of the same space: take its place.
            .on_mouse_up("left", () => {
              const d = this.drag; this.drag = null;
              if (d && d.space === s.id && d.tab !== c.id) run("tab.move", { id: d.tab, index: s.tabs.findIndex((x) => x.id === c.id) + 1 });
            })
            .child(this.dot(t, c.status, 6))
            .when(Boolean(program?.icon), (el) => el.child(program.tint
              ? svg(program.icon).size(15).flex_none().text_color(focused ? t.foreground : t.muted)
              : image(program.icon).size(15).flex_none()))
            .child(div().flex_1().min_w(0).truncate().text_size(13.5).text_color(focused ? t.foreground : t.muted).child(name))
            .when(over && !this.drag, (el) => el.child(this.iconButton(t, `dock-tab-close-${c.id}`, "×", () => closeTab(c.id))))
            .when(Boolean(st) && !(over && !this.drag), (el) => el.child(div().flex_none().text_size(11.5).text_color(t[st.key] ?? t.dim).child(c.status === "blocked" ? st.label : ago(since))));
        })));
    };

    const footerButton = (id, glyph, label, action) =>
      h_flex().id(id).h(36).px(8).gap(10).items_center().rounded(10).text_color(t.dim)
        .hover((x) => x.bg(t.hover).text_color(t.foreground)).on_click(action)
        .child(div().w(30).flex_none().flex().justify_center().text_size(15).child(glyph))
        .child(div().text_size(13.5).truncate().child(label));

    return v_flex().id("dock-root").w(SIDEBAR.open).py(10)
      .on_mouse_up("left", () => { this.drag = null; }).px(open ? 10 : 4).gap(6)
      .when(this.docked, (el) => el.opacity(this.faded ? 0 : 1).transition("opacity", { duration: 180, easing: "ease-out" }).h_full().bg(t.popover).rounded(16).border(1).border_color(t.border).overflow_y_scrollbar())
      .child(
        h_flex().id("dock-head").h(30).px(8).items_center().gap(10)
          .child(div().w(30).flex_none().flex().justify_center().child(svg("mods/workspace-chrome/layers.svg").size(15).text_color(t.dim)))
          .child(div().flex_1().text_size(11).font_semibold().text_color(t.dim).child("SPACES"))
          .when(blockedTotal > 0, (el) => el.child(div().flex_none().px(6).h(16).flex().items_center().rounded(8).bg(t.blocked + "26").text_size(10).font_semibold().text_color(t.blocked).child(`${blockedTotal}`)))
          .child(this.iconButton(t, "dock-pin", pinned ? "◧" : "◨", () => this.setPinned(!pinned))))
      .children(all.map(row))
      .child(div().h(1).mx(8).my(2).bg(t.border))
      .child(footerButton("dock-new", "+", "New space", () => run("space.new")));
  }
}
