import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { useDragResize } from "../src/surface/useDragResize.js";

function Probe() {
  const { size, transform, dragHandleProps, resizeHandleProps } = useDragResize(
    { min: { w: 200, h: 200 }, initial: { w: 400, h: 300 } },
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
    fireEvent.mouseDown(screen.getByTestId("resize"), {
      clientX: 0,
      clientY: 0,
    });
    fireEvent.mouseMove(window, { clientX: 100, clientY: 60 });
    expect(screen.getByTestId("size").textContent).toBe("500x360");
    // compensation = (500-400)/2, (360-300)/2
    expect(screen.getByTestId("transform").textContent).toBe(
      "translate(50px, 30px)",
    );
    fireEvent.mouseUp(window);
  });

  it("drag translates without changing size", () => {
    render(<Probe />);
    fireEvent.mouseDown(screen.getByTestId("drag"), { clientX: 0, clientY: 0 });
    fireEvent.mouseMove(window, { clientX: 40, clientY: 25 });
    expect(screen.getByTestId("size").textContent).toBe("400x300");
    expect(screen.getByTestId("transform").textContent).toBe(
      "translate(40px, 25px)",
    );
    fireEvent.mouseUp(window);
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
    fireEvent.mouseDown(screen.getByRole("button"), { clientX: 0, clientY: 0 });
    fireEvent.mouseMove(window, { clientX: 40, clientY: 25 });
    expect(screen.getByTestId("t").textContent).toBe("translate(0px, 0px)");
    fireEvent.mouseUp(window);
  });
});
