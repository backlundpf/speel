// Bundled by tableLayout.spec.ts with esbuild and loaded into a blank page. Every scenario
// renders at once, each in its own section[data-scenario]; specs measure them in place.
import * as React from "react";
import * as ReactDOM from "react-dom";
import { ThemeProvider, createTheme, loadTheme } from "@fluentui/react";
import { fluentV8Adapter } from "@speel/react/fluent-v8";
import type { TableColumn } from "@speel/react";

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
];

function App(): JSX.Element {
  return (
    <ThemeProvider theme={theme}>
      {scenarios.map((s) => (
        <section
          key={s.name}
          data-scenario={s.name}
          style={{ width: s.containerWidth, marginBottom: 24 }}
        >
          <V8Table
            columns={s.columns}
            items={s.items}
            onSortChange={() => undefined}
          />
        </section>
      ))}
    </ThemeProvider>
  );
}

ReactDOM.render(<App />, document.getElementById("root"), () => {
  document.body.dataset["ready"] = "1";
});
