import { View, div, svg } from "gpui-kit";
import { h_flex } from "gpui-base";
import { spaces, agents, panes, focused, exec, theme, run, window, keys, shared, setShared, notify, readTextFile, appHome, checking, openOverlay } from "herdr";
import { togglePanel, moveTab } from "./kit.js";

const EMPTY_TREE = "4b825dc642cb6eb9a060e54bf8d69288fbee4904";
// Space color -> theme variant, so the focus border (accent) follows the space.
const ACCENT = { ansi6: "teal", ansi3: "orange", ansi4: "blue", ansi5: "violet", ansi2: "green", ansi1: "pink" };

// Update notice: install.sh writes c-studio.json ({version, source}); tags of the source
// clone (else GitHub's) say whether a newer release exists.
const REPO = "calca/herdr-c-studio";
const UPDATE = "c-studio-update";
const CHECK_EVERY = 6 * 3600 * 1000;
const semver = (v) => (/^v?(\d+)\.(\d+)\.(\d+)$/.exec((v ?? "").trim()) ?? []).slice(1).map(Number);
function newer(a, b) {
  const x = semver(a), y = semver(b);
  if (x.length < 3 || y.length < 3) return false;
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] > y[i];
  return false;
}
// The CHANGELOG sections after the installed version, as plain text.
function notesSince(md, installed) {
  return md.split(/^## /m).slice(1).filter((sec) => newer(/^\[?([\d.]+)/.exec(sec)?.[1], installed))
    .map((sec) => sec.replace(/\*\*/g, "").trim()).join("\n\n").slice(0, 6000) || null;
}

const READ = ["--no-optional-locks", "-c", "core.fsmonitor=false", "-c", "diff.autoRefreshIndex=false"];

export default class WorkspaceStatus extends View {
  init(_props, cx) {
    this.diff = null;
    // Git polls only while the window shows; it catches up within 5 s of coming back.
    cx.timer.every(5000, (c) => { if (window()?.visible !== false) this.refresh(c); });
    cx.timer.every(250, () => { if (window()?.visible !== false) this.syncAccent(); });
    if (!checking()) {
      cx.timer.after(8000, (c) => this.checkUpdate(c));
      cx.timer.every(30 * 60 * 1000, (c) => this.checkUpdate(c));
    }
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

  async checkUpdate(cx) {
    const st = shared(UPDATE);
    if (this.checkingUpdate || (st?.checked_at && Date.now() - st.checked_at < CHECK_EVERY)) return;
    this.checkingUpdate = true;
    try {
      let inst = null;
      try { inst = JSON.parse(await readTextFile(`${appHome()}/c-studio.json`) ?? "null"); } catch { inst = null; }
      if (!inst?.version) return;
      const run = (cmd, args, timeout = 20000) => exec(cmd, args, { timeout }).catch(() => ({ code: 1, stdout: "", stderr: "" }));
      let tags = [], git = false;
      if (inst.source) {
        await run("git", ["-C", inst.source, "fetch", "-q", "--tags"]);
        const r = await run("git", ["-C", inst.source, "tag", "-l", "v*"], 5000);
        if (r.code === 0) { git = true; tags = r.stdout.split("\n"); }
      }
      if (!git) {
        const r = await run("curl", ["-fsSL", "--max-time", "10", `https://api.github.com/repos/${REPO}/tags`]);
        try { if (r.code === 0) tags = JSON.parse(r.stdout).map((x) => x.name); } catch { tags = []; }
      }
      const latest = tags.map((x) => x.trim()).filter((x) => semver(x).length === 3)
        .reduce((best, x) => (!best || newer(x, best) ? x : best), null);
      let notes = null;
      if (latest && newer(latest, inst.version)) {
        const log = git ? await run("git", ["-C", inst.source, "show", `${latest}:CHANGELOG.md`], 5000)
          : await run("curl", ["-fsSL", "--max-time", "10", `https://raw.githubusercontent.com/${REPO}/${latest}/CHANGELOG.md`]);
        notes = log.code === 0 ? notesSince(log.stdout, inst.version) : null;
      }
      setShared(UPDATE, {
        checked_at: Date.now(), installed: inst.version, source: git ? inst.source : null, notes,
        latest: latest && newer(latest, inst.version) ? latest.replace(/^v/, "") : null,
      });
    } finally {
      this.checkingUpdate = false;
      cx.notify();
    }
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
    // Tab moves asked for by short-lived overlays (the palette) run here, where a copy stays.
    const move = shared("c-studio.move");
    if (move) {
      setShared("c-studio.move", null);
      cx.spawn(async (c) => { await moveTab(move.tab, move.space); c.notify(); });
    }
    if (JSON.stringify(this.where()) !== this.at) this.refresh(cx);
    const space = spaces().find(s => s.active);
    const update = shared(UPDATE);
    const list = agents();
    const count = (st) => list.filter(a => a.status === st).length;
    const working = count("working"), needs = count("blocked");
    const idle = list.length - working - needs;
    // On the glass the theme's muted grey sinks into the desktop: a softened foreground reads better.
    const soft = t.foreground + "c0";
    const click = (el, id, action) => el.id(id).h(24).px(8).rounded(7).cursor_pointer()
      .hover((s) => s.bg(t.hover)).on_click((_e, cx) => action(cx));
    const label = (icon, text) => h_flex().gap(6).items_center().child(svg(`mods/workspace-chrome/${icon}.svg`).size(13)).child(text);
    const pill = (id, color, text, match) => click(h_flex().gap(6).items_center(), id, () => this.goTo(match))
      .child(div().size(6).rounded(3).bg(color)).child(div().text_color(color).child(text));
    return h_flex().size_full().px(8).gap(6).items_center().text_size(12.5).text_color(soft)
      .child(space?.machine
        ? div().px(8).child(label("server", space.machine))
        : div().id("status-machine").h(24).px(8).flex().items_center().tooltip("This computer").child(svg("mods/workspace-chrome/monitor.svg").size(13)))
      .when(Boolean(space?.branch), el => el.child(click(div(), "status-branch", (cx) => this.copyBranch(space.branch, cx))
        .flex().items_center().child(label("branch", this.copied ? "Copied" : space.branch))))
      .when(Boolean(this.diff && (this.diff.plus || this.diff.minus || this.diff.fresh)), el => el.child(click(h_flex().gap(5).items_center(), "status-diff", () => togglePanel("changes"))
        .when(this.diff.plus > 0 || this.diff.minus > 0, (d) => d
          .child(div().text_color(t.ansi2 ?? t.done).child(`+${this.diff.plus}`))
          .child(div().text_color(t.ansi1 ?? t.blocked).child(`−${this.diff.minus}`)))
        .when(this.diff.fresh > 0, (d) => d.child(div().text_color(soft).child(`${this.diff.fresh} new`)))))
      .when(Boolean(this.diff?.ahead || this.diff?.behind), el => el.child(click(h_flex().gap(5).items_center(), "status-sync", (cx) => this.sync(cx))
        .tooltip(this.diff.behind > 0 ? "Pull (fast-forward)" : "Push")
        .when(this.syncing, (d) => d.child(svg("mods/workspace-chrome/spinner.svg").size(12).spin(1200)))
        .when(this.diff.ahead > 0, (d) => d.child(div().child(`↑${this.diff.ahead}`)))
        .when(this.diff.behind > 0, (d) => d.child(div().child(`↓${this.diff.behind}`)))))
      .child(div().flex_1())
      .when(Boolean(update?.latest && update.latest !== update.skipped), el => el.child(click(h_flex().gap(6).items_center(), "status-update",
        () => openOverlay({ mod: "c-studio-update", kind: "dialog", width: 520, height: 440 })).tooltip("What's new")
        .child(div().size(6).rounded(3).bg(t.accent)).child(div().text_color(t.accent).child(`C-Studio ${update.latest}`))))
      .when(working > 0, el => el.child(pill("status-working", t.working, `${working} working`, (a) => a.status === "working")))
      .when(needs > 0, el => el.child(pill("status-needs", t.blocked, `${needs} needs you`, (a) => a.status === "blocked")))
      .when(idle > 0 || list.length === 0, el => el.child(pill("status-idle", soft, list.length === 0 ? "no agents" : `${idle} idle`,
        (a) => a.status !== "working" && a.status !== "blocked")))
      .child(click(div(), "status-palette", () => run("mod.open", { name: "c-studio-palette" }))
        .flex().items_center().text_color(soft).child(this.hint(t)));
  }
}
