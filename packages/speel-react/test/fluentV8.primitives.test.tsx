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

/** Stubs an element's layout widths: jsdom lays nothing out. */
const sized = (
  el: HTMLElement,
  scrollWidth: number,
  clientWidth: number,
): void => {
  Object.defineProperty(el, "scrollWidth", {
    value: scrollWidth,
    configurable: true,
  });
  Object.defineProperty(el, "clientWidth", {
    value: clientWidth,
    configurable: true,
  });
};

describe("V8Button appearance link", () => {
  it("renders a Fluent Link as a button that truncates at the end", () => {
    const onClick = vi.fn();
    render(
      <V8Button appearance="link" text="A long title" onClick={onClick} />,
    );
    const link = screen.getByRole("button", { name: "A long title" });
    expect(link.className).toContain("ms-Link");
    expect(link).toHaveAttribute("type", "button");
    expect(link).toHaveAttribute("data-appearance", "link");
    const cs = getComputedStyle(link);
    expect([
      cs.display,
      cs.overflow,
      cs.textOverflow,
      cs.whiteSpace,
      cs.maxWidth,
      cs.verticalAlign,
      cs.textAlign,
    ]).toEqual([
      "inline-block",
      "hidden",
      "ellipsis",
      "nowrap",
      "100%",
      "top",
      "start",
    ]);
    fireEvent.click(link);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("renders its icon before the text, outside the accessible name", () => {
    render(<V8Button appearance="link" text="Open" iconName="OpenInNewTab" />);
    const link = screen.getByRole("button", { name: "Open" });
    const icon = link.querySelector('[data-icon-name="OpenInNewTab"]');
    expect(icon).not.toBeNull();
    expect(link.firstChild).toBe(icon);
  });

  it("titles a cut-off link with its text on hover, and a fitting one not at all", () => {
    render(<V8Button appearance="link" text="A long title" />);
    const link = screen.getByRole("button", { name: "A long title" });
    sized(link, 200, 80);
    fireEvent.mouseEnter(link);
    expect(link.title).toBe("A long title");
    sized(link, 80, 80);
    fireEvent.mouseEnter(link);
    expect(link.hasAttribute("title")).toBe(false);
  });

  it("leaves hover text to the tooltip when there is one", () => {
    render(
      <V8Button appearance="link" text="A long title" tooltip="Open it" />,
    );
    const link = screen.getByRole("button", { name: "A long title" });
    expect(link).toHaveAccessibleDescription("Open it");
    sized(link, 200, 80);
    fireEvent.mouseEnter(link);
    expect(link.hasAttribute("title")).toBe(false);
  });

  it("keeps a disabled link's tooltip reachable and never fires onClick", async () => {
    const onClick = vi.fn();
    render(
      <V8Button
        appearance="link"
        text="Go"
        tooltip="Not yet"
        disabled
        onClick={onClick}
      />,
    );
    const link = screen.getByRole("button", { name: "Go" });
    fireEvent.click(link);
    expect(onClick).not.toHaveBeenCalled();
    expect(link.getAttribute("aria-describedby")).toBeTruthy();
    // As with the other appearances: aria-disabled, not the native attribute that
    // swallows the pointer and focus events the tooltip opens on.
    expect(link).toHaveAttribute("aria-disabled", "true");
    expect(link).not.toBeDisabled();
    fireEvent.mouseEnter(link.parentElement!);
    await waitFor(
      () => expect(screen.getAllByText("Not yet")).toHaveLength(2),
      { timeout: 2000 },
    );
  });

  it("is natively disabled without a tooltip", () => {
    const onClick = vi.fn();
    render(<V8Button appearance="link" text="Go" disabled onClick={onClick} />);
    const link = screen.getByRole("button", { name: "Go" });
    expect(link).toBeDisabled();
    fireEvent.click(link);
    expect(onClick).not.toHaveBeenCalled();
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

  it("bounds a tooltip link's host by its container, so the link still cuts itself off", () => {
    const { container } = render(
      <V8Button appearance="link" text="A long title" tooltip="Open it" />,
    );
    const host = container.firstElementChild as HTMLElement;
    expect(getComputedStyle(host).display).toBe("inline-block");
    expect(getComputedStyle(host).maxWidth).toBe("100%");
    const link = screen.getByRole("button", { name: "A long title" });
    expect(getComputedStyle(link).width).toBe("100%");
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
