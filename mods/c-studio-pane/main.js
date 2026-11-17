// A pane's header, for layouts that frame their panes:
//   { "tab": "active", "pane": { "header": { "content": { "mod": "c-studio-pane" } } } }
// Shows the program's icon (the app's program table), the agent's name or
// the terminal's title, the folder, and the agent's status; buttons split, zoom and close
// this pane. Props from the app: { pane, terminal }. Click: focus the pane.

import { View, div, svg, image } from "gpui-kit";
import { h_flex } from "gpui-base";
import { panes, props, run, theme, home, layout, exec, spaces } from "herdr";

// Match the first visible tab frame, including the active child of a stack.
function paneFrame(node) {
  if (!node || node.hidden) return null;
  if (node.content?.tab && node.content.pane) return node.content.pane;
  let children = node.children ?? [];
  if (node.type === "stack") {
    const visible = children.filter(child => !child.hidden);
    children = [visible.find(child => child.id === node.active) ?? visible[0]];
  }
  for (const child of children) {
    const frame = paneFrame(child);
    if (frame) return frame;
  }
  return null;
}

function icon(p, size, color) {
  if (!p?.icon) return null;
  return p.tint ? svg(p.icon).size(size).flex_none().text_color(color) : image(p.icon).w(size).h(size).flex_none();
}

const MOD_TITLES = { "c-studio-launch": "New tab" };

// machine + cwd -> { root: the git repo's top folder ("" when not in a repo),
// at: when it was asked }. Shared by every header; asked again after ROOT_TTL.
const ROOTS = new Map();
const ROOT_TTL = 30000;

// Inside a repo: "repo/sub/dir"; elsewhere: the path with ~ for home.
function folder(cwd, machine) {
  if (!cwd) return "";
  const root = ROOTS.get(`${machine ?? ""}\u0000${cwd}`)?.root;
  if (root) {
    const name = root.split("/").pop();
    return cwd === root ? name : name + cwd.slice(root.length);
  }
  const h = home();
  return cwd === h ? "~" : cwd.startsWith(h + "/") ? "~" + cwd.slice(h.length) : cwd;
}

export default class Pane extends View {
  init() { this.hovered = false; }

  me() {
    return panes().find((p) => p.pane === props()?.pane);
  }

  button(t, id, icon, command, args) {
    return div()
      .id(id)
      .p(3)
      .rounded(4)
      .text_color(t.dim)
      .hover((s) => s.bg(t.hover).text_color(t.foreground))
      .on_click((_e, cx) => {
        cx.stop_propagation();
        run(command, args);
      })
      .child(svg(`mods/c-studio-pane/${icon}.svg`).size(16));
  }

  root(cwd, machine, cx) {
    if (!cwd) return;
    const key = `${machine ?? ""}\u0000${cwd}`, had = ROOTS.get(key);
    if (had && Date.now() - had.at < ROOT_TTL) return;
    ROOTS.set(key, { root: had?.root ?? "", at: Date.now() });
    cx.spawn(async (c) => {
      try {
        const r = await exec("git", ["--no-optional-locks", "rev-parse", "--show-toplevel"], { cwd, on: machine, timeout: 3000 });
        ROOTS.set(key, { root: r.code === 0 ? r.stdout.trim() : "", at: Date.now() });
      } catch {}
      c.notify();
    });
  }

  render(cx) {
    const t = theme();
    const p = this.me();
    if (!p) return div();
    const machine = spaces().find((s) => s.tabs.some((c) => c.id === p.tab))?.machine ?? null;
    this.root(p.cwd, machine, cx);
    const name = (p.mod && MOD_TITLES[p.mod]) || ((p.program?.agent || p.program?.shell) && p.program.name) || p.title || p.program?.name || "shell";
    const pic = icon(p.program, 16, t.dim);
    const st = p.status;
    const pane = p.pane;
    const bottom = paneFrame(layout())?.header?.position === "bottom";
    const grip = p.movable !== false && !p.zoomed && panes().filter((q) => q.tab === p.tab).length > 1;
    return h_flex()
      .id(`pane-head-${pane}`)
      .size_full()
      .px(10)
      .gap(8)
      .items_center()
      .bg(t.background)
      .when(bottom, el => el.border_t(1))
      .when(!bottom, el => el.border_b(1))
      .border_color(t.border)
      .text_size(13.5)
      .on_hover((hovered, cx) => { this.hovered = hovered; cx.notify(); })
      .on_click(() => run("pane.focus", { pane }))
      .child(h_flex().flex_1().min_w(0).gap(8).items_center()
        .when(Boolean(pic), (el) => el.child(pic))
        .child(div().flex_none().truncate().max_w(260).font_medium().text_color(t.foreground).child(name))
        .child(div().flex_shrink_1().min_w(0).truncate().text_color(t.dim).child(folder(p.cwd, machine)))
        .when(Boolean(p.branch), el => el.child(h_flex().flex_none().gap(4).items_center().text_color(t.dim)
          .child(svg("mods/workspace-chrome/git-branch.svg").size(12)).child(div().max_w(180).truncate().child(p.branch)))))
      // Herdr's pane-drag grip sits at the top center of split tabs: keep that spot clear.
      .when(grip, el => el.child(div().w(64).flex_none()))
      .child(h_flex().when(grip, el => el.flex_1()).when(!grip, el => el.flex_none()).min_w(0).gap(8).items_center().justify_end()
        .when(st === "working", el => el.child(svg("mods/workspace-chrome/spinner.svg").size(14).flex_none().text_color(t.working).spin(900)))
        .when(st === "blocked", el => el.child(div().flex_none().px(6).h(20).flex().items_center().rounded(5).bg(t.blocked + "26").text_size(11.5).font_semibold().text_color(t.blocked).child("Needs you")))
        .when(st === "done", el => el.child(div().size(7).flex_none().rounded(4).bg(t.done)))
        .when(this.hovered, el => el
          .child(this.button(t, `ph-r-${pane}`, "split-right", "pane.split", { direction: "right", pane }))
          .child(this.button(t, `ph-d-${pane}`, "split-down", "pane.split", { direction: "down", pane }))
          .child(this.button(t, `ph-z-${pane}`, p.zoomed ? "unzoom" : "zoom", "pane.zoom", { pane }))
          .child(this.button(t, `ph-x-${pane}`, "close", "pane.close", { pane }))));
  }
}
