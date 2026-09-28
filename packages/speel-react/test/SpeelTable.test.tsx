import { describe, it, expect, vi } from "vitest";
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

describe("SpeelTable", () => {
  it("renders auto columns + formatted cells", () => {
    wrap(<SpeelTable of={Task} items={rows} />);
    expect(screen.getByText("Title")).toBeInTheDocument(); // header
    expect(screen.getByText("Status")).toBeInTheDocument();
    expect(screen.getByText("A")).toBeInTheDocument(); // cell
    expect(screen.getByText("Closed")).toBeInTheDocument();
  });
  it("renders View/Edit/Delete only for provided handlers, firing with the row", () => {
    const onEdit = vi.fn();
    wrap(<SpeelTable of={Task} items={rows} rowActions={{ onEdit }} />);
    expect(screen.queryByRole("button", { name: "View" })).toBeNull();
    fireEvent.click(screen.getAllByRole("button", { name: "Edit" })[0]!);
    expect(onEdit).toHaveBeenCalledWith(rows[0]);
  });
  it("renders custom row actions after the built-ins, firing with the row", () => {
    const onEdit = vi.fn();
    const onUpload = vi.fn();
    wrap(
      <SpeelTable
        of={Task}
        items={rows}
        rowActions={{
          onEdit,
          custom: [
            {
              key: "up",
              iconName: "Upload",
              title: "Upload artifact",
              onClick: onUpload,
            },
          ],
        }}
      />,
    );
    const buttons = screen.getAllByRole("button");
    const editIdx = buttons.findIndex(
      (b) => b.getAttribute("title") === "Edit",
    );
    const upIdx = buttons.findIndex(
      (b) => b.getAttribute("title") === "Upload artifact",
    );
    expect(upIdx).toBeGreaterThan(editIdx); // custom after built-ins
    fireEvent.click(
      screen.getAllByRole("button", { name: "Upload artifact" })[1]!,
    );
    expect(onUpload).toHaveBeenCalledWith(rows[1]);
  });
  it("emits the actions column when ONLY custom actions are given", () => {
    const onUpload = vi.fn();
    wrap(
      <SpeelTable
        of={Task}
        items={rows}
        rowActions={{
          custom: [
            {
              key: "up",
              iconName: "Upload",
              title: "Upload artifact",
              onClick: onUpload,
            },
          ],
        }}
      />,
    );
    fireEvent.click(
      screen.getAllByRole("button", { name: "Upload artifact" })[0]!,
    );
    expect(onUpload).toHaveBeenCalledWith(rows[0]);
  });
  it("shows the empty message", () => {
    wrap(<SpeelTable of={Task} items={[]} emptyMessage="Nothing here" />);
    expect(screen.getByText("Nothing here")).toBeInTheDocument();
  });
  it("never fetches — renders only the supplied items", () => {
    const provider = makeFakeProvider({
      Tasks: [{ Id: 9, Title: "FromProvider" }],
    });
    const spy = vi.spyOn(
      provider as unknown as { getItemsPagedAsync: () => Promise<unknown> },
      "getItemsPagedAsync",
    );
    const ctx = new TCtx({ provider } as never);
    render(
      <SpeelProvider db={ctx as never} ui={fakeAdapter}>
        <SpeelTable of={Task} items={rows} />
      </SpeelProvider>,
    );
    expect(screen.getByText("A")).toBeInTheDocument();
    expect(screen.queryByText("FromProvider")).toBeNull();
    expect(spy).not.toHaveBeenCalled();
  });
});

describe("SpeelTable sorting", () => {
  const many = [
    Object.assign(new Task(), { Id: 1, Title: "Banana", Status: "Open" }),
    Object.assign(new Task(), { Id: 2, Title: "Apple", Status: "Closed" }),
  ];
  function cellTexts() {
    return screen
      .getAllByRole("row")
      .slice(1)
      .map((tr) => tr.querySelector("td")!.textContent);
  }
  it("clicking a sortable header sorts asc then desc", () => {
    wrap(<SpeelTable of={Task} items={many} columns={["Title"]} />);
    fireEvent.click(screen.getByRole("button", { name: "Title" }));
    expect(cellTexts()).toEqual(["Apple", "Banana"]);
    fireEvent.click(screen.getByRole("button", { name: "Title" }));
    expect(cellTexts()).toEqual(["Banana", "Apple"]);
  });
  it("defaultTableState seeds the initial order", () => {
    wrap(
      <SpeelTable
        of={Task}
        items={many}
        columns={["Title"]}
        defaultTableState={{
          columns: [],
          sort: { key: "Title", direction: "asc" },
        }}
      />,
    );
    expect(cellTexts()).toEqual(["Apple", "Banana"]);
  });
  it("sortable={false} removes header sort buttons", () => {
    wrap(
      <SpeelTable
        of={Task}
        items={many}
        columns={["Title"]}
        sortable={false}
      />,
    );
    expect(screen.queryByRole("button", { name: "Title" })).toBeNull();
  });
});

describe("SpeelTable filtering", () => {
  const many = [
    Object.assign(new Task(), { Id: 1, Title: "Apple", Status: "Open" }),
    Object.assign(new Task(), { Id: 2, Title: "Banana", Status: "Closed" }),
  ];
  it("opens a column filter flyout, narrows rows, shows a badge, and Clear restores", () => {
    wrap(<SpeelTable of={Task} items={many} columns={["Title"]} />);
    fireEvent.click(screen.getByRole("button", { name: "Filter Title" }));
    fireEvent.change(screen.getByLabelText("Title"), {
      target: { value: "app" },
    });
    expect(screen.getByText("Apple")).toBeInTheDocument();
    expect(screen.queryByText("Banana")).toBeNull();
    expect(screen.getByText("Title: app")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Clear" }));
    expect(screen.getByText("Banana")).toBeInTheDocument();
  });
  it("an active filter shows the header button depressed", () => {
    wrap(<SpeelTable of={Task} items={many} columns={["Title"]} />);
    fireEvent.click(screen.getByRole("button", { name: "Filter Title" }));
    fireEvent.change(screen.getByLabelText("Title"), {
      target: { value: "app" },
    });
    expect(
      screen.getByRole("button", { name: "Filter Title" }),
    ).toHaveAttribute("aria-pressed", "true");
  });
  it("filterable={false} renders no filter buttons", () => {
    wrap(
      <SpeelTable
        of={Task}
        items={many}
        columns={["Title"]}
        filterable={false}
      />,
    );
    expect(screen.queryByRole("button", { name: "Filter Title" })).toBeNull();
  });
  it("each badge has an individual clear button that removes only that filter", () => {
    wrap(<SpeelTable of={Task} items={many} columns={["Title"]} />);
    fireEvent.click(screen.getByRole("button", { name: "Filter Title" }));
    fireEvent.change(screen.getByLabelText("Title"), {
      target: { value: "app" },
    });
    expect(screen.queryByText("Banana")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Clear Title" })); // per-badge clear (distinct from clear-all "Clear")
    expect(screen.getByText("Banana")).toBeInTheDocument();
  });
});
