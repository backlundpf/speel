import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { shadcnAdapter } from "@/speel-shadcn/adapter";

const B = shadcnAdapter.Button;

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

  it("renders the label as the button's own text", () => {
    render(<B text="Submit" />);
    const button = screen.getByRole("button", { name: "Submit" });
    expect(button.children).toHaveLength(0);
    expect(button.textContent).toBe("Submit");
  });
});
