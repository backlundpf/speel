import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import {
  V8Button,
  V8Checkbox,
  V8Combobox,
  V8Dropdown,
} from "../src/fluent-v8/primitives.js";

const opts = [
  { key: "a", text: "Alpha", data: "a" },
  { key: "b", text: "Beta", data: "b" },
];

describe("V8Checkbox", () => {
  it("is named by ariaLabel when it has no visible label", () => {
    render(
      <V8Checkbox
        ariaLabel="Select row 3"
        checked={false}
        onChange={vi.fn()}
      />,
    );
    expect(
      screen.getByRole("checkbox", { name: "Select row 3" }),
    ).toBeInTheDocument();
  });

  it("shows the mixed state, and a click on it reports checked", () => {
    const onChange = vi.fn();
    render(
      <V8Checkbox
        ariaLabel="Select all"
        checked={false}
        indeterminate
        onChange={onChange}
      />,
    );
    const box = screen.getByRole("checkbox", { name: "Select all" });
    expect(box).toBePartiallyChecked();
    fireEvent.click(box);
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it("is a plain two-state box without indeterminate", () => {
    render(
      <V8Checkbox ariaLabel="Select row" checked={false} onChange={vi.fn()} />,
    );
    expect(screen.getByRole("checkbox")).not.toBePartiallyChecked();
  });
});

describe("V8Button tooltip", () => {
  it("describes the button with its tooltip, even while disabled", () => {
    render(<V8Button text="Bulk edit" disabled tooltip="Tick rows first" />);
    const button = screen.getByRole("button", { name: "Bulk edit" });
    expect(button).toHaveAccessibleDescription("Tick rows first");
  });

  it("shows the tooltip on hover while disabled, and still ignores clicks", async () => {
    const onClick = vi.fn();
    render(
      <V8Button
        text="Bulk edit"
        disabled
        tooltip="Tick rows first"
        onClick={onClick}
      />,
    );
    const button = screen.getByRole("button", { name: "Bulk edit" });
    // A disabled tooltip button stays focusable and hoverable: aria-disabled, not
    // the native attribute that swallows pointer events.
    expect(button).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
    fireEvent.mouseEnter(button.parentElement!);
    // The always-present hidden description, then the callout once the hover lands.
    expect(screen.getAllByText("Tick rows first")).toHaveLength(1);
    await waitFor(
      () => expect(screen.getAllByText("Tick rows first")).toHaveLength(2),
      { timeout: 2000 },
    );
  });

  it("renders the bare button without a tooltip", () => {
    render(<V8Button text="Save" disabled />);
    const button = screen.getByRole("button", { name: "Save" });
    expect(button).toBeDisabled();
    expect(button).not.toHaveAttribute("aria-describedby");
  });
});

describe("V8Button tooltip anchoring", () => {
  it("makes the tooltip host inline-block and the button fill it", () => {
    const { container } = render(<V8Button text="Submit" tooltip="Sends it" />);
    const host = container.firstElementChild as HTMLElement;
    expect(host.className).toContain("ms-TooltipHost");
    expect(getComputedStyle(host).display).toBe("inline-block");
    const button = screen.getByRole("button", { name: "Submit" });
    expect(getComputedStyle(button).width).toBe("100%");
  });

  it("keeps a danger button's red fill while it fills the host", () => {
    render(
      <V8Button text="Delete" appearance="danger" tooltip="Gone for good" />,
    );
    const button = screen.getByRole("button", { name: "Delete" });
    const cs = getComputedStyle(button);
    expect(cs.width).toBe("100%");
    expect(cs.backgroundColor).toBe("rgb(164, 38, 44)"); // the default theme's redDark
  });

  it("leaves a button without a tooltip its natural width", () => {
    render(<V8Button text="Submit" />);
    const button = screen.getByRole("button", { name: "Submit" });
    expect(getComputedStyle(button).width).not.toBe("100%");
  });
});

describe("placeholder", () => {
  it("shows a Dropdown's placeholder while nothing is picked", () => {
    render(
      <V8Dropdown
        ariaLabel="Offices"
        value={[]}
        onChange={vi.fn()}
        options={opts}
        multiselect
        placeholder="None = all"
      />,
    );
    expect(screen.getByText("None = all")).toBeInTheDocument();
  });

  it("shows a single Dropdown's placeholder too", () => {
    render(
      <V8Dropdown
        ariaLabel="Office"
        value={undefined}
        onChange={vi.fn()}
        options={opts}
        placeholder="Pick one"
      />,
    );
    expect(screen.getByText("Pick one")).toBeInTheDocument();
  });

  it("puts a Combobox's placeholder on its input", () => {
    render(
      <V8Combobox
        label="Office"
        value={[]}
        onChange={vi.fn()}
        onResolveSuggestions={async () => []}
        placeholder="Any office"
      />,
    );
    expect(screen.getByRole("combobox")).toHaveAttribute(
      "placeholder",
      "Any office",
    );
  });
});
