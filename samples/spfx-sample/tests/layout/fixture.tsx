// Bundled by tableLayout.spec.ts with esbuild and loaded into a blank page. Every scenario
// renders at once, each in its own section[data-scenario]; specs measure them in place.
import * as React from "react";
import * as ReactDOM from "react-dom";
import { ThemeProvider, createTheme, loadTheme } from "@fluentui/react";
import { fluentV8Adapter } from "@speel/react/fluent-v8";
import type { TableColumn, TableLength } from "@speel/react";

// The package exports the skin as an adapter, not its primitives: its Table is V8Table.
const V8Table = fluentV8Adapter.Table;

// Liberation Sans ships with Playwright's Linux dependencies: pinning it makes the skin's
// canvas measurements and the browser's line breaking agree on every machine.
const theme = createTheme({
  defaultFontStyle: { fontFamily: "'Liberation Sans', Arial, sans-serif" },
});
loadTheme(theme);

type Row = Record<string, string>;

/** A text column that renders `row[key]`. */
function col(
  key: string,
  header: string,
  extra: Partial<TableColumn> = {},
): TableColumn {
  return { key, header, render: (row) => (row as Row)[key] ?? "", ...extra };
}
/** A filter button with an empty popover: the header layout is what's under test. */
const filter = { active: false, content: null };

interface Scenario {
  name: string;
  containerWidth: number;
  /** The table's own bounds, as SpeelTable passes them through. */
  bounds?: {
    minWidth?: TableLength;
    width?: TableLength;
    maxWidth?: TableLength;
  };
  /** Render through `Dragging`, which keeps drag widths as SpeelTable does. */
  drag?: true;
  columns: TableColumn[];
  items: Row[];
}

const scenarios: Scenario[] = [
  {
    name: "authored-widths",
    containerWidth: 1200,
    columns: [
      col("a", "Supervisor", {
        width: 200,
        sortable: true,
        headerFilter: filter,
      }),
      col("b", "Plain", { width: 120 }),
    ],
    items: [{ a: "Ada", b: "x" }],
  },
  {
    name: "headers",
    containerWidth: 1200,
    columns: [
      col("a", "Supervisor", {
        width: 92,
        sortable: true,
        headerFilter: filter,
      }),
      col("b", "Supervisor", {
        width: 200,
        sortable: true,
        headerFilter: filter,
      }),
      col("c", "Separation Date", {
        width: 92,
        sortable: true,
        headerFilter: filter,
      }),
      col("d", "Supervisor", {
        width: 40,
        sortable: true,
        headerFilter: filter,
      }),
      col("e", "Select", {
        width: 80,
        sortable: true,
        headerFilter: filter,
        headerContent: (
          <input type="checkbox" readOnly aria-label="Select all" />
        ),
      }),
      col("f", "Filler", { width: 50 }),
    ],
    items: [{ a: "x", b: "x", c: "x", d: "x", e: "x", f: "x" }],
  },
  {
    name: "floor",
    containerWidth: 1200,
    columns: [
      col("done", "Done", { defaultWidth: 70 }),
      col("long", "Separation Date Confirmed", {
        defaultWidth: 70,
        sortable: true,
        headerFilter: filter,
      }),
      col("authored", "Separation Date Confirmed", {
        width: 60,
        sortable: true,
        headerFilter: filter,
      }),
      col("filler", "Filler", { width: 50 }),
    ],
    items: [{ done: "Yes", long: "x", authored: "x", filler: "x" }],
  },
  {
    name: "cells",
    containerWidth: 1200,
    columns: [
      col("org", "Organization", {
        width: 120,
        wrap: true,
        cellTitle: (r) => (r as Row)["org"] ?? "",
      }),
      col("name", "Name", {
        width: 80,
        cellTitle: (r) => (r as Row)["name"] ?? "",
      }),
      col("filler", "Filler", { width: 50 }),
    ],
    items: [
      {
        org: "Alpha Beta Gamma Delta Epsilon",
        name: "Bartholomew Longname",
        filler: "",
      },
      { org: "Short", name: "Al", filler: "" },
      { org: "Pneumonoultramicroscopic", name: "Al", filler: "" },
    ],
  },
  {
    // Interactive cells in narrow columns, each with a title as SpeelTable gives every data
    // column — so each renders inside the skin's clipping cell box.
    name: "focus",
    containerWidth: 400,
    columns: [
      {
        key: "link",
        header: "Link",
        width: 60,
        render: () => <a href="#">Open</a>,
        cellTitle: () => "Open",
      },
      {
        key: "check",
        header: "Pick",
        width: 40,
        render: () => <input type="checkbox" readOnly aria-label="Pick row" />,
        cellTitle: () => "",
      },
      col("filler", "Filler", { width: 50 }),
    ],
    items: [{ filler: "" }],
  },
  {
    // Content exactly as wide as an 80px column, and 1px wider.
    name: "fit",
    containerWidth: 400,
    columns: [
      {
        key: "exact",
        header: "Exact",
        width: 80,
        render: () => <span style={{ display: "inline-block", width: 80 }} />,
        cellTitle: () => "Exact",
      },
      {
        key: "over",
        header: "Over",
        width: 80,
        render: () => <span style={{ display: "inline-block", width: 81 }} />,
        cellTitle: () => "Over",
      },
      col("filler", "Filler", { width: 50 }),
    ],
    items: [{ filler: "" }],
  },
  {
    name: "no-stretch",
    containerWidth: 1200,
    columns: [
      col("a", "Title", {
        width: 150,
        grow: 1,
        shrink: 1,
        sortable: true,
        headerFilter: filter,
      }),
      col("b", "Modified", {
        width: 120,
        sortable: true,
        headerFilter: filter,
      }),
    ],
    items: [{ a: "x", b: "y" }],
  },
  {
    name: "fill",
    containerWidth: 1200,
    bounds: { minWidth: "100%" },
    columns: [
      col("a", "Title", { width: 150, grow: 1, shrink: 1 }),
      col("b", "Notes", { width: 150, grow: 2, shrink: 1 }),
      col("c", "Done", { width: 70 }),
    ],
    items: [{ a: "x", b: "y", c: "z" }],
  },
  {
    // A set width the columns cannot grow into: the spare width stays outside the table.
    name: "spare",
    containerWidth: 1200,
    bounds: { width: 800 },
    columns: [
      col("a", "Title", { width: 200 }),
      col("b", "Done", { width: 100 }),
    ],
    items: [{ a: "x", b: "y" }],
  },
  {
    name: "squeeze",
    containerWidth: 1200,
    bounds: { maxWidth: 400 },
    columns: [
      col("a", "Title", { width: 300, grow: 1, shrink: 1 }),
      col("b", "Notes", { width: 300, grow: 2, shrink: 1 }),
      col("c", "Done", { width: 70 }),
    ],
    items: [{ a: "x", b: "y", c: "z" }],
  },
  {
    name: "drag",
    containerWidth: 1200,
    drag: true,
    bounds: { minWidth: "100%" },
    columns: [
      col("a", "Title", { width: 300, grow: 1, shrink: 1 }),
      col("b", "Notes", { width: 300, grow: 1, shrink: 1 }),
    ],
    items: [{ a: "x", b: "y" }],
  },
  {
    // A column with its own bounds: a drag stops at them, and the columns after it stay put.
    name: "bounded-drag",
    containerWidth: 1200,
    drag: true,
    columns: [
      col("status", "Status", { width: 130, minWidth: 120, maxWidth: 160 }),
      col("owner", "Owner", { width: 130 }),
      col("due", "Due", { width: 130 }),
    ],
    items: [{ status: "Open", owner: "Ada", due: "Friday" }],
  },
  {
    // Fills its container, with a wrapping column: a narrower container makes the rows taller.
    name: "resize",
    containerWidth: 1000,
    bounds: { minWidth: "100%" },
    columns: [
      col("notes", "Notes", { width: 200, grow: 1, shrink: 1, wrap: true }),
      col("due", "Due", { width: 100 }),
    ],
    items: [
      {
        notes:
          "A note long enough to wrap onto more lines as the table gets narrower, and fewer as it widens again",
        due: "Friday",
      },
    ],
  },
];

/** What SpeelTable does with a drag: the column gets the dragged width and stops flexing. */
function Dragging(props: {
  columns: TableColumn[];
  items: Row[];
  bounds?: Scenario["bounds"];
}): JSX.Element {
  const [dragged, setDragged] = React.useState<Record<string, number>>({});
  const columns = props.columns.map((c) =>
    dragged[c.key] !== undefined
      ? { ...c, width: dragged[c.key]!, grow: 0, shrink: 0 }
      : c,
  );
  return (
    <V8Table
      columns={columns}
      items={props.items}
      onSortChange={() => undefined}
      onColumnResize={(key, width) =>
        setDragged((d) => ({ ...d, [key]: width }))
      }
      {...props.bounds}
    />
  );
}

function App(): JSX.Element {
  return (
    <ThemeProvider theme={theme}>
      {scenarios.map((s) => (
        <section
          key={s.name}
          data-scenario={s.name}
          style={{ width: s.containerWidth, marginBottom: 24 }}
        >
          {s.drag ? (
            <Dragging
              columns={s.columns}
              items={s.items}
              {...(s.bounds ? { bounds: s.bounds } : {})}
            />
          ) : (
            <V8Table
              columns={s.columns}
              items={s.items}
              onSortChange={() => undefined}
              {...s.bounds}
            />
          )}
        </section>
      ))}
    </ThemeProvider>
  );
}

ReactDOM.render(<App />, document.getElementById("root"), () => {
  document.body.dataset["ready"] = "1";
});
