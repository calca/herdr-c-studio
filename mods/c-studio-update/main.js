// What's new in a C-Studio release, and the button that installs it.
import { View, div } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { props, closeOverlay, theme, shared, setShared, exec } from "herdr";

const UPDATE = "c-studio-update";
const REPO = "calca/herdr-c-studio";

export default class StudioUpdate extends View {
  init(_props, cx) {
    this.state = null; // null, "busy", "done", or an error message
    this.handle = cx.focus_handle();
    this.handle.focus();
    cx.timer.after(30, () => this.handle.focus());
  }

  done() {
    if (props()?.overlay) closeOverlay(props().overlay);
  }

  later(u) {
    setShared(UPDATE, { ...u, skipped: u.latest });
    this.done();
  }

  // A git clone pulls and reinstalls; otherwise the release page opens.
  update(u, cx) {
    if (this.state === "busy") return;
    if (!u.source) {
      exec("open", [`https://github.com/${REPO}/releases/tag/v${u.latest}`]).catch(() => null);
      return this.done();
    }
    this.state = "busy";
    cx.notify();
    cx.spawn(async (c) => {
      const pull = await exec("git", ["-C", u.source, "pull", "-q", "--ff-only"], { timeout: 60000 }).catch((e) => ({ code: 1, stderr: String(e) }));
      const inst = pull.code === 0 ? await exec("bash", [`${u.source}/install.sh`], { timeout: 60000 }).catch((e) => ({ code: 1, stderr: String(e) })) : pull;
      if (inst.code === 0) {
        setShared(UPDATE, { checked_at: Date.now(), installed: u.latest, latest: null, notes: null, source: u.source });
        this.state = "done";
      } else {
        this.state = (inst.stderr || inst.stdout || "Update failed").trim().split("\n").slice(-3).join("\n");
      }
      c.notify();
    });
  }

  render() {
    const t = theme();
    const u = shared(UPDATE);
    if (!u?.latest && this.state !== "done") { this.done(); return div(); }
    const button = (id, label, primary, action) => div().id(id).h(30).px(14).flex().items_center().rounded(8).cursor_pointer()
      .text_size(13).font_medium()
      .bg(primary ? t.accent : t.raised).text_color(primary ? t.accent_foreground : t.foreground)
      .hover((s) => s.opacity(0.85))
      .on_click(action)
      .child(label);
    const busy = this.state === "busy", ok = this.state === "done";
    const error = !busy && !ok && this.state ? this.state : null;
    const lines = (u?.notes ?? "").split("\n").filter((l) => l.trim());
    return v_flex().id("c-studio-update").size_full().p(20).gap(10).bg(t.popover.slice(0, 7) + "eb").track_focus(this.handle)
      .on_key_down((e, kcx) => {
        if (e.key === "escape") this.done();
        else if (e.key === "enter") ok ? this.done() : this.update(u, kcx);
        else return;
        kcx.stop_propagation();
      })
      .child(div().text_size(15).font_semibold().text_color(t.foreground).child(ok ? `C-Studio ${u?.installed} is installed` : `C-Studio ${u.latest} is available`))
      .child(div().text_size(13).text_color(t.muted).child(ok ? "Herdr picks up the new mods and themes on its own." : `You have ${u.installed}.`))
      .child(v_flex().id("update-notes").flex_1().min_h(0).overflow_y_scroll().gap(4).p(12).rounded(10).bg(t.foreground + "0d")
        .children(ok || !u.notes ? [div().text_size(12.5).text_color(t.dim).child(ok ? "Done." : "No release notes.")]
          : lines.map((l, i) => {
            const head = /^\[?[\d.]+\]?/.test(l);
            return div().id(`note-${i}`).text_size(head ? 13 : 12.5).when(head, (d) => d.font_semibold().pt(i ? 6 : 0))
              .text_color(head ? t.foreground : t.muted).child(l.replace(/^- /, "• ") || " ");
          })))
      .when(Boolean(error), (el) => el.child(div().text_size(12).text_color(t.blocked).child(error)))
      .child(h_flex().gap(8).justify_end().items_center()
        .when(busy, (el) => el.child(div().text_size(12.5).text_color(t.muted).child("Updating…")))
        .when(ok, (el) => el.child(button("update-close", "Close  ↵", true, () => this.done())))
        .when(!ok, (el) => el
          .child(button("update-later", "Later", false, () => this.later(u)))
          .child(button("update-go", u.source ? "Update  ↵" : "Open release  ↵", true, (_e, c) => this.update(u, c)))));
  }
}
