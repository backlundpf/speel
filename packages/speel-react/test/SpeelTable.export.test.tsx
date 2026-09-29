import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createRef } from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { DbContext, ModelBuilder } from "@speel/core";
import { SpeelProvider } from "../src/SpeelProvider.js";
import { SpeelTable, type SpeelTableHandle } from "../src/table/SpeelTable.js";
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
const many = Array.from({ length: 12 }, (_, i) =>
  Object.assign(new Task(), {
    Id: i + 1,
    Title: `T${i + 1}`,
    Status: i % 2 === 0 ? "Open" : "Closed",
  }),
);

// jsdom's Blob does not expose its parts and Blob.text() is async, so capture the CSV at
// construction time; the anchor click is stubbed since jsdom cannot download.
let capturedText = "";
const RealBlob = globalThis.Blob;
class CapturingBlob extends RealBlob {
  constructor(parts: BlobPart[], options?: BlobPropertyBag) {
    super(parts, options);
    capturedText = parts.map(String).join("");
  }
}
globalThis.Blob = CapturingBlob as typeof Blob;

let written: { name: string } | undefined;
beforeEach(() => {
  capturedText = "";
  written = undefined;
  Object.defineProperty(URL, "createObjectURL", {
    configurable: true,
    value: () => "blob:fake",
  });
  Object.defineProperty(URL, "revokeObjectURL", {
    configurable: true,
    value: () => undefined,
  });
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    written = { name: this.download };
  });
});
afterEach(() => {
  vi.restoreAllMocks();
});

const lines = (): string[] =>
  capturedText.replace("﻿", "").trimEnd().split("\r\n");

describe("SpeelTable CSV export", () => {
  it("renders no toolbar unless asked", () => {
    wrap(<SpeelTable of={Task} items={many} />);
    expect(screen.queryByRole("button", { name: "Export CSV" })).toBeNull();
  });

  it("exports every matched row, not just the visible page", () => {
    wrap(
      <SpeelTable
        of={Task}
        items={many}
        pageSize={5}
        exportCsv
        columns={[{ key: "Title" }]}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Export CSV" }));
    expect(lines()[0]).toBe("Title");
    expect(lines()).toHaveLength(13); // header + 12 rows
    expect(written?.name).toMatch(/^Task-\d{4}-\d{2}-\d{2}\.csv$/);
  });

  it("exports the filtered set and honours a file-name prefix", () => {
    wrap(
      <SpeelTable
        of={Task}
        items={many}
        exportCsv={{ fileNamePrefix: "tasks" }}
        columns={[{ key: "Title" }, { key: "Status" }]}
        defaultTableState={{
          columns: [],
          filters: { Status: { kind: "select", selected: ["Open"] } },
        }}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Export CSV" }));
    expect(lines()).toHaveLength(7); // header + the 6 Open rows
    expect(written?.name).toMatch(/^tasks-/);
  });

  it("the export button carries the download icon", () => {
    wrap(<SpeelTable of={Task} items={many} exportCsv />);
    expect(
      screen
        .getByRole("button", { name: "Export CSV" })
        .getAttribute("data-icon"),
    ).toBe("Download");
  });

  it("renders custom toolbar content alongside the button", () => {
    wrap(
      <SpeelTable
        of={Task}
        items={many}
        exportCsv
        toolbar={<button type="button">Refresh</button>}
      />,
    );
    expect(screen.getByRole("button", { name: "Refresh" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Export CSV" }),
    ).toBeInTheDocument();
  });

  it("exports from the imperative handle even without the prop", () => {
    const ref = createRef<SpeelTableHandle>();
    wrap(
      <SpeelTable
        of={Task}
        items={many}
        ref={ref}
        columns={[{ key: "Title" }]}
      />,
    );
    expect(screen.queryByRole("button", { name: "Export CSV" })).toBeNull();
    ref.current!.exportCsv();
    expect(lines()).toHaveLength(13);
  });
});
