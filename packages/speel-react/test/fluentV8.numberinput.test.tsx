import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { V8NumberInput } from "../src/fluent-v8/primitives.js";
const noop = (): void => {};

/**
 * #100: the fluent-v8 skin dropped the required marker on Number/Currency
 * fields and, with a prefix, rendered the label inline behind it, so the
 * field read "USD Amount [input]" instead of a label above "USD [input]".
 *
 * Root cause: V8NumberInput handed the label to Fluent's SpinButton, whose
 * internal Label takes no `required` and whose labelPosition defaults to
 * inline-start. Every other v8 field either forwards `required` to a control
 * that draws the marker or lets the V8Field chrome draw the label. The chrome
 * is the uniform fix: it draws the label (required star and all) above the
 * control, and the SpinButton keeps only the adornment row.
 */

/** The chrome's label: the field wrapper's first child. */
const chromeLabel = (container: HTMLElement): HTMLLabelElement =>
  container.querySelector("label") as HTMLLabelElement;

const spinInput = (container: HTMLElement): HTMLInputElement =>
  container.querySelector(".ms-spinButton-input") as HTMLInputElement;

describe("fluent-v8 required NumberInput keeps its required marker (#100)", () => {
  it("renders one label, above the control, with the required style", () => {
    const required = render(
      <V8NumberInput label="Amount" required value={5} onChange={noop} />,
    );
    const plain = render(
      <V8NumberInput label="Amount" value={5} onChange={noop} />,
    );
    // Exactly one label per field: the chrome's.
    expect(required.container.querySelectorAll("label")).toHaveLength(1);
    // The chrome's label carries Fluent's required styling: a distinct
    // class variant from a non-required field's label (Fluent renders the
    // star as ::after content on the required class, invisible to text).
    const reqLabel = chromeLabel(required.container);
    const plainLabel = chromeLabel(plain.container);
    expect(reqLabel.textContent).toBe("Amount");
    expect(reqLabel.className).not.toBe(plainLabel.className);
    // The label sits above the control: it precedes the input in DOM order
    // and points `htmlFor` at it.
    expect(reqLabel.getAttribute("for")).toBe(spinInput(required.container).id);
    expect(
      reqLabel.compareDocumentPosition(spinInput(required.container)),
    ).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    // The input is named by the label (implicit label association).
    expect(
      within(required.container).getByLabelText("Amount"),
    ).toBeInTheDocument();
  });
});

describe("fluent-v8 NumberInput with a prefix keeps the label on top (#100)", () => {
  it("renders the label above the prefix, not inline behind it", () => {
    const { container } = render(
      <V8NumberInput
        label="Amount"
        required
        prefix="USD"
        value={5}
        onChange={noop}
      />,
    );
    const label = chromeLabel(container);
    expect(label.textContent).toBe("Amount");
    // The SpinButton no longer draws its own label: one label total.
    expect(container.querySelectorAll("label")).toHaveLength(1);
    // DOM order: the label precedes the prefix, so the field reads
    // "Amount *" then "USD [input]" instead of "USD Amount [input]".
    const usd = Array.from(container.querySelectorAll("span")).find(
      (s) => s.textContent === "USD",
    );
    expect(usd).toBeDefined();
    expect(label.compareDocumentPosition(usd!)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
    // The input is still named by the label, not by an inline aria-name.
    expect(
      screen.getByRole("spinbutton", { name: "Amount" }),
    ).toBeInTheDocument();
  });

  it("keeps the adornment row holding only the prefix and the control", () => {
    const { container } = render(
      <V8NumberInput label="Amount" prefix="USD" value={5} onChange={noop} />,
    );
    expect(container.querySelectorAll("label")).toHaveLength(1);
    // The input still renders inside the adornment row, after the prefix.
    const usd = Array.from(container.querySelectorAll("span")).find(
      (s) => s.textContent === "USD",
    );
    const input = spinInput(container);
    expect(usd).toBeDefined();
    expect(usd!.compareDocumentPosition(input)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
  });
});
