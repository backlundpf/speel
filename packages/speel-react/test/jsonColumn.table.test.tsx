import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { DbContext, ModelBuilder } from "@speel/core";
import { SpeelProvider } from "../src/SpeelProvider.js";
import { SpeelTable } from "../src/table/SpeelTable.js";
import { fakeAdapter } from "./fakeAdapter.js";
import { makeFakeProvider } from "./fakeProvider.js";

// A shape column, same fluent-idiom note as jsonField.multi.test.tsx: this package's
// vitest has no decorator transform, so the model is built with mb.shape/mb.entity,
// never decorators.
class TaskDefinition {
  TaskTitle?: string;
  TaskNotes?: string;
}

class Process {
  Id?: number;
  Steps?: TaskDefinition[];
}

class PCtx extends DbContext {
  protected override onModelCreating(mb: ModelBuilder): void {
    mb.shape(TaskDefinition, (b) => {
      b.property((e) => e.TaskTitle)
        .isText()
        .hasDisplayName("Task title");
      b.property((e) => e.TaskNotes)
        .isText()
        .hasDisplayName("Task notes");
    });
    mb.entity(Process, (b) => {
      b.toList("Processes");
      b.property((e) => e.Id).isNumber();
      b.property((e) => e.Steps)
        .isMultiJson({ of: () => TaskDefinition })
        .hasDisplayName("Steps");
    });
  }
}

function step(title: string, notes = ""): TaskDefinition {
  return Object.assign(new TaskDefinition(), {
    TaskTitle: title,
    TaskNotes: notes,
  });
}

function wrap(node: JSX.Element) {
  const ctx = new PCtx({
    provider: makeFakeProvider({ Processes: [] }),
  } as never);
  return render(
    <SpeelProvider db={ctx as never} ui={fakeAdapter}>
      {node}
    </SpeelProvider>,
  );
}

const rows = [
  Object.assign(new Process(), { Id: 1, Steps: [step("Cut"), step("Weld")] }),
  Object.assign(new Process(), { Id: 2, Steps: [step("Bolt")] }),
];

// jsdom's Blob does not expose its parts and Blob.text() is async, so capture the CSV at
// construction time; the anchor click is stubbed since jsdom cannot download. Same harness
// as SpeelTable.export.test.tsx.
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
afterEach(() => {
  vi.restoreAllMocks();
});

const lines = (): string[] =>
  capturedText.replace("﻿", "").trimEnd().split("\r\n");

describe("SpeelTable: a Json column", () => {
  it("shows the joined headline text, not [object Object]", () => {
    wrap(<SpeelTable of={Process} items={rows} columns={["Steps"]} />);
    expect(screen.getByText("Cut, Weld")).toBeInTheDocument();
    expect(screen.getByText("Bolt")).toBeInTheDocument();
    expect(screen.queryByText(/object Object/i)).toBeNull();
  });

  it("offers no sort affordance on the header", () => {
    wrap(<SpeelTable of={Process} items={rows} columns={["Steps"]} />);
    // Same idiom SpeelTable.test.tsx's "sortable={false} removes header sort
    // buttons" uses: fakeAdapter's FakeTableHeaderCell renders a sortable header
    // as a <button> and a non-sortable one as a plain <span> (see
    // packages/speel-react/test/fakeAdapter.tsx). A Json column must resolve
    // sortable: false, so no button named "Steps" exists — the header text still
    // renders, just inertly.
    expect(screen.queryByRole("button", { name: "Steps" })).toBeNull();
    expect(screen.getByText("Steps")).toBeInTheDocument();
  });

  it("offers no filter control", () => {
    wrap(<SpeelTable of={Process} items={rows} columns={["Steps"]} />);
    // Every other column's filter flyout is a "Filter <header>" button (see
    // SpeelTable.test.tsx's filtering describe block) — a Json column must
    // resolve `{ kind: "none" }` so `fieldMeta` omits `filter` entirely and no
    // such button renders.
    expect(screen.queryByRole("button", { name: "Filter Steps" })).toBeNull();
  });

  it("exports the same joined text to CSV", () => {
    wrap(
      <SpeelTable of={Process} items={rows} exportCsv columns={["Steps"]} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Export CSV" }));
    // The cell text contains a comma, so the CSV writer quotes it — still the
    // same joined text the cell shows.
    expect(lines()).toEqual(["Steps", '"Cut, Weld"', "Bolt"]);
  });
});
