import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { shadcnAdapter } from "@/speel-shadcn/adapter";

const B = shadcnAdapter.Button;
const sized = (el: HTMLElement, s: number, c: number): void => {
  Object.defineProperty(el, "scrollWidth", { value: s, configurable: true });
  Object.defineProperty(el, "clientWidth", { value: c, configurable: true });
};

describe("shadcn Button appearance link", () => {
  it("renders the link variant, start-aligned, its label truncating", () => {
    const onClick = vi.fn();
    render(<B appearance="link" text="A long title" onClick={onClick} />);
    const button = screen.getByRole("button", { name: "A long title" });
    expect(button.dataset["variant"]).toBe("link");
    expect(button.className).toContain("h-auto");
    expect(button.className).toContain("max-w-full");
    expect(button.className).toContain("justify-start");
    expect(button.querySelector(".truncate")!.textContent).toBe("A long title");
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("renders its icon before the label", () => {
    render(<B appearance="link" text="Open" iconName="Edit" />);
    const button = screen.getByRole("button", { name: "Open" });
    const [first, second] = Array.from(button.children);
    expect(first!.tagName.toLowerCase()).toBe("svg");
    expect(second!.className).toContain("truncate");
  });

  it("titles a cut-off link with its text on hover", () => {
    render(<B appearance="link" text="A long title" />);
    const label = screen
      .getByRole("button", { name: "A long title" })
      .querySelector<HTMLElement>(".truncate")!;
    sized(label, 200, 80);
    fireEvent.mouseEnter(label);
    expect(label.title).toBe("A long title");
  });

  it("leaves a link that fits untitled", () => {
    render(<B appearance="link" text="Short" />);
    const label = screen
      .getByRole("button", { name: "Short" })
      .querySelector<HTMLElement>(".truncate")!;
    sized(label, 40, 80);
    fireEvent.mouseEnter(label);
    expect(label.title).toBe("");
  });

  it("lets the tooltip be a tooltip link's only hover text", () => {
    render(<B appearance="link" text="A long title" tooltip="Open it" />);
    const button = screen.getByRole("button", { name: "A long title" });
    const label = button.querySelector<HTMLElement>(".truncate")!;
    sized(label, 200, 80);
    fireEvent.mouseEnter(label);
    expect(label.title).toBe("");
    expect(button.title).toBe("");
  });
});

describe("shadcn Button tooltip anchoring", () => {
  it("lets a tooltip-wrapped button fill its trigger", () => {
    render(<B text="Submit" tooltip="Sends it" />);
    expect(screen.getByRole("button", { name: "Submit" }).className).toContain(
      "w-full",
    );
  });

  it("leaves a button without a tooltip its own width", () => {
    render(<B text="Submit" />);
    expect(
      screen.getByRole("button", { name: "Submit" }).className,
    ).not.toContain("w-full");
  });

  it("holds a tooltip link's trigger to its container, so the link still cuts itself off", () => {
    render(<B appearance="link" text="A long title" tooltip="Open it" />);
    const button = screen.getByRole("button", { name: "A long title" });
    expect(button.className).toContain("w-full");
    expect(button.parentElement!.className).toContain("max-w-full");
  });
});
