import Changes from "./base.js";

export default class StudioChanges extends Changes {
  render(cx) {
    return super.render(cx).border_0().rounded(16);
  }
}
