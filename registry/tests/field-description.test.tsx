import { describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { shadcnAdapter as ui } from "@/speel-shadcn/adapter";

/**
 * A display shows its description behind an info icon; an input (or a display standing
 * in for one) keeps it as help text under the control — the fluent-v8 skin's contract.
 */

const describedText = (el: HTMLElement): string =>
  (el.getAttribute("aria-describedby") ?? "")
    .split(/\s+/)
    .filter(Boolean)
    .map((id) => document.getElementById(id)?.textContent ?? "")
    .join(" ");

describe("shadcn FieldDisplay description", () => {
  it("icon variant: no subtext, focusable info button described by the text", () => {
    render(
      <ui.FieldDisplay label="Donor" description="Who gave it">
        x
      </ui.FieldDisplay>,
    );
    // Only the screen-reader copy — no visible help-text line.
    const copies = screen.getAllByText("Who gave it");
    expect(copies).toHaveLength(1);
    expect(copies[0]).toHaveClass("sr-only");
    const info = screen.getByRole("button", {
      name: "More information about Donor",
    });
    expect(info.tabIndex).toBe(0);
    expect(describedText(screen.getByRole("group", { name: "Donor" }))).toBe(
      "Who gave it",
    );
  });

  it("icon variant: tooltip shows on focus", async () => {
    render(
      <ui.FieldDisplay label="Donor" description="Who gave it">
        x
      </ui.FieldDisplay>,
    );
    const info = screen.getByRole("button", {
      name: "More information about Donor",
    });
    act(() => info.focus());
    expect(await screen.findByRole("tooltip")).toHaveTextContent("Who gave it");
  });

  it("text variant: subtext as before", () => {
    render(
      <ui.FieldDisplay
        label="Donor"
        description="Who gave it"
        descriptionAs="text"
      >
        x
      </ui.FieldDisplay>,
    );
    expect(screen.getByText("Who gave it")).not.toHaveClass("sr-only");
    expect(
      screen.queryByRole("button", { name: /More information/ }),
    ).not.toBeInTheDocument();
  });

  it("inline-named display: no icon, still described", () => {
    render(
      <ui.FieldDisplay ariaLabel="Donor" description="Who gave it">
        x
      </ui.FieldDisplay>,
    );
    expect(
      screen.queryByRole("button", { name: /More information/ }),
    ).not.toBeInTheDocument();
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
