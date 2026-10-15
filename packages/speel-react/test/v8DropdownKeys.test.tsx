import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { V8Dropdown } from "../src/fluent-v8/primitives.js";

const opts = [
  { key: "a", text: "Alpha", data: "a" },
  { key: "b", text: "Beta", data: "b" },
  { key: "c", text: "Gamma", data: "c" },
];
const KEYS = {
  ArrowDown: 40,
  ArrowUp: 38,
  Home: 36,
  End: 35,
} as const;
const press = (el: Element, key: keyof typeof KEYS, extra = {}) =>
  fireEvent.keyDown(el, {
    key,
    which: KEYS[key],
    keyCode: KEYS[key],
    ...extra,
  });

function setup() {
  const onChange = vi.fn();
  render(
    <V8Dropdown label="Status" value="b" options={opts} onChange={onChange} />,
  );
  return { onChange, box: screen.getByRole("combobox") };
}

describe("V8Dropdown on a closed single-select", () => {
  it.each(["ArrowDown", "ArrowUp"] as const)(
    "%s opens the list and keeps the value",
    (key) => {
      const { onChange, box } = setup();
      press(box, key);
      expect(onChange).not.toHaveBeenCalled();
      expect(box).toHaveAttribute("aria-expanded", "true");
    },
  );

  it.each(["Home", "End"] as const)("%s does nothing", (key) => {
    const { onChange, box } = setup();
    press(box, key);
    expect(onChange).not.toHaveBeenCalled();
    expect(box).toHaveAttribute("aria-expanded", "false");
  });

  it("Alt+ArrowDown still opens it", () => {
    const { onChange, box } = setup();
    press(box, "ArrowDown", { altKey: true });
    expect(onChange).not.toHaveBeenCalled();
    expect(box).toHaveAttribute("aria-expanded", "true");
  });
});
