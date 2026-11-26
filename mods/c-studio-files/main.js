import Files from "./base.js";

export default class StudioFiles extends Files {
  render(cx) {
    return super.render(cx).border_0().rounded(16);
  }
}
