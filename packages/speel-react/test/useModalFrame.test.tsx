import { afterEach, beforeEach, describe, it, expect } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import {
  useModalFrame,
  type ModalFrameOptions,
} from "../src/surface/useModalFrame.js";

const RECT = { left: 100, top: 50, width: 400, height: 170 };

function Probe(p: Partial<ModalFrameOptions>) {
  const { frameRef, css, dragHandleProps, resizeHandleProps } = useModalFrame({
    fullscreen: false,
    ...p,
  });
  return (
    <div>
      <div ref={frameRef} data-testid="frame" data-css={JSON.stringify(css)} />
      <div data-testid="drag" {...dragHandleProps} />
      <div data-testid="resize" {...resizeHandleProps} />
    </div>
  );
}

const css = () =>
  JSON.parse(screen.getByTestId("frame").getAttribute("data-css")!) as Record<
    string,
    string
  >;

let saved: { w: number; h: number };
const realRect = HTMLElement.prototype.getBoundingClientRect;
beforeEach(() => {
  saved = { w: window.innerWidth, h: window.innerHeight };
  Object.assign(window, { innerWidth: 1000, innerHeight: 800 });
  HTMLElement.prototype.getBoundingClientRect = function () {
    return {
      ...RECT,
      x: RECT.left,
      y: RECT.top,
      right: RECT.left + RECT.width,
      bottom: RECT.top + RECT.height,
      toJSON: () => ({}),
    } as DOMRect;
  };
});
afterEach(() => {
  HTMLElement.prototype.getBoundingClientRect = realRect;
  Object.assign(window, { innerWidth: saved.w, innerHeight: saved.h });
});

const drag = (to: { x: number; y: number }, target = "drag") => {
  fireEvent.pointerDown(screen.getByTestId(target), { clientX: 0, clientY: 0 });
  fireEvent.pointerMove(window, { clientX: to.x, clientY: to.y });
  fireEvent.pointerUp(window);
};

describe("useModalFrame", () => {
  it("is pure CSS until the user takes over", () => {
    render(<Probe style={{ height: "auto" }} />);
    expect(css().top).toBe("50%");
    expect(css().transform).toBe("translate(-50%, -50%)");
    expect(css().height).toBe("auto");
  });

  it("a title-bar click without movement keeps auto", () => {
    render(<Probe style={{ height: "auto" }} />);
    fireEvent.pointerDown(screen.getByTestId("drag"), {
      clientX: 5,
      clientY: 5,
    });
    fireEvent.pointerMove(window, { clientX: 5, clientY: 5 });
    fireEvent.pointerUp(window);
    expect(css().height).toBe("auto");
  });

  it("a drag takes over from the measured frame", () => {
    render(<Probe style={{ height: "auto" }} />);
    drag({ x: 30, y: 40 });
    expect(css()).toMatchObject({
      top: "90px",
      left: "130px",
      width: "400px",
      height: "170px",
      transform: "none",
    });
  });

  it("a drag cannot carry the frame off screen", () => {
    render(<Probe />);
    drag({ x: 2000, y: 2000 });
    expect(css().left).toBe("600px");
    expect(css().top).toBe("630px");
  });

  it("a frame already below the floor resizes from its own size, without a jump", () => {
    render(<Probe style={{ height: "auto" }} />);
    fireEvent.keyDown(screen.getByTestId("resize"), { key: "ArrowUp" });
    expect(css().height).toBe("170px");
    fireEvent.keyDown(screen.getByTestId("resize"), { key: "ArrowDown" });
    expect(css().height).toBe("186px");
  });

  it("a resize stops at the right edge and keeps the top-left corner", () => {
    render(<Probe />);
    drag({ x: 2000, y: 0 }, "resize");
    expect(css().width).toBe("900px");
    expect(css().left).toBe("100px");
    expect(css().top).toBe("50px");
  });

  it("a resize stops at the viewport cap", () => {
    Object.assign(window, { innerWidth: 3000 });
    render(<Probe />);
    drag({ x: 5000, y: 5000 }, "resize");
    expect(css().width).toBe("2880px"); // 96% of 3000
    expect(css().height).toBe("736px"); // 92% of 800
  });

  it("a window resize brings a taken-over frame back on screen", () => {
    render(<Probe />);
    drag({ x: 2000, y: 0 });
    expect(css().left).toBe("600px");
    act(() => {
      Object.assign(window, { innerWidth: 700 });
      window.dispatchEvent(new Event("resize"));
    });
    expect(css().width).toBe("400px");
    expect(css().left).toBe("300px");
  });

  it("fullscreen keeps the box for when it is left", () => {
    const { rerender } = render(<Probe />);
    drag({ x: 30, y: 40 });
    rerender(<Probe fullscreen />);
    expect(css().top).toBe("50%");
    expect(css().width).toBe("96vw");
    rerender(<Probe fullscreen={false} />);
    expect(css().top).toBe("90px");
  });

  it("a drag that starts on a header button is not a drag", () => {
    function WithButton() {
      const { frameRef, css, dragHandleProps } = useModalFrame({
        fullscreen: false,
        style: { height: "auto" },
      });
      return (
        <div ref={frameRef} data-testid="frame" data-css={JSON.stringify(css)}>
          <div {...dragHandleProps}>
            <button data-testid="btn">x</button>
          </div>
        </div>
      );
    }
    render(<WithButton />);
    drag({ x: 30, y: 40 }, "btn");
    expect(css().height).toBe("auto");
  });
});
