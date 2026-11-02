import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { V8FieldDisplay } from "../src/fluent-v8/primitives.js";

/**
 * A display (view mode, read-only) shows a field's description as help text under its
 * content, as an input does (#99), and is described by it.
 */

const describedText = (el: HTMLElement): string =>
  (el.getAttribute("aria-describedby") ?? "")
    .split(/\s+/)
    .filter(Boolean)
    .map((id) => document.getElementById(id)?.textContent ?? "")
    .join(" ");

describe("V8FieldDisplay description", () => {
  it("shows the description as help text and is described by it", () => {
    render(
      <V8FieldDisplay label="Donor" description="Who gave it">
        x
      </V8FieldDisplay>,
    );
    expect(screen.getByText("Who gave it")).toBeVisible();
    expect(describedText(screen.getByRole("group", { name: "Donor" }))).toBe(
      "Who gave it",
    );
  });

  it("renders no info button", () => {
    render(
      <V8FieldDisplay label="Donor" description="Who gave it">
        x
      </V8FieldDisplay>,
    );
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("an inline-named display shows and is described by it too", () => {
    render(
      <V8FieldDisplay ariaLabel="Donor" description="Who gave it">
        x
      </V8FieldDisplay>,
    );
    expect(screen.getByText("Who gave it")).toBeVisible();
    expect(describedText(screen.getByRole("group", { name: "Donor" }))).toBe(
      "Who gave it",
    );
  });
});
