// Shared by the C-Studio mods. Herdr only resolves imports inside a mod's own
// folder, so every mod keeps an identical copy: edit one, then run the repo's
// sync.sh, which refuses to continue while the copies differ.

import { run, panes, layout, shared, setShared, home, spaces } from "herdr";

export const SIDEBAR = { open: 296, peek: 56 };

export function find(node, id) {
  if (node?.id === id) return node;
  for (const child of node?.children ?? []) {
    const found = find(child, id);
    if (found) return found;
  }
  return null;
}

// The Files / Changes side panel: which child is showing, or null when hidden.
export function panelShown() {
  const root = layout(), panel = find(root, "panel");
  if (!panel || panel.hidden) return null;
  return find(root, "panel-body")?.active ?? null;
}

export function showPanel(id) {
  if (id) { run("layout.select", { stack: "panel-body", child: id }); run("layout.show", { id: "panel" }); }
  else run("layout.hide", { id: "panel" });
}

export function togglePanel(id) {
  if (!find(layout(), "panel")) return;
  showPanel(panelShown() === id ? null : id);
}

export function pinDock(pinned) {
  setShared("dock.pinned", pinned);
  run("layout.resize", { id: "sidebar", px: pinned ? SIDEBAR.open : SIDEBAR.peek });
}

// A tab's label: its given name, else the agent session's title, else the
// program (nvim, htop…), and for a plain shell the folder it sits in.
export function tabName(tab, all = panes()) {
  const lead = all.find((p) => p.tab === tab.id && p.program?.agent) ?? all.find((p) => p.tab === tab.id);
  const program = lead?.program ?? null;
  if (tab.named) return { name: tab.name, program };
  if (program?.agent) return { name: lead.title && lead.title !== program.name ? lead.title : program.name, program };
  if (program && !program.shell) return { name: program.name, program };
  return { name: folderName(lead?.cwd) ?? program?.name ?? "Terminal", program };
}

export function folderName(path) {
  if (!path) return null;
  if (path === home()) return "~";
  return path.replace(/\/+$/, "").split("/").pop() || path;
}

// A plain terminal tab, in the given folder (default: the focused terminal's).
// Space colors as Herdr's picker keeps them (shared "space.colors"): a theme
// color name or #rrggbb per space id, new spaces getting the least used one.
export const MARK = { ansi6: "#22a99a", ansi3: "#e3814f", ansi4: "#5b8def", ansi5: "#8b7cf6", ansi2: "#3fae6a", ansi1: "#d9649a" };
export const SPACE_COLORS = ["ansi6", "ansi3", "ansi4", "ansi5", "ansi2", "ansi1"];
export function spaceColor(t, space) {
  if (space.name === "~") return t.dim;
  const ids = new Set(spaces().map((p) => p.id));
  const stored = shared("space.colors") ?? {};
  const kept = Object.fromEntries(Object.entries(stored).filter(([id]) => ids.has(id)));
  let changed = Object.keys(kept).length !== Object.keys(stored).length;
  for (const p of spaces()) {
    if (kept[p.id] || p.name === "~") continue;
    const uses = (c) => Object.values(kept).filter((v) => v === c).length;
    kept[p.id] = SPACE_COLORS.reduce((best, c) => (uses(c) < uses(best) ? c : best));
    changed = true;
  }
  if (changed) setShared("space.colors", kept);
  const c = kept[space.id] ?? SPACE_COLORS[0];
  return c.startsWith("#") ? c : (MARK[c] ?? t[c]);
}

export function setSpaceColor(id, key) {
  setShared("space.colors", { ...(shared("space.colors") ?? {}), [id]: key });
}

export function newTerminal(space, folder) {
  run("tab.new", { space: space ?? undefined, folder: folder ?? undefined });
}

export function openLauncher(space, folder) {
  run("tab.new", { space: space ?? undefined, name: "New tab", mod: "c-studio-launch", props: { space: space ?? undefined, folder: folder ?? undefined } });
}
