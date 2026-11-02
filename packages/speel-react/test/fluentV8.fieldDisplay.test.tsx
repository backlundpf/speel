import { describe, it, expect } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { V8FieldDisplay } from "../src/fluent-v8/primitives.js";

/**
 * A display (view mode, read-only) shows a field's description behind an info icon;
 * an input-like display (an edit-mode render override) keeps it as subtext (#99).
 */

const describedText = (el: HTMLElement): string =>
  (el.getAttribute("aria-describedby") ?? "")
    .split(/\s+/)
    .filter(Boolean)
    .map((id) => document.getElementById(id)?.textContent ?? "")
    .join(" ");

describe("V8FieldDisplay description", () => {
  it("icon variant: no subtext, focusable info button described by the text", () => {
    render(
      <V8FieldDisplay label="Donor" description="Who gave it">
        x
      </V8FieldDisplay>,
    );
    // Only the tooltip's always-present hidden copy — no visible subtext line.
    expect(screen.getAllByText("Who gave it")).toHaveLength(1);
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
      <V8FieldDisplay label="Donor" description="Who gave it">
        x
      </V8FieldDisplay>,
    );
    const info = screen.getByRole("button", {
      name: "More information about Donor",
    });
    fireEvent.focus(info);
    await waitFor(
      () => expect(screen.getAllByText("Who gave it")).toHaveLength(2),
      { timeout: 2000 },
    );
  });

  it("text variant: subtext as before", () => {
    render(
      <V8FieldDisplay label="Donor" description="Who gave it" descriptionAs="text">
        x
      </V8FieldDisplay>,
    );
    expect(screen.getByText("Who gave it")).toBeVisible();
    expect(
      screen.queryByRole("button", { name: /More information/ }),
    ).not.toBeInTheDocument();
  });

  it("inline-named display: no icon, still described", () => {
    render(
      <V8FieldDisplay ariaLabel="Donor" description="Who gave it">
        x
      </V8FieldDisplay>,
    );
    expect(
      screen.queryByRole("button", { name: /More information/ }),
    ).not.toBeInTheDocument();
    expect(describedText(screen.getByRole("group", { name: "Donor" }))).toBe(
      "Who gave it",
    );
  });
});
