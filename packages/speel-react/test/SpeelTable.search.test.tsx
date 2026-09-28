import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { DbContext, ModelBuilder } from "@speel/core";
import { SpeelProvider } from "../src/SpeelProvider.js";
import { SpeelTable, type SpeelTableProps } from "../src/table/SpeelTable.js";
import { fakeAdapter } from "./fakeAdapter.js";
import { makeFakeProvider } from "./fakeProvider.js";

class Task {
  Id?: number;
  Title?: string;
  Owner?: string;
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
      b.property((e) => e.Owner)
        .isText()
        .hasDisplayName("Owner");
      b.property((e) => e.Status)
        .isChoice()
        .hasOptions(["Open", "Closed"])
        .hasDisplayName("Status");
    });
  }
}
function wrap(props: Partial<SpeelTableProps<Task>> = {}) {
  const ctx = new TCtx({ provider: makeFakeProvider({ Tasks: [] }) } as never);
  return render(
    <SpeelProvider db={ctx as never} ui={fakeAdapter}>
      <SpeelTable of={Task} items={rows} search {...props} />
    </SpeelProvider>,
  );
}
const rows = [
  Object.assign(new Task(), {
    Id: 1,
    Title: "Audit plan",
    Owner: "Smith",
    Status: "Open",
  }),
  Object.assign(new Task(), {
    Id: 2,
    Title: "Budget review",
    Owner: "Jones",
    Status: "Closed",
  }),
  Object.assign(new Task(), {
    Id: 3,
    Title: "Audit report",
    Owner: "Jones",
    Status: "Open",
  }),
];

const box = (): HTMLInputElement =>
  screen.getByRole("searchbox", { name: "Search" });

/** Type into the box and let the commit debounce elapse. */
const search = (text: string): void => {
  fireEvent.change(box(), { target: { value: text } });
  act(() => {
    vi.advanceTimersByTime(300);
  });
};

const titles = (): string[] =>
  screen
    .getAllByRole("row")
    .slice(1)
    .map((r) => r.cells[0]!.textContent!);

describe("SpeelTable search", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("narrows the rows to those whose visible text contains the query", () => {
    wrap();
    search("audit");
    expect(titles()).toEqual(["Audit plan", "Audit report"]);
  });

  it("waits for typing to pause before it narrows", () => {
    wrap();
    fireEvent.change(box(), { target: { value: "budget" } });
    expect(titles()).toHaveLength(3);
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(titles()).toEqual(["Budget review"]);
  });

  it("requires every term, in any column, ignoring case", () => {
    wrap();
    search("AUDIT jones");
    expect(titles()).toEqual(["Audit report"]);
  });

  it("does not read a hidden column", () => {
    wrap({
      defaultTableState: { columns: [{ key: "Owner", hidden: true }] },
    });
    search("smith");
    expect(screen.queryAllByRole("row")).toHaveLength(0);
  });

  it("counts the search as a filter in the footer", () => {
    wrap();
    search("audit");
    expect(screen.getByText("2 of 3 items")).toBeInTheDocument();
  });

  it("clears with the chip bar's Clear", () => {
    wrap({
      defaultTableState: {
        columns: [],
        filters: { Status: { kind: "select", selected: ["Open"] } },
      },
    });
    search("plan");
    expect(titles()).toEqual(["Audit plan"]);
    fireEvent.click(screen.getByRole("button", { name: "Clear" }));
    expect(titles()).toHaveLength(3);
    expect(box().value).toBe("");
  });

  it("returns to the first page when the search changes", () => {
    wrap({ pageSize: 2 });
    fireEvent.click(screen.getByRole("button", { name: "Next page" }));
    expect((screen.getByLabelText("Page") as HTMLSelectElement).value).toBe(
      "2",
    );
    search("audit");
    expect((screen.getByLabelText("Page") as HTMLSelectElement).value).toBe(
      "1",
    );
  });

  it("searches even when column filtering is off", () => {
    wrap({ filterable: false });
    search("jones");
    expect(titles()).toEqual(["Budget review", "Audit report"]);
  });

  it("is controlled through tableState and reported through onTableStateChange", () => {
    const onChange = vi.fn();
    const { rerender } = wrap({
      tableState: { columns: [], search: "budget" },
      onTableStateChange: onChange,
    });
    expect(titles()).toEqual(["Budget review"]);
    expect(box().value).toBe("budget");
    search("audit");
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ search: "audit", page: 0 }),
    );
    // Controlled: the rows follow the prop, not the keystroke.
    expect(titles()).toEqual(["Budget review"]);
    const ctx = new TCtx({
      provider: makeFakeProvider({ Tasks: [] }),
    } as never);
    rerender(
      <SpeelProvider db={ctx as never} ui={fakeAdapter}>
        <SpeelTable
          of={Task}
          items={rows}
          search
          tableState={{ columns: [], search: "report" }}
          onTableStateChange={onChange}
        />
      </SpeelProvider>,
    );
    expect(titles()).toEqual(["Audit report"]);
    // An outside change replaces what was typed.
    expect(box().value).toBe("report");
  });
});
