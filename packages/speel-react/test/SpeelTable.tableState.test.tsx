import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { DbContext, ModelBuilder } from "@speel/core";
import { SpeelProvider } from "../src/SpeelProvider.js";
import { SpeelTable } from "../src/table/SpeelTable.js";
import { fakeAdapter } from "./fakeAdapter.js";
import { makeFakeProvider } from "./fakeProvider.js";

class Task {
  Id?: number;
  Title?: string;
  Status?: string;
}
class TCtx extends DbContext {
  protected override onModelCreating(mb: ModelBuilder): void {
    mb.entity(Task, (b) => {
      b.toList("Tasks");
      b.property((e) => e.Id).isNumber();
      b.property((e) => e.Title)
        .isText()
        .hasDisplayName("Title");
      b.property((e) => e.Status)
        .isChoice()
        .hasOptions(["Open", "Closed"])
        .hasDisplayName("Status");
    });
  }
}
function wrap(node: JSX.Element) {
  const ctx = new TCtx({ provider: makeFakeProvider({ Tasks: [] }) } as never);
  return render(
    <SpeelProvider db={ctx as never} ui={fakeAdapter}>
      {node}
    </SpeelProvider>,
  );
}
const rows = [
  Object.assign(new Task(), { Id: 1, Title: "A", Status: "Open" }),
  Object.assign(new Task(), { Id: 2, Title: "B", Status: "Closed" }),
];
const headers = (): string[] =>
  screen
    .getAllByRole("columnheader")
    .map((h) => h.textContent?.replace(/[▲▼▽]/g, "").trim() ?? "");

// Capture exported CSV without downloading (jsdom has neither).
let capturedText = "";
const RealBlob = globalThis.Blob;
class CapturingBlob extends RealBlob {
  constructor(parts: BlobPart[], options?: BlobPropertyBag) {
    super(parts, options);
    capturedText = parts.map(String).join("");
  }
}
globalThis.Blob = CapturingBlob as typeof Blob;
beforeEach(() => {
  capturedText = "";
  Object.defineProperty(URL, "createObjectURL", {
    configurable: true,
    value: () => "blob:fake",
  });
  Object.defineProperty(URL, "revokeObjectURL", {
    configurable: true,
    value: () => undefined,
  });
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(
    () => undefined,
  );
});
afterEach(() => vi.restoreAllMocks());

describe("SpeelTable column state", () => {
  it("renders prop order when no state is given", () => {
    wrap(
      <SpeelTable
        of={Task}
        items={rows}
        columns={[{ key: "Title" }, { key: "Status" }]}
      />,
    );
    expect(headers()).toEqual(["Title", "Status"]);
  });

  it("reorders and hides from a controlled state", () => {
    wrap(
      <SpeelTable
        of={Task}
        items={rows}
        columns={[{ key: "Title" }, { key: "Status" }]}
        tableState={{
          columns: [{ key: "Status" }, { key: "Title", hidden: true }],
        }}
      />,
    );
    expect(headers()).toEqual(["Status"]);
  });

  it("appends a column the state never mentions", () => {
    wrap(
      <SpeelTable
        of={Task}
        items={rows}
        columns={[{ key: "Title" }, { key: "Status" }]}
        tableState={{ columns: [{ key: "Status" }] }}
      />,
    );
    expect(headers()).toEqual(["Status", "Title"]);
  });

  it("ignores a state key that is not a column", () => {
    wrap(
      <SpeelTable
        of={Task}
        items={rows}
        columns={[{ key: "Title" }]}
        tableState={{ columns: [{ key: "Ghost" }, { key: "Title" }] }}
      />,
    );
    expect(headers()).toEqual(["Title"]);
  });

  it("seeds internal state from defaultTableState", () => {
    wrap(
      <SpeelTable
        of={Task}
        items={rows}
        columns={[{ key: "Title" }, { key: "Status" }]}
        defaultTableState={{ columns: [{ key: "Status" }, { key: "Title" }] }}
      />,
    );
    expect(headers()).toEqual(["Status", "Title"]);
  });

  it("a resize is session state: applied visually, never reported", () => {
    const onTableStateChange = vi.fn();
    wrap(
      <SpeelTable
        of={Task}
        items={rows}
        columns={[{ key: "Title" }, { key: "Status" }]}
        onTableStateChange={onTableStateChange}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Resize Title" }));
    expect(onTableStateChange).not.toHaveBeenCalled();
    const title = screen.getAllByRole("columnheader")[0]!;
    expect(title.getAttribute("data-width")).toBe("250");
  });

  it("a resize applies even in controlled mode, without touching the state", () => {
    const onTableStateChange = vi.fn();
    wrap(
      <SpeelTable
        of={Task}
        items={rows}
        columns={[{ key: "Title" }, { key: "Status" }]}
        tableState={{ columns: [{ key: "Title" }, { key: "Status" }] }}
        onTableStateChange={onTableStateChange}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Resize Title" }));
    expect(onTableStateChange).not.toHaveBeenCalled();
    const title = screen.getAllByRole("columnheader")[0]!;
    expect(title.getAttribute("data-width")).toBe("250");
  });

  it("excludes hidden columns from CSV export", () => {
    wrap(
      <SpeelTable
        of={Task}
        items={rows}
        exportCsv
        columns={[{ key: "Title" }, { key: "Status" }]}
        tableState={{
          columns: [{ key: "Title" }, { key: "Status", hidden: true }],
        }}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Export CSV" }));
    const lines = capturedText.replace("﻿", "").trimEnd().split("\r\n");
    expect(lines[0]).toBe("Title");
    expect(lines[1]).toBe("A");
  });

  it("keeps a filter applied when its column is hidden, and the chip still clears it", () => {
    // Uncontrolled: the filter and the hidden column now live in one value, so clearing the
    // chip has somewhere to write.
    wrap(
      <SpeelTable
        of={Task}
        items={rows}
        columns={[{ key: "Title" }, { key: "Status" }]}
        defaultTableState={{
          columns: [{ key: "Title" }, { key: "Status", hidden: true }],
          filters: { Status: { kind: "select", selected: ["Open"] } },
        }}
      />,
    );
    expect(headers()).toEqual(["Title"]);
    expect(screen.getByText("A")).toBeInTheDocument();
    expect(screen.queryByText("B")).toBeNull(); // filter still applied
    fireEvent.click(screen.getByRole("button", { name: "Clear Status" }));
    expect(screen.getByText("B")).toBeInTheDocument();
  });
});
