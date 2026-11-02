import { describe, it, expect, afterEach } from "vitest";
import { render } from "@testing-library/react";
import { V8Panel } from "../src/fluent-v8/primitives.js";

const main = (): CSSStyleDeclaration =>
  getComputedStyle(document.querySelector(".ms-Panel-main") as HTMLElement);

describe("V8Panel sizing", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("no style keeps the medium preset and Fluent's own cap", () => {
    render(
      <V8Panel open onOpenChange={() => {}} title="P">
        body
      </V8Panel>,
    );
    expect(main().width).toBe("640px");
    expect(main().maxWidth).toBe("100vw");
  });

  it("style width and maxWidth reach the panel", () => {
    render(
      <V8Panel
        open
        onOpenChange={() => {}}
        title="P"
        style={{ width: "40vw", maxWidth: "700px" }}
      >
        body
      </V8Panel>,
    );
    expect(main().width).toBe("40vw");
    expect(main().maxWidth).toBe("700px");
  });
});
