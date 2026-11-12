import { View, div, svg } from "gpui-kit";
import { h_flex } from "gpui-base";
import { spaces, agents, theme, run, window, keys } from "herdr";

export default class WorkspaceStatus extends View {
  // The palette key as actually bound, not a hardcoded one; without a
  // binding the hint stays useful ("commands") instead of lying.
  hint(t) {
    const mac = window()?.platform === "macos";
    const mod = { cmd: mac ? "⌘" : "Ctrl+", ctrl: mac ? "⌃" : "Ctrl+", shift: mac ? "⇧" : "Shift+", alt: mac ? "⌥" : "Alt+", option: mac ? "⌥" : "Alt+" };
    const b = keys().find((k) => k.action === "mod.open:studio-palette") ?? keys().find((k) => k.section === "global" && k.action === "app.palette");
    const parts = b && b.keys.endsWith("--") ? [...b.keys.slice(0, -2).split("-"), "-"] : b?.keys.split("-");
    const key = parts && parts.map((p) => mod[p.toLowerCase()] ?? p.toUpperCase()).join("");
    return key ? `${key}  search` : "search";
  }

  // Cycles through the agents in one state, starting after the focused one.
  goTo(match) {
    const list = agents().filter(match);
    if (!list.length) return;
    const at = list.findIndex((a) => a.focused);
    const a = list[(at + 1) % list.length];
    run("tab.select", { id: a.tab });
    run("pane.focus", { pane: a.pane });
  }

  copyBranch(branch, cx) {
    cx.write_to_clipboard(branch);
    this.copied = true;
    cx.notify();
    cx.timer.after(1200, (c) => { this.copied = false; c.notify(); });
  }

  render(cx) {
    const t = theme();
    const space = spaces().find(s => s.active);
    const list = agents();
    const count = (st) => list.filter(a => a.status === st).length;
    const working = count("working"), needs = count("blocked");
    const idle = list.length - working - needs;
    const click = (el, id, action) => el.id(id).h(24).px(8).rounded(7).cursor_pointer()
      .hover((s) => s.bg(t.hover)).on_click((_e, cx) => action(cx));
    const label = (icon, text) => h_flex().gap(6).items_center().child(svg(`mods/workspace-chrome/${icon}.svg`).size(13)).child(text);
    const pill = (id, color, text, match) => click(h_flex().gap(6).items_center(), id, () => this.goTo(match))
      .child(div().size(6).rounded(3).bg(color)).child(div().text_color(color).child(text));
    return h_flex().size_full().px(8).gap(6).items_center().text_size(12.5).text_color(t.muted)
      .child(div().px(8).child(label(space?.machine ? "server" : "monitor", space?.machine ?? "This computer")))
      .when(Boolean(space?.branch), el => el.child(click(div(), "status-branch", (cx) => this.copyBranch(space.branch, cx))
        .flex().items_center().child(label("branch", this.copied ? "Copied" : space.branch))))
      .child(div().flex_1())
      .when(working > 0, el => el.child(pill("status-working", t.working, `${working} working`, (a) => a.status === "working")))
      .when(needs > 0, el => el.child(pill("status-needs", t.blocked, `${needs} needs you`, (a) => a.status === "blocked")))
      .when(idle > 0 || list.length === 0, el => el.child(pill("status-idle", t.dim, list.length === 0 ? "no agents" : `${idle} idle`,
        (a) => a.status !== "working" && a.status !== "blocked")))
      .child(click(div(), "status-palette", () => run("mod.open", { name: "studio-palette" }))
        .flex().items_center().text_color(t.dim).child(this.hint(t)));
  }
}
