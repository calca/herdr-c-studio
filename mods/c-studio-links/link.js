// ⌘-click in a terminal: code files open in VS Code at the clicked line,
// images and PDFs in Quick Look. Remote terminals keep Herdr's own handling.

import { exec } from "herdr";

const PREVIEW = /\.(png|jpe?g|gif|webp|svg|heic|bmp|tiff?|pdf)$/i;

export async function handleLink({ link, source }) {
  if (link.kind !== "file" || !link.path || source.machine) return "pass";
  if (PREVIEW.test(link.path)) {
    // Quick Look stays open until closed, so start it in the background.
    await exec("sh", ["-c", 'qlmanage -p "$1" >/dev/null 2>&1 &', "sh", link.path]);
    return "handled";
  }
  const at = link.line ? [link.line, link.column ?? 1] : null;
  const target = `vscode://file${encodeURI(link.path)}${at ? `:${at[0]}:${at[1]}` : ""}`;
  const r = await exec("open", [target]);
  return r.code === 0 ? "handled" : "pass";
}
