import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { shadcnAdapter as ui } from "@/speel-shadcn/adapter";

/**
 * A field's description is help text under the control in every mode — on an input and
 * on a display alike — the fluent-v8 skin's contract.
 */

const describedText = (el: HTMLElement): string =>
  (el.getAttribute("aria-describedby") ?? "")
    .split(/\s+/)
    .filter(Boolean)
    .map((id) => document.getElementById(id)?.textContent ?? "")
    .join(" ");

describe("shadcn field descriptions", () => {
  it("a display shows the description as help text and is described by it", () => {
    render(
      <ui.FieldDisplay label="Donor" description="Who gave it">
        x
      </ui.FieldDisplay>,
    );
    expect(screen.getByText("Who gave it")).not.toHaveClass("sr-only");
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(describedText(screen.getByRole("group", { name: "Donor" }))).toBe(
      "Who gave it",
    );
  });

  it("an inline-named display is described by it", () => {
    render(
      <ui.FieldDisplay ariaLabel="Donor" description="Who gave it">
        x
      </ui.FieldDisplay>,
    );
    expect(describedText(screen.getByRole("group", { name: "Donor" }))).toBe(
      "Who gave it",
    );
  });

  it("inputs keep the description as help text", () => {
    render(
      <ui.TextInput
        label="Donor"
        description="Who gave it"
        value=""
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByText("Who gave it")).not.toHaveClass("sr-only");
  });
});
