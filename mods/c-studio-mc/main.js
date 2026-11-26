// Mission Control: every agent as a card, grouped by what it needs from you.
// It is a layout of its own (layouts/c-studio-mc.json), so the dock and the
// terminals step aside and the window glass shows behind the cards.
import { View, div, svg, image } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { spaces, agents, panes, run, theme, shared, setShared, window } from "herdr";

const SCOPE = "c-studio-mc.space";
const COLUMNS = [
  ["blocked", "In attesa di te"],
  ["working", "Al lavoro"],
  ["done", "Finiti"],
];

// As kit.js glass(): the dock's frosted fill.
function glass(t, cover = 0.65) {
  const under = parseInt(t.canvas.slice(7, 9) || "ff", 16) / 255;
  const a = under >= 1 ? 0 : Math.max(0, 1 - (1 - cover) / (1 - under));
  return t.canvas.slice(0, 7) + Math.round(a * 255).toString(16).padStart(2, "0");
}

// The icon already says which agent it is.
const title = (a) => (a.pane_name || a.title || a.tab_name).replace(/\s+[-–—]\s+(GitHub Copilot|Claude Code|Codex|Gemini)$/i, "");

function icon(p, size, color) {
  if (!p?.icon) return div().w(size).h(size).flex_none();
  return p.tint ? svg(p.icon).size(size).flex_none().text_color(color) : image(p.icon).w(size).h(size).flex_none();
}

export default class MissionControl extends View {
  init(_props, cx) {
    this.handle = cx.focus_handle();
    this.handle.focus();
    cx.timer.after(40, () => this.handle.focus());
    this.at = 0;
    this.shown = false;
    this.idleOpen = true;
    cx.timer.after(30, (c) => { this.shown = true; c.notify(); });
  }

  close() { run("layout.switch", { name: "c-studio" }); }

  go(a) {
    if (!a) return;
    run("space.select", { id: a.space });
    run("tab.select", { id: a.tab });
    this.close();
  }

  render() {
    const stop = (_e, cx) => cx.stop_propagation();
    const t = theme();
    const scope = shared(SCOPE) ?? null;
    const all = spaces().filter((s) => s.name !== "~" || agents().some((a) => a.space === s.id));
    const list = agents().filter((a) => !scope || a.space === scope).sort((a, b) => b.seq - a.seq);
    const of = (st) => list.filter((a) => a.status === st);
    const cols = COLUMNS.map(([st]) => of(st));
    const idle = of("idle");
    const ordered = [...cols.flat(), ...(this.idleOpen ? idle : [])];
    this.at = Math.max(0, Math.min(this.at, ordered.length - 1));
    const sel = ordered[this.at];
    const fg = t.foreground;
    const byPane = new Map(panes().map((p) => [p.pane, p]));
    const w = window();
    // Full window: clear the traffic lights.
    const lights = w?.platform === "macos" && w.titlebar === "none" && !w.fullscreen ? 96 : 22;
    const where = (a) => {
      const p = byPane.get(a.pane);
      const repo = p?.cwd ? p.cwd.replace(/\/+$/, "").split("/").pop() || "/" : null;
      return repo ? (p.branch ? `${repo} · ${p.branch}` : repo) : `tab ${a.tab_index + 1}`;
    };
    const mark = (st, size) => st === "working"
      ? svg("mods/workspace-chrome/spinner.svg").size(size + 4).flex_none().text_color(t.working).spin(900)
      : div().size(size).rounded(size / 2).flex_none().bg(t[st] ?? t.dim);
    const enter = (el, i) => el.relative().top(this.shown ? 0 : 10).opacity(this.shown ? 1 : 0)
      .transition("opacity", { duration: 260, delay: Math.min(i, 15) * 18, easing: "ease-out" })
      .transition("top", { duration: 320, delay: Math.min(i, 15) * 18, easing: "ease-out" });

    const card = (a) => {
      const on = a === sel;
      const color = t[a.status] ?? t.dim;
      const name = title(a);
      return enter(h_flex().id(`mc-${a.pane}`).w(300).h(68).flex_none().pr(12).gap(12).rounded(12).overflow_hidden().cursor_pointer()
        .bg(on ? fg + "0d" : "#00000018").border(1).border_color(on ? fg + "0d" : fg + "14")
        .hover((s) => s.bg(fg + "0d"))
        .on_mouse_down("left", stop).on_click(() => this.go(a))
        .child(div().ml(8).w(3).h(40).rounded(2).flex_none().bg(color))
        .child(v_flex().flex_1().min_w(0).gap(6)
          .child(h_flex().gap(9).items_center()
            .child(icon(a.program, 17, t.muted))
            .child(div().flex_1().truncate().text_size(14).font_medium().text_color(fg).child(name)))
          .child(h_flex().gap(8).items_center().text_size(11.5).text_color(t.muted)
            .child(div().flex_1().truncate().child(where(a)))
            .child(div().flex_none().text_color(on ? t.muted : t.dim).child(on ? "↩ vai" : scope ? "" : a.space_name)))), ordered.indexOf(a));
    };

    const section = ([st, label], i) => {
      const mine = i < cols.length ? cols[i] : idle;
      if (!mine.length) return null;
      const folded = st === "idle" && !this.idleOpen;
      return v_flex().gap(10)
        .child(h_flex().id(`mc-h-${st}`).gap(8).items_center()
          .when(st === "idle", (el) => el.cursor_pointer().on_mouse_down("left", stop)
            .on_click((_e, cx) => { this.idleOpen = !this.idleOpen; cx.notify(); }))
          .child(mark(st, 8))
          .child(div().text_size(12).font_semibold().text_color(st === "idle" ? t.muted : fg).child(label.toUpperCase()))
          .child(div().text_size(12).font_semibold().text_color(st === "idle" ? t.dim : t[st]).child(String(mine.length)))
          .when(st === "idle", (el) => el.child(svg(`mods/workspace-chrome/chevron-${folded ? "right" : "down"}.svg`).size(12).flex_none().text_color(t.dim))))
        .when(!folded, (el) => el.child(h_flex().flex_wrap().gap(12).children(mine.map(card))));
    };

    const chip = (s) => {
      const on = (s?.id ?? null) === scope;
      return h_flex().id(`mc-f-${s?.id ?? "all"}`).h(38).px(16).items_center().rounded(19).flex_none().cursor_pointer().text_size(14)
        .text_color(on ? fg : t.muted).bg(glass(t, on ? 0.65 : 0.6))
        .when(on, (d) => d.font_medium())
        .hover((h) => h.bg(glass(t, 0.65)).text_color(fg))
        .on_mouse_down("left", stop).on_click((_e, cx) => { setShared(SCOPE, s?.id ?? null); this.at = 0; cx.notify(); })
        .child(s ? s.name : "Tutti");
    };

    return v_flex().id("c-studio-mc").track_focus(this.handle).size_full()
      .on_key_down((e, cx) => {
        const k = e.key, n = Math.max(1, ordered.length);
        if (k === "escape" || (k === "." && e.modifiers.platform)) return this.close();
        if (k === "enter") return this.go(sel);
        if (k === "tab") {
          const ids = [null, ...all.map((s) => s.id)];
          const i = ids.indexOf(scope);
          setShared(SCOPE, ids[(i + (e.modifiers.shift ? -1 : 1) + ids.length) % ids.length]);
          this.at = 0;
        } else if (k === "i") this.idleOpen = !this.idleOpen;
        else if (k === "right" || k === "down") this.at = (this.at + 1) % n;
        else if (k === "left" || k === "up") this.at = (this.at + n - 1) % n;
        else return;
        cx.stop_propagation();
        cx.notify();
      })
      .child(h_flex().h(58).flex_none().pt(10).pl(lights).pr(16).gap(16).items_center()
        .opacity(this.shown ? 1 : 0).transition("opacity", { duration: 220, easing: "ease-out" })
        .child(div().text_size(16).font_semibold().text_color(fg).child("Mission Control"))
        .child(div().flex_1())
        .child(h_flex().gap(4).items_center().child(chip(null)).children(all.map(chip)))
        .child(div().id("mc-x").size(38).flex_none().rounded(19).flex().items_center().justify_center().cursor_pointer()
          .bg(glass(t, 0.6)).text_color(t.muted).hover((h) => h.bg(glass(t, 0.65)).text_color(fg))
          .on_mouse_down("left", stop).on_click(() => this.close()).child(svg("mods/workspace-chrome/x.svg").size(15))))
      // The dark panel, like the spaces dock.
      .child(v_flex().id("mc-panel").flex_1().min_h(0).mt(10).mx(12).mb(12).rounded(16).bg(glass(t))
        .relative().top(this.shown ? 0 : 24).opacity(this.shown ? 1 : 0)
        .transition("opacity", { duration: 220, easing: "ease-out" })
        .transition("top", { duration: 320, easing: "ease-out" })
        .child(v_flex().id("mc-body").flex_1().min_h(0).overflow_y_scroll().px(20).py(18).gap(24)
          .children([...COLUMNS, ["idle", "Inattivi"]].map(section).filter(Boolean))
          .when(!list.length, (el) => el.child(div().text_color(t.muted).child("Nessun agente"))))
        .child(h_flex().h(36).flex_none().px(20).items_center().gap(16).text_size(11.5).text_color(t.muted).border_t(1).border_color(fg + "14")
          .child("↩ vai").child("frecce scegli").child("tab space").child("i inattivi").child("esc chiudi")));
  }
}
