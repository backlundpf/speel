import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import {
  useResizable,
  type ResizableOptions,
} from "../src/surface/useResizable.js";

function Probe(opts: ResizableOptions) {
  const { size, handleProps } = useResizable(opts);
  return (
    <div>
      <span data-testid="size">{`${size.w}x${size.h}`}</span>
      <div data-testid="handle" {...handleProps} />
    </div>
  );
}

describe("useResizable", () => {
  it("grows width/height by the drag delta (axis both)", () => {
    render(
      <Probe
        axis="both"
        min={{ w: 100, h: 100 }}
        initial={{ w: 200, h: 200 }}
      />,
    );
    expect(screen.getByTestId("size").textContent).toBe("200x200");
    fireEvent.pointerDown(screen.getByTestId("handle"), {
      clientX: 0,
      clientY: 0,
    });
    fireEvent.pointerMove(window, { clientX: 50, clientY: 30 });
    expect(screen.getByTestId("size").textContent).toBe("250x230");
    fireEvent.pointerUp(window);
    fireEvent.pointerMove(window, { clientX: 999, clientY: 999 });
    expect(screen.getByTestId("size").textContent).toBe("250x230"); // ignored after pointerup
  });

  it("clamps to min", () => {
    render(
      <Probe
        axis="both"
        min={{ w: 100, h: 100 }}
        initial={{ w: 200, h: 200 }}
      />,
    );
    fireEvent.pointerDown(screen.getByTestId("handle"), {
      clientX: 100,
      clientY: 100,
    });
    fireEvent.pointerMove(window, { clientX: 0, clientY: 0 });
    expect(screen.getByTestId("size").textContent).toBe("100x100");
  });

  it("inverts the x delta when invertX (panel docked at end)", () => {
    render(<Probe axis="x" min={{ w: 100 }} initial={{ w: 300 }} invertX />);
    fireEvent.pointerDown(screen.getByTestId("handle"), {
      clientX: 100,
      clientY: 0,
    });
    fireEvent.pointerMove(window, { clientX: 60, clientY: 0 }); // moved left 40 → width +40
    expect(screen.getByTestId("size").textContent).toBe("340xundefined");
  });

  it("clamps to max", () => {
    render(
      <Probe axis="x" min={{ w: 100 }} max={{ w: 400 }} initial={{ w: 300 }} />,
    );
    fireEvent.pointerDown(screen.getByTestId("handle"), {
      clientX: 0,
      clientY: 0,
    });
    fireEvent.pointerMove(window, { clientX: 500, clientY: 0 });
    expect(screen.getByTestId("size").textContent).toBe("400xundefined");
  });

  it("resizes from a pointer drag, so a touch or pen works too", () => {
    render(<Probe axis="x" min={{ w: 100 }} initial={{ w: 200 }} />);
    fireEvent.pointerDown(screen.getByTestId("handle"), {
      clientX: 0,
      clientY: 0,
    });
    fireEvent.pointerMove(window, { clientX: 40, clientY: 0 });
    expect(screen.getByTestId("size").textContent).toBe("240xundefined");
    fireEvent.pointerUp(window);
    fireEvent.pointerMove(window, { clientX: 999, clientY: 0 });
    expect(screen.getByTestId("size").textContent).toBe("240xundefined");
  });

  it("is a focusable separator the arrow keys resize", () => {
    render(<Probe axis="x" min={{ w: 100 }} initial={{ w: 200 }} />);
    const handle = screen.getByTestId("handle");
    expect(handle).toHaveAttribute("role", "separator");
    expect(handle).toHaveAttribute("tabindex", "0");
    fireEvent.keyDown(handle, { key: "ArrowRight" });
    expect(screen.getByTestId("size").textContent).toBe("216xundefined");
    fireEvent.keyDown(handle, { key: "ArrowLeft" });
    fireEvent.keyDown(handle, { key: "ArrowLeft" });
    expect(screen.getByTestId("size").textContent).toBe("184xundefined");
  });

  it("arrow keys follow the docked edge, like the drag does", () => {
    render(<Probe axis="x" min={{ w: 100 }} initial={{ w: 200 }} invertX />);
    // Docked at 'end': the handle is on the left edge, so ArrowLeft grows it.
    fireEvent.keyDown(screen.getByTestId("handle"), { key: "ArrowLeft" });
    expect(screen.getByTestId("size").textContent).toBe("216xundefined");
  });

  it("the keyboard respects min and max too", () => {
    render(
      <Probe axis="x" min={{ w: 200 }} max={{ w: 216 }} initial={{ w: 200 }} />,
    );
    const handle = screen.getByTestId("handle");
    fireEvent.keyDown(handle, { key: "ArrowLeft" });
    expect(screen.getByTestId("size").textContent).toBe("200xundefined");
    fireEvent.keyDown(handle, { key: "ArrowRight" });
    fireEvent.keyDown(handle, { key: "ArrowRight" });
    expect(screen.getByTestId("size").textContent).toBe("216xundefined");
  });
});
