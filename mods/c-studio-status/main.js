import { View, div, svg } from "gpui-kit";
import { h_flex } from "gpui-base";
import { spaces, agents, panes, focused, exec, theme, run, window, keys, shared, notify } from "herdr";
import { togglePanel } from "./kit.js";

const EMPTY_TREE = "4b825dc642cb6eb9a060e54bf8d69288fbee4904";
// Space color -> theme variant, so the focus border (accent) follows the space.
const ACCENT = { ansi6: "teal", ansi3: "orange", ansi4: "blue", ansi5: "violet", ansi2: "green", ansi1: "pink" };

const READ = ["--no-optional-locks", "-c", "core.fsmonitor=false", "-c", "diff.autoRefreshIndex=false"];

export default class WorkspaceStatus extends View {
  init(_props, cx) {
    this.diff = null;
    cx.timer.every(5000, (c) => this.refresh(c));
    cx.timer.every(250, () => this.syncAccent());
  }

  // Where git runs: the focused pane's folder, as the Changes panel does.
  where() {
    const space = spaces().find((s) => s.active), f = focused();
    const pane = f?.pane ? panes().find((p) => p.pane === f.pane) : null;
    return { cwd: pane?.cwd || f?.cwd || space?.folder, on: space?.machine ?? null };
  }

  refresh(cx) {
    if (this.busy) return;
    const at = this.where();
    if (!at.cwd) return;
    this.busy = true;
    cx.spawn(async (c) => {
      const opts = { cwd: at.cwd, on: at.on, timeout: 4000 };
      try {
        let r = await exec("git", [...READ, "diff", "--shortstat", "HEAD"], opts);
        // No commit yet: everything tracked counts as added.
        if (r.code !== 0) r = await exec("git", [...READ, "diff", "--shortstat", EMPTY_TREE], opts);
        const out = r.code === 0 ? r.stdout : "";
        const plus = Number(/(\d+) insertion/.exec(out)?.[1] ?? 0), minus = Number(/(\d+) deletion/.exec(out)?.[1] ?? 0);
        const u = r.code === 0 ? await exec("git", [...READ, "ls-files", "--others", "--exclude-standard"], opts) : null;
        const fresh = u?.code === 0 ? u.stdout.split("\n").filter(Boolean).length : 0;
        const ab = r.code === 0 ? await exec("git", [...READ, "rev-list", "--left-right", "--count", "@{u}...HEAD"], opts) : null;
        const [behind, ahead] = ab?.code === 0 ? ab.stdout.trim().split(/\s+/).map(Number) : [0, 0];
        const next = plus || minus || fresh || ahead || behind ? { plus, minus, fresh, ahead, behind } : null;
        if (JSON.stringify(next) !== JSON.stringify(this.diff)) { this.diff = next; c.notify(); }
      } catch {}
      // Even after a failure, so a slow repo is retried by the timer, not on every render.
      this.at = JSON.stringify(at);
      this.busy = false;
    });
  }

  // The palette key as actually bound, not a hardcoded one; without a
  // binding the hint stays useful ("commands") instead of lying.
  hint(t) {
    const mac = window()?.platform === "macos";
    const mod = { cmd: mac ? "⌘" : "Ctrl+", ctrl: mac ? "⌃" : "Ctrl+", shift: mac ? "⇧" : "Shift+", alt: mac ? "⌥" : "Alt+", option: mac ? "⌥" : "Alt+" };
    const b = keys().find((k) => k.action === "mod.open:c-studio-palette") ?? keys().find((k) => k.section === "global" && k.action === "app.palette");
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

  // Behind: fast-forward pull; otherwise push. The result comes back as a toast.
  sync(cx) {
    const at = this.where(), d = this.diff;
    if (!at.cwd || !d || this.syncing) return;
    const pull = d.behind > 0;
    this.syncing = true;
    cx.notify();
    cx.spawn(async (c) => {
      const r = await exec("git", pull ? ["pull", "--ff-only"] : ["push"], { cwd: at.cwd, on: at.on, timeout: 60000 });
      const out = (r.stderr || r.stdout || "").trim().split("\n").pop();
      notify({ title: r.code === 0 ? (pull ? "Pulled" : "Pushed") : (pull ? "Pull failed" : "Push failed"), body: out, level: r.code === 0 ? "success" : "error" });
      this.syncing = false;
      this.at = null;
      c.notify();
    });
  }

  copyBranch(branch, cx) {
    cx.write_to_clipboard(branch);
    this.copied = true;
    cx.notify();
    cx.timer.after(1200, (c) => { this.copied = false; c.notify(); });
  }

  syncAccent() {
    const space = spaces().find((s) => s.active);
    const name = space && space.name !== "~" ? ACCENT[shared("space.colors")?.[space.id]] : null;
    const key = name ?? "";
    if (key === this.accent) return;
    this.accent = key;
    const suffix = name ? `-${name}` : "";
    run("app.theme", { name: `c-studio-dark${suffix}` });
    run("app.theme", { name: `c-studio-light${suffix}` });
  }

  render(cx) {
    const t = theme();
    if (JSON.stringify(this.where()) !== this.at) this.refresh(cx);
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
      .when(Boolean(this.diff && (this.diff.plus || this.diff.minus || this.diff.fresh)), el => el.child(click(h_flex().gap(5).items_center(), "status-diff", () => togglePanel("changes"))
        .when(this.diff.plus > 0 || this.diff.minus > 0, (d) => d
          .child(div().text_color(t.ansi2 ?? t.done).child(`+${this.diff.plus}`))
          .child(div().text_color(t.ansi1 ?? t.blocked).child(`−${this.diff.minus}`)))
        .when(this.diff.fresh > 0, (d) => d.child(div().text_color(t.dim).child(`${this.diff.fresh} new`)))))
      .when(Boolean(this.diff?.ahead || this.diff?.behind), el => el.child(click(h_flex().gap(5).items_center(), "status-sync", (cx) => this.sync(cx))
        .tooltip(this.diff.behind > 0 ? "Pull (fast-forward)" : "Push")
        .when(this.syncing, (d) => d.child(svg("mods/workspace-chrome/spinner.svg").size(12).spin(900)))
        .when(this.diff.ahead > 0, (d) => d.child(div().child(`↑${this.diff.ahead}`)))
        .when(this.diff.behind > 0, (d) => d.child(div().child(`↓${this.diff.behind}`)))))
      .child(div().flex_1())
      .when(working > 0, el => el.child(pill("status-working", t.working, `${working} working`, (a) => a.status === "working")))
      .when(needs > 0, el => el.child(pill("status-needs", t.blocked, `${needs} needs you`, (a) => a.status === "blocked")))
      .when(idle > 0 || list.length === 0, el => el.child(pill("status-idle", t.dim, list.length === 0 ? "no agents" : `${idle} idle`,
        (a) => a.status !== "working" && a.status !== "blocked")))
      .child(click(div(), "status-palette", () => run("mod.open", { name: "c-studio-palette" }))
        .flex().items_center().text_color(t.dim).child(this.hint(t)));
  }
}
