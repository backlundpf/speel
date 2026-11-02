import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { V8NumberInput } from "../src/fluent-v8/primitives.js";

/**
 * The v8 number input's label is the chrome's, like every other v8 field (#100): Fluent's
 * SpinButton draws its own label without `required`, inline, and — inside the
 * prefix/suffix row — after the currency code.
 */

const noop = (): void => {};

describe("V8NumberInput label", () => {
  it("required number field marks its label required", () => {
    const { container } = render(
      <V8NumberInput label="Amount" required value={1} onChange={noop} />,
    );
    const labels = container.querySelectorAll("label");
    expect(labels).toHaveLength(1);
    const input = screen.getByRole("spinbutton", { name: "Amount" });
    expect(labels[0]!.htmlFor).toBe(input.id);
    expect(input).toHaveAttribute("aria-required", "true");
  });

  it("label sits before the currency prefix", () => {
    const { container } = render(
      <V8NumberInput
        label="Amount"
        required
        prefix="USD"
        value={1}
        onChange={noop}
      />,
    );
    const label = container.querySelector("label")!;
    const prefix = screen.getByText("USD");
    expect(
      label.compareDocumentPosition(prefix) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(prefix.parentElement!.contains(label)).toBe(false);
    expect(
      screen.getByRole("spinbutton", { name: "Amount" }),
    ).toBeInTheDocument();
  });

  it("suffix and error still render", () => {
    render(
      <V8NumberInput
        label="Rate"
        suffix="%"
        error="Too big"
        value={1}
        onChange={noop}
      />,
    );
    expect(screen.getByText("%")).toBeInTheDocument();
    const err = screen.getByText("Too big");
    const input = screen.getByRole("spinbutton", { name: "Rate" });
    expect(input.getAttribute("aria-describedby")).toContain(err.id);
  });

  it("an inline-named number input stays named and label-less", () => {
    const { container } = render(
      <V8NumberInput ariaLabel="Amount for row 3" value={1} onChange={noop} />,
    );
    expect(container.querySelectorAll("label")).toHaveLength(0);
    expect(
      screen.getByRole("spinbutton", { name: "Amount for row 3" }),
    ).toBeInTheDocument();
  });
});
