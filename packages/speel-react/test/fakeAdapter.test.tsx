import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { fakeAdapter } from "./fakeAdapter.js";

describe("fake adapter satisfies SpeelUIAdapter", () => {
  it("TextInput renders chrome + reports changes", () => {
    const onChange = vi.fn();
    render(
      <fakeAdapter.TextInput
        label="Title"
        value="hi"
        onChange={onChange}
        error="bad"
        required
      />,
    );
    expect(screen.getByLabelText(/Title/)).toHaveValue("hi");
    expect(screen.getByText("bad")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/Title/), {
      target: { value: "ho" },
    });
    expect(onChange).toHaveBeenCalledWith("ho");
  });
  it("Checkbox toggles boolean", () => {
    const onChange = vi.fn();
    render(
      <fakeAdapter.Checkbox
        label="Public"
        checked={false}
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByLabelText(/Public/));
    expect(onChange).toHaveBeenCalledWith(true);
  });
});

describe("fakeAdapter.FileInput", () => {
  it("renders chrome, surfaces the chosen file, and propagates changes", () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <fakeAdapter.FileInput
        label="File"
        required
        value={undefined}
        onChange={onChange}
      />,
    );
    const input = screen.getByLabelText(/File/) as HTMLInputElement;
    const f = new File(["x"], "a.txt");
    fireEvent.change(input, { target: { files: [f] } });
    expect(onChange).toHaveBeenCalledWith(f);
    rerender(
      <fakeAdapter.FileInput
        label="File"
        required
        value={f}
        onChange={onChange}
        error="A file is required."
      />,
    );
    expect(screen.getByText("a.txt")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("A file is required.");
  });
});
