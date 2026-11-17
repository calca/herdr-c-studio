import { View, div, svg, image } from "gpui-kit";
import { h_flex, ScrollHandle } from "gpui-base";
import { spaces, panes, run, openOverlay, theme, window, shared, layout, focused, nextCommand } from "herdr";
import { find, panelShown, showPanel, togglePanel, pinDock, tabName, newTerminal, spaceColor } from "./kit.js";

const WIDE_AT = 1500;
const NARROW_AT = 1400;
const PANEL_MIN = 1100;
const SWIPE = 80;
const PANELS = [["files", "F", "Files  ⇧⌘E"], ["changes", "C", "Changes  ⇧⌘G"]];

export default class Tabs extends View {
  init(_props, cx) {
    this.pressed = null;
    cx.spawn(async (c) => {
      for (;;) {
        const cmd = await nextCommand();
        if (cmd === "new") this.newTab();
        else if (cmd === "files" || cmd === "changes") togglePanel(cmd);
        c.notify();
      }
    });
    this.scroll = ScrollHandle.new();
    this.panels = JSON.parse(localStorage.getItem("panels") ?? "{}");
  }

  newTab() {
    const f = focused();
    newTerminal(f?.space, f?.cwd);
  }

  // The side panel is remembered per space: switching shows that space's choice
  // (closed if it never had one), and opening or closing it records it.
  syncPanel(space, enabled) {
    if (!space || !find(layout(), "panel")) return;
    const now = panelShown();
    if (space.id !== this.space) {
      const first = this.space === undefined;
      this.space = space.id; this.pending = null;
      if (!(first && !(space.id in this.panels))) {
        const stored = this.panels[space.id] ?? null, want = enabled.includes(stored) ? stored : null;
        if (want !== now) {
          this.pending = { want, until: Date.now() + 1000 };
          showPanel(want);
          return;
        }
      }
    }
    // Until the restore lands (or something else won), the old state isn't a choice.
    if (this.pending) {
      if (this.pending.want !== now && Date.now() < this.pending.until) return;
      this.pending = null;
    }
    if (this.panels[space.id] === now) return;
    this.panels[space.id] = now;
    localStorage.setItem("panels", JSON.stringify(this.panels));
  }

  // Shrinking the window under PANEL_MIN folds the side panel away; opening it there stays allowed.
  autoPanel(size) {
    const narrow = size.width < PANEL_MIN;
    if (narrow && this.narrow === false && panelShown()) showPanel(null);
    this.narrow = narrow;
  }

  pills(t) {
    if (!find(layout(), "panel")) return [];
    const shownPanel = panelShown();
    return PANELS.map(([id, label, tip]) => {
      const on = shownPanel === id;
      return div().id(`panel-${id}`).size(26).flex().flex_none().items_center().justify_center().rounded(13)
        .tooltip(tip).text_size(12.5).font_medium().bg(on ? t.selected : t.canvas).text_color(on ? t.foreground : t.muted)
        .cursor_pointer().hover(s => s.bg(t.hover))
        .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
        .on_click(() => togglePanel(id)).child(label);
    });
  }

  // A wheel notch switches one tab; a trackpad needs SWIPE px of vertical travel
  // per tab, counted afresh each gesture, so a flick doesn't fly past several.
  wheel(e) {
    if (Math.abs(e.delta.y) <= Math.abs(e.delta.x)) return;
    if (e.delta_lines) return run(e.delta.y > 0 ? "tab.prev" : "tab.next");
    if (e.touch_phase === "started") this.swipe = 0;
    this.swipe = (this.swipe ?? 0) + e.delta.y;
    if (Math.abs(this.swipe) < SWIPE) return;
    run(this.swipe > 0 ? "tab.prev" : "tab.next");
    this.swipe = 0;
  }

  autoDock(size) {
    const wide = this.wide === undefined ? size.width >= WIDE_AT : size.width >= (this.wide ? NARROW_AT : WIDE_AT);
    if (wide === this.wide) return;
    this.wide = wide;
    pinDock(wide);
  }

  render() {
    const t = theme();
    const space = spaces().find(p => p.active);
    this.syncPanel(space, PANELS.map(([id]) => id));
    if (shared("dock.pinned") === true) return h_flex().id("c-studio-tabs-pinned").size_full().pt(10).pr(16).gap(4).items_center().justify_end()
      .on_size_change((size) => { this.autoDock(size); this.autoPanel(size); })
      .children(this.pills(t));
    const shown = space?.tabs ?? [];
    const active = shown.findIndex(tab => tab.active);
    const selected = shown[active]?.id;
    if (selected !== this.selected || active !== this.selectedIndex) {
      this.selected = selected;
      this.selectedIndex = active;
      if (active >= 0) this.scroll.scroll_to_item(active);
    }
    const stop = (_e, cx) => cx.stop_propagation();
    const button = (id, label, action) => div().id(id).size(26).flex_none().flex().items_center().justify_center().rounded(6).text_color(t.dim).hover(s => s.bg(t.hover).text_color(t.foreground))
      .on_mouse_down("left", stop).on_click(action).child(label);
    const all = panes();
    const tint = space ? spaceColor(t, space) + "1F" : t.selected;
    const item = (c, i) => {
      const { name, program } = tabName(c, all);
      return h_flex().id(`tab-${c.id}`).h(30).px(13).gap(7).rounded(15).items_center().flex_none().text_size(14)
        // A rename or status dot on this or an earlier tab can push the active one out.
        .when(i <= active, el => el.on_size_change((_size, cx) => { this.scroll.scroll_to_item(active); cx.notify(); }))
        .relative().text_color(c.active ? t.foreground : t.muted)
        .hover(s => s.bg(t.hover))
        .on_mouse_down("left", (e, cx) => { cx.stop_propagation(); this.pressed = i; if (e.click_count === 2) run("tab.rename", { id: c.id }); })
        .on_mouse_up("left", () => {
          const from = this.pressed; this.pressed = null;
          if (from !== null && from !== i) run("tab.move", { id: shown[from].id, index: space.tabs.findIndex(x => x.id === c.id) + 1 });
          else run("tab.select", { id: c.id });
        })
        .on_mouse_down("right", (_e, cx) => { cx.stop_propagation(); openOverlay({ mod: "menu", kind: "popup", width: 200, props: { tab: "tab", target: { id: c.id, space: space.id } } }); })
        .when(c.status === "working", el => el.child(svg("mods/workspace-chrome/spinner.svg").size(14).flex_none().text_color(t.working).spin(900)))
        .when(c.status === "blocked" || c.status === "done", el => el.child(div().size(6).rounded(3).bg(t[c.status])))
        .when(Boolean(program?.icon), el => el.child(program.tint ? svg(program.icon).size(16).text_color(t.muted) : image(program.icon).size(16)))
        .when(!compact || c.active, el => el.child(div().max_w(170).truncate().child(c.zoomed ? `${name} Z` : name)))
        .when(c.active, el => el.bg(tint).font_semibold())
        .when(c.active, el => el.child(div().id(`close-${c.id}`).text_color(t.dim).on_mouse_down("left", stop).on_click((_e, cx) => { cx.stop_propagation(); run("tab.close", { id: c.id }); }).child(svg("mods/pane/close.svg").size(13))));
    };
    const w = window();
    // No sidebar column: the dock floats, so the tab bar always clears the traffic lights.
    const lightsPadding = w?.platform === "macos" && w.titlebar === "none" && !w.fullscreen ? 96 : 16;
    const compact = (this.size?.width ?? 1200) < 900;
    return h_flex().id("c-studio-tabs").size_full().min_w(0).pt(10).pr(16).pl(lightsPadding).gap(4).items_center().bg(t.canvas)
      .on_size_change((size, cx) => {
        this.autoDock(size);
        this.autoPanel(size);
        if ((size.width < 900) !== compact || !this.size) { this.size = size; cx.notify(); } else this.size = size;
      })
      .on_mouse_up("left", () => { this.pressed = null; })
      .on_scroll_wheel(e => this.wheel(e))
      .child(h_flex().id("tab-scroll").flex_1().min_w(0).h_full().items_center().gap(3).overflow_x_scrollbar().track_scroll(this.scroll)
        .on_size_change((_size, cx) => { if (active >= 0) { this.scroll.scroll_to_item(active); cx.notify(); } })
        .children(shown.map(item)))
      .child(button("tab-new", "+", () => this.newTab()))
      .children(this.pills(t))
      .when(w?.buttons, el => el.child(button("minimize", w.platform === "windows" ? svg("mods/c-studio-tabs/win-min.svg").size(16) : "−", () => run("window.minimize")))
        .child(button("maximize", w.platform === "windows" ? svg(`mods/c-studio-tabs/${w.maximized ? "win-restore" : "win-max"}.svg`).size(16) : "□", () => run("window.maximize")))
        .child(button("close-window", w.platform === "windows" ? svg("mods/c-studio-tabs/win-close.svg").size(16) : svg("mods/pane/close.svg").size(13), () => run("window.close"))));
  }
}
