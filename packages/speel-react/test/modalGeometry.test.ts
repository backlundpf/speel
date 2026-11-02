import { describe, it, expect } from "vitest";
import { cssLengthPx, modalFrameCss } from "../src/surface/modalGeometry.js";

const css = (o: Partial<Parameters<typeof modalFrameCss>[0]> = {}) =>
  modalFrameCss({ fullscreen: false, box: null, ...o });

describe("modalFrameCss", () => {
  it("no style: the medium preset, centred, at today's caps", () => {
    expect(css()).toEqual({
      width: "640px",
      height: "560px",
      maxWidth: "96vw",
      maxHeight: "92vh",
      top: "50%",
      left: "50%",
      transform: "translate(-50%, -50%)",
    });
  });

  it("size sets both axes from the presets", () => {
    const c = css({ size: "small" });
    expect(c.width).toBe("480px");
    expect(c.height).toBe("440px");
  });

  it("style width/height replace the presets; auto height passes through", () => {
    const c = css({ style: { width: "20vw", height: "auto" } });
    expect(c.width).toBe("20vw");
    expect(c.height).toBe("auto");
    expect(c.transform).toBe("translate(-50%, -50%)");
  });

  it("width auto falls back to the preset", () => {
    expect(css({ style: { width: "auto" } }).width).toBe("640px");
  });

  it("caller caps yield to the maximized size", () => {
    const c = css({ style: { maxHeight: "1200px", maxWidth: "900px" } });
    expect(c.maxHeight).toBe("min(1200px, 92vh)");
    expect(c.maxWidth).toBe("min(900px, 96vw)");
  });

  it("top pins the top edge, caps height to the room below, and moves up only below the floor", () => {
    const c = css({ style: { top: "85vh" } });
    expect(c.top).toBe("max(0px, min(85vh, calc(96vh - min(260px, 92vh))))");
    expect(c.maxHeight).toBe(
      "min(92vh, max(calc(96vh - 85vh), min(260px, 92vh)))",
    );
    expect(c.left).toBe("50%");
    expect(c.transform).toBe("translate(-50%, 0)");
  });

  it("left pins the left edge the same way, keeping a caller maxWidth", () => {
    const c = css({ style: { left: "10px", maxWidth: "500px" } });
    expect(c.left).toBe("max(0px, min(10px, calc(98vw - min(360px, 96vw))))");
    expect(c.maxWidth).toBe(
      "min(500px, 96vw, max(calc(98vw - 10px), min(360px, 96vw)))",
    );
    expect(c.transform).toBe("translate(0, -50%)");
  });

  it("top and left together need no transform", () => {
    expect(css({ style: { top: "10px", left: "10px" } }).transform).toBe(
      "none",
    );
  });

  it("a box (taken over) renders in pixels and keeps the style caps", () => {
    const c = css({
      style: { maxWidth: "900px" },
      box: { x: 10, y: 20, w: 500, h: 300 },
    });
    expect(c).toEqual({
      width: "500px",
      height: "300px",
      maxWidth: "min(900px, 96vw)",
      maxHeight: "92vh",
      top: "20px",
      left: "10px",
      transform: "none",
    });
  });

  it("fullscreen wins over style and box", () => {
    const full = {
      width: "96vw",
      height: "92vh",
      maxWidth: "96vw",
      maxHeight: "92vh",
      top: "50%",
      left: "50%",
      transform: "translate(-50%, -50%)",
    };
    expect(css({ fullscreen: true })).toEqual(full);
    expect(
      css({
        fullscreen: true,
        style: { height: "auto", top: "5px" },
        box: { x: 1, y: 2, w: 3, h: 4 },
      }),
    ).toEqual(full);
  });
});

describe("cssLengthPx", () => {
  it("is undefined without layout (jsdom measures 0)", () => {
    expect(cssLengthPx("100px", "w")).toBeUndefined();
  });
});
