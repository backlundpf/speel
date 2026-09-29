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

// jsdom cannot print, so the whole popup is a stub; the document it is handed is the assertion
// surface — the same document a real browser would print.
let written: string[] = [];
let printed = 0;
let closed = 0;
const fakeWin = {
  document: {
    write: (s: string) => written.push(s),
    close: () => undefined,
  },
  focus: () => undefined,
  print: () => {
    printed++;
  },
  close: () => {
    closed++;
  },
  addEventListener: (ev: string, cb: () => void) => {
    if (ev === "afterprint") cb();
  },
};
beforeEach(() => {
  written = [];
  printed = 0;
  closed = 0;
  vi.spyOn(window, "open").mockReturnValue(fakeWin as unknown as Window);
});
afterEach(() => {
  vi.restoreAllMocks();
});

const doc = (): string => written.join("");
const bodyRows = (): string[] =>
  doc()
    .split("<tbody>")[1]!
    .split("</tbody>")[0]!
    .split("</tr>")
    .filter((r) => r.includes("<td>"));

describe("SpeelTable print", () => {
  it("renders no Print button unless asked", () => {
    wrap(<SpeelTable of={Task} items={many} exportCsv />);
    expect(screen.queryByRole("button", { name: "Print" })).toBeNull();
  });

  it("prints every matched row with the print icon on the button", () => {
    wrap(
      <SpeelTable
        of={Task}
        items={many}
        pageSize={5}
        print
        columns={[{ key: "Title" }]}
      />,
    );
    const button = screen.getByRole("button", { name: "Print" });
    expect(button.getAttribute("data-icon")).toBe("Print");
    fireEvent.click(button);
    expect(bodyRows()).toHaveLength(12); // the whole filtered set, not the 5-row page
    expect(doc()).toContain("<th>Title</th>");
    expect(printed).toBe(1);
    expect(closed).toBe(1); // afterprint closes the popup
  });

  it("prints only the filtered rows", () => {
    wrap(
      <SpeelTable
        of={Task}
        items={many}
        print
        columns={[{ key: "Title" }, { key: "Status" }]}
        defaultTableState={{
          columns: [],
          filters: { Status: { kind: "select", selected: ["Open"] } },
        }}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Print" }));
    expect(bodyRows()).toHaveLength(6);
    expect(doc()).toContain("<td>Open</td>");
    expect(doc()).not.toContain("<td>Closed</td>");
  });

  it("omits a column hidden in the chooser", () => {
    wrap(
      <SpeelTable
        of={Task}
        items={many}
        print
        columnChooser
        columns={[{ key: "Title" }, { key: "Status" }]}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Choose columns" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Status" }));
    fireEvent.click(screen.getByRole("button", { name: "Print" }));
    expect(doc()).toContain("<th>Title</th>");
    expect(doc()).not.toContain("<th>Status</th>");
  });

  it("titles the document after the entity, or the supplied title", () => {
    const first = wrap(
      <SpeelTable of={Task} items={many} print columns={[{ key: "Title" }]} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Print" }));
    expect(doc()).toContain("<title>Task</title>");
    first.unmount();

    written = [];
    wrap(
      <SpeelTable
        of={Task}
        items={many}
        print={{ title: "Request Status Report" }}
        columns={[{ key: "Title" }]}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Print" }));
    expect(doc()).toContain("<title>Request Status Report</title>");
  });

  it("prints from the imperative handle even without the prop", () => {
    const ref = createRef<SpeelTableHandle>();
    wrap(
      <SpeelTable
        of={Task}
        items={many}
        ref={ref}
        columns={[{ key: "Title" }]}
      />,
    );
    expect(screen.queryByRole("button", { name: "Print" })).toBeNull();
    ref.current!.print();
    expect(bodyRows()).toHaveLength(12);
  });

  it("is a silent no-op when the popup is blocked", () => {
    vi.spyOn(window, "open").mockReturnValue(null);
    wrap(
      <SpeelTable of={Task} items={many} print columns={[{ key: "Title" }]} />,
    );
    expect(() =>
      fireEvent.click(screen.getByRole("button", { name: "Print" })),
    ).not.toThrow();
    expect(written).toHaveLength(0);
  });
});
