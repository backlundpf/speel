import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { fluentV8Adapter } from "../src/fluent-v8/index.js";

describe("V8SearchBox", () => {
  it("renders Fluent's search box under the given name and reports typing", () => {
    const onChange = vi.fn();
    render(
      <fluentV8Adapter.SearchBox
        value=""
        onChange={onChange}
        placeholder="Search requests"
        ariaLabel="Search"
      />,
    );
    const box = screen.getByRole("searchbox", { name: "Search" });
    expect(box).toHaveAttribute("placeholder", "Search requests");
    fireEvent.change(box, { target: { value: "smith" } });
    expect(onChange).toHaveBeenCalledWith("smith");
  });

  it("reports an empty string when its clear button is pressed", () => {
    const onChange = vi.fn();
    render(<fluentV8Adapter.SearchBox value="smith" onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "Clear text" }));
    expect(onChange).toHaveBeenCalledWith("");
  });

  it("falls back to the placeholder, then 'Search', for its name", () => {
    const { unmount } = render(
      <fluentV8Adapter.SearchBox
        value=""
        onChange={() => undefined}
        placeholder="Find"
      />,
    );
    expect(screen.getByRole("searchbox", { name: "Find" })).toBeInTheDocument();
    unmount();
    render(<fluentV8Adapter.SearchBox value="" onChange={() => undefined} />);
    expect(
      screen.getByRole("searchbox", { name: "Search" }),
    ).toBeInTheDocument();
  });
});
