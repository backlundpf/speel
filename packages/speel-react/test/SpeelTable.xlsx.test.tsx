import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createRef } from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { DbContext, ModelBuilder } from "@speel/core";
import { unzipSync, strFromU8 } from "fflate";
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

// jsdom's Blob hides its parts and cannot download, so capture the bytes at construction
// and stub the anchor click — the same harness SpeelTable.export.test.tsx uses for CSV.
let capturedBytes: Uint8Array | undefined;
let capturedType = "";
const RealBlob = globalThis.Blob;
class CapturingBlob extends RealBlob {
  constructor(parts: BlobPart[], options?: BlobPropertyBag) {
    super(parts, options);
    const first = parts[0];
    capturedBytes = first instanceof Uint8Array ? first : undefined;
    capturedType = options?.type ?? "";
  }
}
globalThis.Blob = CapturingBlob as typeof Blob;

let written: { name: string } | undefined;
beforeEach(() => {
  capturedBytes = undefined;
  capturedType = "";
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
afterEach(() => vi.restoreAllMocks());

const sheet = (): string =>
  strFromU8(unzipSync(capturedBytes!)["xl/worksheets/sheet1.xml"]!);
const rowCount = (): number => (sheet().match(/<row /g) ?? []).length;

describe("SpeelTable Excel export", () => {
  it("renders no Excel button unless asked", () => {
    wrap(<SpeelTable of={Task} items={many} exportCsv />);
    expect(screen.queryByRole("button", { name: "Export Excel" })).toBeNull();
  });

  it("exports every matched row with the Excel icon on the button", () => {
    wrap(
      <SpeelTable
        of={Task}
        items={many}
        pageSize={5}
        exportXlsx
        columns={[{ key: "Title" }]}
      />,
    );
    const button = screen.getByRole("button", { name: "Export Excel" });
    expect(button.getAttribute("data-icon")).toBe("ExcelDocument");
    fireEvent.click(button);
    expect(rowCount()).toBe(13); // header + 12, not the 5-row page
    expect(capturedType).toBe(
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    expect(written?.name).toMatch(/^Task-\d{4}-\d{2}-\d{2}\.xlsx$/);
  });

  it("exports the filtered set and honours the prefix and sheet name", () => {
    wrap(
      <SpeelTable
        of={Task}
        items={many}
        exportXlsx={{ fileNamePrefix: "tasks", sheetName: "Open tasks" }}
        columns={[{ key: "Title" }, { key: "Status" }]}
        defaultTableState={{
          columns: [],
          filters: { Status: { kind: "select", selected: ["Open"] } },
        }}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Export Excel" }));
    expect(rowCount()).toBe(7);
    expect(written?.name).toMatch(/^tasks-/);
    expect(strFromU8(unzipSync(capturedBytes!)["xl/workbook.xml"]!)).toContain(
      '<sheet name="Open tasks"',
    );
  });

  it("is reachable through the handle", () => {
    const ref = createRef<SpeelTableHandle>();
    wrap(
      <SpeelTable
        ref={ref}
        of={Task}
        items={many}
        exportXlsx
        columns={[{ key: "Title" }]}
      />,
    );
    ref.current!.exportXlsx();
    expect(rowCount()).toBe(13);
  });

  it("sits beside CSV and Print when all three are on", () => {
    wrap(<SpeelTable of={Task} items={many} exportCsv exportXlsx print />);
    expect(screen.getByRole("button", { name: "Export CSV" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Export Excel" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Print" })).toBeTruthy();
  });
});
