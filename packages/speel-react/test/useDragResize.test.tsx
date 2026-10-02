import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import {
  useDragResize,
  type DragResizeOptions,
} from "../src/surface/useDragResize.js";

function Probe(extra: Partial<DragResizeOptions> = {}) {
  const { size, transform, dragHandleProps, resizeHandleProps } = useDragResize(
    { min: { w: 200, h: 200 }, initial: { w: 400, h: 300 }, ...extra },
  );
  return (
    <div>
      <span data-testid="size">{`${size.w}x${size.h}`}</span>
      <span data-testid="transform">{transform}</span>
      <div data-testid="drag" {...dragHandleProps} />
      <div data-testid="resize" {...resizeHandleProps} />
    </div>
  );
}

describe("useDragResize", () => {
  it("starts at the initial size with no offset", () => {
    render(<Probe />);
    expect(screen.getByTestId("size").textContent).toBe("400x300");
    expect(screen.getByTestId("transform").textContent).toBe(
      "translate(0px, 0px)",
    );
  });

  it("resize grows size and compensates by half the delta to pin the top-left", () => {
    render(<Probe />);
    fireEvent.pointerDown(screen.getByTestId("resize"), {
      clientX: 0,
      clientY: 0,
    });
    fireEvent.pointerMove(window, { clientX: 100, clientY: 60 });
    expect(screen.getByTestId("size").textContent).toBe("500x360");
    // compensation = (500-400)/2, (360-300)/2
    expect(screen.getByTestId("transform").textContent).toBe(
      "translate(50px, 30px)",
    );
    fireEvent.pointerUp(window);
  });

  it("drag translates without changing size", () => {
    render(<Probe />);
    fireEvent.pointerDown(screen.getByTestId("drag"), {
      clientX: 0,
      clientY: 0,
    });
    fireEvent.pointerMove(window, { clientX: 40, clientY: 25 });
    expect(screen.getByTestId("size").textContent).toBe("400x300");
    expect(screen.getByTestId("transform").textContent).toBe(
      "translate(40px, 25px)",
    );
    fireEvent.pointerUp(window);
  });

  it("does not start a drag from a button inside the handle", () => {
    function ButtonProbe() {
      const { transform, dragHandleProps } = useDragResize({
        initial: { w: 400, h: 300 },
      });
      return (
        <div data-testid="bar" {...dragHandleProps}>
          <button>x</button>
          <span data-testid="t">{transform}</span>
        </div>
      );
    }
    render(<ButtonProbe />);
    fireEvent.pointerDown(screen.getByRole("button"), {
      clientX: 0,
      clientY: 0,
    });
    fireEvent.pointerMove(window, { clientX: 40, clientY: 25 });
    expect(screen.getByTestId("t").textContent).toBe("translate(0px, 0px)");
    fireEvent.pointerUp(window);
  });

  it("ignores the pointer after pointercancel (a touch the browser took back)", () => {
    render(<Probe />);
    fireEvent.pointerDown(screen.getByTestId("resize"), {
      clientX: 0,
      clientY: 0,
    });
    fireEvent.pointerMove(window, { clientX: 20, clientY: 10 });
    fireEvent.pointerCancel(window);
    fireEvent.pointerMove(window, { clientX: 999, clientY: 999 });
    expect(screen.getByTestId("size").textContent).toBe("420x310");
  });

  it("clamps resize to min and max", () => {
    render(<Probe max={{ w: 450, h: 320 }} />);
    const handle = screen.getByTestId("resize");
    fireEvent.pointerDown(handle, { clientX: 0, clientY: 0 });
    fireEvent.pointerMove(window, { clientX: 500, clientY: 500 });
    expect(screen.getByTestId("size").textContent).toBe("450x320");
    fireEvent.pointerMove(window, { clientX: -900, clientY: -900 });
    expect(screen.getByTestId("size").textContent).toBe("200x200");
    fireEvent.pointerUp(window);
  });

  it("keeps the box inside the bounds: drag stops at the edges", () => {
    // 1000x800 viewport, 400x300 box centered: left = 300, top = 250.
    render(<Probe bounds={{ w: 1000, h: 800 }} />);
    fireEvent.pointerDown(screen.getByTestId("drag"), {
      clientX: 0,
      clientY: 0,
    });
    fireEvent.pointerMove(window, { clientX: -999, clientY: -999 });
    expect(screen.getByTestId("transform").textContent).toBe(
      "translate(-300px, -250px)",
    );
    fireEvent.pointerMove(window, { clientX: 999, clientY: 999 });
    expect(screen.getByTestId("transform").textContent).toBe(
      "translate(300px, 250px)",
    );
    fireEvent.pointerUp(window);
  });

  it("keeps the box inside the bounds: resize stops at the right and bottom edges", () => {
    // Box at left 300, top 250 → it can grow to 700 wide and 550 tall.
    render(<Probe bounds={{ w: 1000, h: 800 }} />);
    fireEvent.pointerDown(screen.getByTestId("resize"), {
      clientX: 0,
      clientY: 0,
    });
    fireEvent.pointerMove(window, { clientX: 2000, clientY: 2000 });
    expect(screen.getByTestId("size").textContent).toBe("700x550");
    fireEvent.pointerUp(window);
  });

  it("the corner handle is focusable, named, and the arrow keys resize it", () => {
    render(<Probe label="Resize dialog" />);
    const handle = screen.getByTestId("resize");
    expect(handle).toHaveAttribute("tabindex", "0");
    expect(handle).toHaveAttribute("aria-label", "Resize dialog");
    expect(handle).toHaveAttribute("role", "button");
    expect(handle).toHaveAttribute("aria-keyshortcuts");
    fireEvent.keyDown(handle, { key: "ArrowRight" });
    fireEvent.keyDown(handle, { key: "ArrowDown" });
    expect(screen.getByTestId("size").textContent).toBe("416x316");
    // The top-left stays pinned for a keyboard resize, too.
    expect(screen.getByTestId("transform").textContent).toBe(
      "translate(8px, 8px)",
    );
    fireEvent.keyDown(handle, { key: "ArrowLeft" });
    fireEvent.keyDown(handle, { key: "ArrowLeft" });
    fireEvent.keyDown(handle, { key: "ArrowUp" });
    expect(screen.getByTestId("size").textContent).toBe("384x300");
  });

  it("the keyboard respects min, max and bounds too", () => {
    render(
      <Probe
        min={{ w: 400, h: 300 }}
        max={{ w: 416 }}
        bounds={{ w: 1000, h: 332 }}
      />,
    );
    const handle = screen.getByTestId("resize");
    fireEvent.keyDown(handle, { key: "ArrowLeft" });
    fireEvent.keyDown(handle, { key: "ArrowUp" });
    expect(screen.getByTestId("size").textContent).toBe("400x300");
    fireEvent.keyDown(handle, { key: "ArrowRight" });
    fireEvent.keyDown(handle, { key: "ArrowRight" });
    // top = (332 - 300)/2 = 16 → at most 316 tall.
    fireEvent.keyDown(handle, { key: "ArrowDown" });
    fireEvent.keyDown(handle, { key: "ArrowDown" });
    expect(screen.getByTestId("size").textContent).toBe("416x316");
  });

  it("other keys pass through untouched", () => {
    render(<Probe />);
    const handle = screen.getByTestId("resize");
    const ev = new KeyboardEvent("keydown", {
      key: "Tab",
      bubbles: true,
      cancelable: true,
    });
    handle.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(false);
    expect(screen.getByTestId("size").textContent).toBe("400x300");
  });
});
