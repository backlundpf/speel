import { describe, it, expect } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
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
const many = Array.from({ length: 12 }, (_, i) =>
  Object.assign(new Task(), {
    Id: i + 1,
    Title: `T${i + 1}`,
    Status: i % 2 === 0 ? "Open" : "Closed",
  }),
);
const bodyRowCount = (): number => screen.getAllByRole("row").length - 1;
// The current page is a dropdown, so the assertion reads its value rather than static text.
const pageValue = (): string =>
  (screen.getByLabelText("Page") as HTMLSelectElement).value;

describe("SpeelTable pagination", () => {
  it("renders one page at a time and walks pages", () => {
    wrap(<SpeelTable of={Task} items={many} pageSize={5} />);
    expect(bodyRowCount()).toBe(5);
    expect(pageValue()).toBe("1");
    expect(screen.getByText("of 3")).toBeInTheDocument();
    expect(screen.getByText("12 items")).toBeInTheDocument();
    expect(screen.getByText("T1")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Next page" }));
    expect(pageValue()).toBe("2");
    expect(screen.getByText("T6")).toBeInTheDocument();
    expect(screen.queryByText("T1")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Next page" }));
    expect(bodyRowCount()).toBe(2);
    expect(screen.getByRole("button", { name: "Next page" })).toBeDisabled();
  });

  it("reads as one line: chevron, Page, picker, of N, chevron", () => {
    // The picker used to carry field chrome, which stacks its label above the
    // control — the chevrons then centred against a two-line block and nothing
    // shared a baseline.
    wrap(<SpeelTable of={Task} items={many} pageSize={5} />);
    const word = screen.getByText("Page");
    expect(word.tagName).toBe("SPAN"); // inline text, not a field's <label>
    const row = word.parentElement!;
    expect(row).toContainElement(screen.getByLabelText("Page"));
    expect(row).toContainElement(screen.getByText("of 3"));
    expect(
      within(row)
        .getAllByRole("button")
        .map((b) => b.getAttribute("title")),
    ).toEqual(["Previous page", "Next page"]);
  });

  it("jumps straight to a page from the page dropdown", () => {
    wrap(<SpeelTable of={Task} items={many} pageSize={5} />);
    fireEvent.change(screen.getByLabelText("Page"), { target: { value: "3" } });
    expect(pageValue()).toBe("3");
    expect(screen.getByText("T11")).toBeInTheDocument();
    expect(screen.queryByText("T1")).toBeNull();
  });

  it("renders no page controls but still the count when pageSize is omitted", () => {
    wrap(<SpeelTable of={Task} items={many} />);
    expect(bodyRowCount()).toBe(12);
    expect(screen.queryByRole("button", { name: "Next page" })).toBeNull();
    expect(screen.queryByLabelText("Page")).toBeNull();
    expect(screen.getByText("12 items")).toBeInTheDocument();
  });

  it("changes the slice from the page-size picker", () => {
    wrap(
      <SpeelTable
        of={Task}
        items={many}
        pageSize={5}
        pageSizeOptions={[5, 10]}
      />,
    );
    fireEvent.change(screen.getByLabelText("Rows per page"), {
      target: { value: "10" },
    });
    expect(bodyRowCount()).toBe(10);
    expect(pageValue()).toBe("1");
    expect(screen.getByText("of 2")).toBeInTheDocument();
  });

  it("returns to page 1 when a filter changes", async () => {
    wrap(
      <SpeelTable
        of={Task}
        items={many}
        pageSize={5}
        columns={[{ key: "Title" }, { key: "Status" }]}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Next page" }));
    expect(pageValue()).toBe("2");

    fireEvent.click(screen.getByRole("button", { name: "Filter Status" }));
    fireEvent.focus(screen.getByLabelText("Status"));
    fireEvent.click(await screen.findByRole("button", { name: "Open" }));
    expect(pageValue()).toBe("1");
    expect(screen.getByText("of 2")).toBeInTheDocument();
  });

  it("returns to page 1 when the sort changes", () => {
    wrap(<SpeelTable of={Task} items={many} pageSize={5} />);
    fireEvent.click(screen.getByRole("button", { name: "Next page" }));
    fireEvent.click(screen.getByRole("button", { name: /^Title/ }));
    expect(pageValue()).toBe("1");
    expect(screen.getByText("of 3")).toBeInTheDocument();
  });

  it("clamps rather than blanks when a reload shrinks the set", () => {
    const { rerender } = wrap(
      <SpeelTable of={Task} items={many} pageSize={5} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Next page" }));
    fireEvent.click(screen.getByRole("button", { name: "Next page" }));
    expect(pageValue()).toBe("3");

    const ctx = new TCtx({
      provider: makeFakeProvider({ Tasks: [] }),
    } as never);
    rerender(
      <SpeelProvider db={ctx as never} ui={fakeAdapter}>
        <SpeelTable of={Task} items={many.slice(0, 7)} pageSize={5} />
      </SpeelProvider>,
    );
    expect(pageValue()).toBe("2");
    expect(screen.getByText("of 2")).toBeInTheDocument();
    expect(bodyRowCount()).toBe(2);
  });
});
