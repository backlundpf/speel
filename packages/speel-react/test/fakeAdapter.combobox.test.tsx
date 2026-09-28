import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { fakeAdapter } from "./fakeAdapter.js";

describe("fakeAdapter Combobox", () => {
  const opts = [
    { key: "1", text: "London", data: { Id: 1 } },
    { key: "2", text: "Lisbon", data: { Id: 2 } },
  ];

  it("resolves suggestions for what was typed and selects one", async () => {
    const onChange = vi.fn();
    const resolve = vi.fn(async (q: string) =>
      opts.filter((o) => o.text.toLowerCase().includes(q.toLowerCase())),
    );
    render(
      <fakeAdapter.Combobox
        label="Office"
        value={[]}
        onChange={onChange}
        onResolveSuggestions={resolve}
      />,
    );
    fireEvent.change(screen.getByLabelText("Office"), {
      target: { value: "lis" },
    });
    await waitFor(() => expect(resolve).toHaveBeenCalledWith("lis"));
    fireEvent.click(await screen.findByText("Lisbon"));
    expect(onChange).toHaveBeenCalledWith([opts[1]]);
  });

  it("asks with an empty query on focus", async () => {
    const resolve = vi.fn(async () => opts);
    render(
      <fakeAdapter.Combobox
        label="Office"
        value={[]}
        onChange={vi.fn()}
        onResolveSuggestions={resolve}
      />,
    );
    fireEvent.focus(screen.getByLabelText("Office"));
    await waitFor(() => expect(resolve).toHaveBeenCalledWith(""));
    expect(await screen.findByText("London")).toBeInTheDocument();
    expect(await screen.findByText("Lisbon")).toBeInTheDocument();
  });

  it("says so when a query matches nothing", async () => {
    render(
      <fakeAdapter.Combobox
        label="Office"
        value={[]}
        onChange={vi.fn()}
        onResolveSuggestions={async () => []}
        noResultsText="No offices match"
      />,
    );
    fireEvent.change(screen.getByLabelText("Office"), {
      target: { value: "zz" },
    });
    expect(await screen.findByText("No offices match")).toBeInTheDocument();
  });
});
