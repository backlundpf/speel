import { describe, it, expect, vi, afterEach } from "vitest";
import { render } from "@testing-library/react";
import { useHostFontFamily } from "../src/overlay/useHostFont.js";

function Harness({ onFont }: { onFont: (f: string | undefined) => void }) {
  const { probe, fontFamily } = useHostFontFamily();
  onFont(fontFamily);
  return <div data-testid="host">{probe}</div>;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useHostFontFamily", () => {
  it("reports the computed font-family at the probe's position", () => {
    // jsdom's getComputedStyle does not cascade, so the inherited value the
    // browser would report is stubbed in.
    vi.spyOn(window, "getComputedStyle").mockReturnValue({
      fontFamily: "TestFont, serif",
    } as CSSStyleDeclaration);
    let seen: string | undefined;
    render(<Harness onFont={(f) => (seen = f)} />);
    expect(seen).toBe("TestFont, serif");
  });

  it("reports undefined when nothing is measurable", () => {
    let seen: string | undefined = "sentinel";
    render(<Harness onFont={(f) => (seen = f)} />);
    expect(seen).toBeUndefined();
  });
});
