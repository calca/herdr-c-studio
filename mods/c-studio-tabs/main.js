import { View, div, svg, image } from "gpui-kit";
import { h_flex, ScrollHandle } from "gpui-base";
import { spaces, panes, run, openOverlay, theme, window, shared, setShared, layout, focused, nextCommand, agents } from "herdr";
import { glass, find, panelShown, showPanel, togglePanel, pinDock, tabName, newTerminal, spaceColor, closeTab, programIcon, isPinned, togglePin, keepPinnedFirst } from "./kit.js";

const WIDE_AT = 1500;
const NARROW_AT = 1400;
const PANEL_MIN = 1100;
const SWIPE = 80;
const MAX_TABS = 4;
const RECENT = "c-studio.recent";
const SWITCH = "c-studio-switch";
const PANELS = [["files", "F", "Files  ⇧⌘E"], ["changes", "C", "Changes  ⇧⌘G"]];

// The selected look: 65% glass mixed with a little of the space color.
function selectedBg(t) {
  const space = spaces().find(p => p.active);
  const g = glass(t, 0.65);
  if (!space) return g;
  const c = spaceColor(t, space);
  const mix = (i) => Math.round(parseInt(g.slice(i, i + 2), 16) * 0.82 + parseInt(c.slice(i, i + 2), 16) * 0.18).toString(16).padStart(2, "0");
  return "#" + mix(1) + mix(3) + mix(5) + g.slice(7, 9);
}

// A round button that behaves like a tab: 60% glass, 65% under the pointer, tinted when on.
function round(t, id, on = false) {
  return div().id(id).size(38).flex().flex_none().items_center().justify_center().rounded(19)
    .bg(on ? selectedBg(t) : glass(t, 0.6)).text_color(on ? t.foreground : t.muted).cursor_pointer()
    .when(!on, el => el.hover(s => s.bg(glass(t, 0.65)).text_color(t.foreground)));
}

export default class Tabs extends View {
  init(_props, cx) {
    this.pressed = null;
    if (shared(SWITCH)) setShared(SWITCH, null);
    cx.spawn(async (c) => {
      for (;;) {
        const cmd = await nextCommand();
        if (cmd === "new") this.newTab();
        else if (cmd === "close") closeTab(focused()?.tab);
        else if (cmd === "files" || cmd === "changes") togglePanel(cmd);
        else if (cmd === "waiting") this.nextWaiting();
        else if (cmd === "pin") togglePin(focused()?.tab);
        else if (cmd === "switch" || cmd === "switch_back") this.switcher(cmd === "switch" ? 1 : -1);
        c.notify();
      }
    });
    this.scroll = ScrollHandle.new();
    this.panels = JSON.parse(localStorage.getItem("panels") ?? "{}");
  }

  // The next agent that needs you, in any space; from the focused one onwards.
  nextWaiting() {
    const list = agents().filter((a) => a.status === "blocked");
    if (!list.length) return;
    const a = list[(list.findIndex((a) => a.focused) + 1) % list.length];
    run("tab.select", { id: a.tab });
    run("pane.focus", { pane: a.pane });
  }

  // ctrl+tab: open the recent-tabs switcher, or step it when it is already open.
  switcher(step) {
    const open = shared(SWITCH);
    if (open?.overlay) {
      if (open.by === "switch" && Date.now() - open.at < 50) return;
      return setShared(SWITCH, { ...open, step: (open.step ?? 0) + step, by: "tabs", at: Date.now() });
    }
    setShared(SWITCH, { step });
    run("mod.open", { name: "c-studio-switch" });
  }

  // Most recently used tabs, newest first, across spaces.
  trackRecent() {
    const tab = spaces().find((s) => s.active)?.tabs.find((c) => c.active)?.id;
    const list = shared(RECENT) ?? [];
    if (tab && list[0] !== tab) setShared(RECENT, [tab, ...list.filter((id) => id !== tab)].slice(0, 30));
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
      return round(t, `panel-${id}`, on).tooltip(tip).text_size(12.5).font_medium()
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

  // Shows or hides the spaces dock (⌘B); on, the icon takes the space color.
  dockToggle(t, pinned) {
    const space = spaces().find(p => p.active);
    return round(t, "dock-toggle", pinned).when(pinned && Boolean(space), el => el.text_color(spaceColor(t, space)))
      .on_mouse_down("left", (_e, cx) => cx.stop_propagation()).on_click(() => pinDock(!pinned))
      .child(svg("mods/workspace-chrome/layers.svg").size(15));
  }

  render() {
    const t = theme();
    const space = spaces().find(p => p.active);
    this.syncPanel(space, PANELS.map(([id]) => id));
    this.trackRecent();
    keepPinnedFirst();
    const w = window();
    // No sidebar column: the dock floats, so the tab bar always clears the traffic lights.
    const lightsPadding = w?.platform === "macos" && w.titlebar === "none" && !w.fullscreen ? 96 : 16;
    if (shared("dock.pinned") === true) return h_flex().id("c-studio-tabs-pinned").size_full().pt(10).pr(16).pl(lightsPadding).gap(4).items_center()
      .on_size_change((size) => { this.autoDock(size); this.autoPanel(size); })
      .child(this.dockToggle(t, true))
      .child(div().flex_1())
      .children(this.pills(t));
    // At most MAX_TABS in the tray, the active one always among them; the rest are in ⌄.
    const tabs = space?.tabs ?? [];
    const at = tabs.findIndex(tab => tab.active);
    const shown = tabs.length <= MAX_TABS ? tabs
      : at < MAX_TABS ? tabs.slice(0, MAX_TABS) : [...tabs.slice(0, MAX_TABS - 1), tabs[at]];
    const more = tabs.length - shown.length;
    const active = shown.findIndex(tab => tab.active);
    const selected = shown[active]?.id;
    if (selected !== this.selected || active !== this.selectedIndex) {
      this.selected = selected;
      this.selectedIndex = active;
      if (active >= 0) this.scroll.scroll_to_item(active);
    }
    const stop = (_e, cx) => cx.stop_propagation();
    const button = (id, label, action) => div().id(id).size(26).flex_none().flex().items_center().justify_center().rounded(6).text_color(t.dim).hover(s => s.bg(t.foreground + "14").text_color(t.foreground))
      .on_mouse_down("left", stop).on_click(action).child(label);
    const all = panes();
    const hidden = (c) => all.filter(p => p.tab === c.id).length - 1;
    const item = (c, i) => {
      const { name, program } = tabName(c, all);
      // Pinned: just the icon, like Safari; the name is in the tooltip.
      const pin = isPinned(c.id);
      return h_flex().id(`tab-${c.id}`).h(38).px(pin ? 12 : 14).gap(7).when(pin, el => el.tooltip(name)).rounded(19).items_center().flex_none().text_size(14)
        // A rename or status dot on this or an earlier tab can push the active one out.
        .on_size_change((size, cx) => {
          this.widths[c.id] = size.width;
          if (i <= active) this.scroll.scroll_to_item(active);
          cx.notify();
        })
        .relative().text_color(c.active ? t.foreground : t.muted)
        .bg(glass(t, 0.6)).hover(s => s.bg(glass(t, 0.65)))
        .on_mouse_down("left", (e, cx) => { cx.stop_propagation(); this.pressed = i; if (e.click_count === 2) run("tab.rename", { id: c.id }); })
        .on_mouse_up("left", () => {
          const from = this.pressed; this.pressed = null;
          if (from !== null && from !== i) run("tab.move", { id: shown[from].id, index: space.tabs.findIndex(x => x.id === c.id) + 1 });
          else run("tab.select", { id: c.id });
        })
        .on_mouse_down("right", (_e, cx) => { cx.stop_propagation(); openOverlay({ mod: "c-studio-menu", kind: "popup", width: 200, props: { target: { id: c.id, space: space.id } } }); })
        // Spinner and dot share one box, so the pill keeps its width when an agent starts working.
        .when(["working", "blocked", "done"].includes(c.status), el => el.child(div().size(14).flex_none().flex().items_center().justify_center()
          .child(c.status === "working"
            ? svg("mods/workspace-chrome/spinner.svg").size(14).text_color(t.working).spin(900)
            : div().size(6).rounded(3).bg(t[c.status]))))
        .when(Boolean(program?.icon), el => el.child(programIcon(program, 16, c.active && pin ? t.foreground : t.muted)))
        .when(pin && !program?.icon, el => el.child(svg("mods/workspace-chrome/pin.svg").size(14)))
        .when(!pin && (!compact || c.active), el => el.child(div().max_w(170).truncate().child(name)))
        // Zoomed: one pane shown, the rest hidden behind it. Click the badge to show them all.
        .when(c.zoomed && hidden(c) > 0, el => el.child(h_flex().id(`zoom-${c.id}`).h(18).px(6).gap(3).items_center().rounded(9).flex_none()
          .bg(t.dim + "26").text_size(11.5).font_medium().text_color(t.muted).hover(s => s.text_color(t.foreground))
          .on_mouse_down("left", stop)
          .on_click((_e, cx) => { cx.stop_propagation(); const z = all.find(p => p.tab === c.id && p.zoomed); if (z) run("pane.zoom", { pane: z.pane }); })
          .child(svg("mods/c-studio-pane/unzoom.svg").size(11)).child(`${hidden(c)}`)))
        .when(c.active, el => el.bg(selectedBg(t)).font_semibold())
        .when(c.active && !pin, el => el.child(div().id(`close-${c.id}`).text_color(t.dim).on_mouse_down("left", stop).on_click((_e, cx) => { cx.stop_propagation(); closeTab(c.id); }).child(svg("mods/pane/close.svg").size(13))));
    };
    const compact = (this.size?.width ?? 1200) < 900;
    const widths = this.widths ?? (this.widths = {});
    const content = shown.reduce((sum, c) => sum + (widths[c.id] ?? 0) + 4, -4);
    const overflow = more > 0 || content > (this.view ?? Infinity) + 1;
    // Tabs sit centered in one rounded tray; the panel toggles keep to the right.
    return h_flex().id("c-studio-tabs").size_full().min_w(0).pt(10).pr(16).pl(lightsPadding).gap(4).items_center()
      .on_size_change((size, cx) => {
        this.autoDock(size);
        this.autoPanel(size);
        if ((size.width < 900) !== compact || !this.size) { this.size = size; cx.notify(); } else this.size = size;
      })
      .on_mouse_up("left", () => { this.pressed = null; })
      .on_scroll_wheel(e => this.wheel(e))
      .child(h_flex().flex_1().min_w(0).items_center()
        .child(this.dockToggle(t, false)))
      .child(h_flex().id("tab-tray").flex_shrink(1).min_w(0).h(38).gap(4).items_center().rounded(19)
        .child(h_flex().id("tab-scroll").flex_shrink(1).min_w(0).h_full().items_center().gap(4).overflow_x_scrollbar().track_scroll(this.scroll)
          .on_size_change((size, cx) => { this.view = size.width; if (active >= 0) this.scroll.scroll_to_item(active); cx.notify(); })
          .children(shown.map(item))))
      .when(overflow, el => el.child(round(t, "tab-more").relative().on_mouse_down("left", stop)
        .on_click(() => { setShared("c-studio-palette.space", space?.id ?? null); run("mod.open", { name: "c-studio-palette" }); })
        // The hidden count sits inside the button: a translucent badge over it would show a crescent.
        .when(more > 0, b => b.w(54).gap(3).child(div().text_size(12.5).child(`${more}`)))
        .child(svg("mods/workspace-chrome/chevron-down.svg").size(more > 0 ? 12 : 14))))
      .child(round(t, "tab-new").text_size(17).on_mouse_down("left", stop).on_click(() => this.newTab()).child("+"))
      .child(h_flex().flex_1().min_w(0).gap(6).items_center().justify_end().children(this.pills(t)))
      .when(w?.buttons, el => el.child(button("minimize", w.platform === "windows" ? svg("mods/c-studio-tabs/win-min.svg").size(16) : "−", () => run("window.minimize")))
        .child(button("maximize", w.platform === "windows" ? svg(`mods/c-studio-tabs/${w.maximized ? "win-restore" : "win-max"}.svg`).size(16) : "□", () => run("window.maximize")))
        .child(button("close-window", w.platform === "windows" ? svg("mods/c-studio-tabs/win-close.svg").size(16) : svg("mods/pane/close.svg").size(13), () => run("window.close"))));
  }
}
