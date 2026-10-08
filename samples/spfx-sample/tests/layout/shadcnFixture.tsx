// Bundled by shadcnLayout.spec.ts: the sample's synced shadcn table skin, styled by the sample's
// compiled Tailwind CSS (added by the spec), every scenario in its own section[data-scenario].
import * as React from "react";
import * as ReactDOM from "react-dom";
import { ShadTable } from "@/components/speel/table";
import type { TableColumn, TableLength } from "@speel/react";

type Row = Record<string, string>;
function col(
  key: string,
  header: string,
  extra: Partial<TableColumn> = {},
): TableColumn {
  return { key, header, render: (row) => (row as Row)[key] ?? "", ...extra };
}
const filter = { active: false, content: null };

interface Scenario {
  name: string;
  containerWidth: number;
  bounds?: {
    minWidth?: TableLength;
    width?: TableLength;
    maxWidth?: TableLength;
  };
  columns: TableColumn[];
  items: Row[];
  /** Hold every dragged width the way SpeelTable does: as the column's width, held still. */
  draggable?: boolean;
}

const scenarios: Scenario[] = [
  {
    name: "basic",
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
    name: "narrow-header",
    containerWidth: 1200,
    columns: [
      col("a", "Separation Date Confirmed", {
        width: 60,
        sortable: true,
        headerFilter: filter,
      }),
      col("b", "Filler", { width: 80 }),
    ],
    items: [{ a: "x", b: "y" }],
  },
  {
    name: "wide",
    containerWidth: 300,
    columns: [
      col("a", "Title", { width: 200 }),
      col("b", "Notes", { width: 200 }),
    ],
    items: [{ a: "x", b: "y" }],
  },
  {
    name: "fill",
    containerWidth: 1200,
    bounds: { minWidth: "100%" },
    columns: [
      col("a", "Title", { width: 150, grow: 1, shrink: 1 }),
      col("b", "Done", { width: 70 }),
    ],
    items: [{ a: "x", b: "y" }],
  },
  {
    // A bound nothing can grow into: the spare width stays empty.
    name: "spare",
    containerWidth: 1200,
    bounds: { minWidth: "100%" },
    columns: [
      col("a", "Title", { width: 150 }),
      col("b", "Modified", { width: 120 }),
    ],
    items: [{ a: "x", b: "y" }],
  },
  {
    name: "drag",
    containerWidth: 1200,
    bounds: { minWidth: "100%" },
    draggable: true,
    columns: [
      col("a", "Title", { width: 300, grow: 1, shrink: 1 }),
      col("b", "Notes", { width: 300, grow: 1, shrink: 1 }),
    ],
    items: [{ a: "x", b: "y" }],
  },
];

/** A table whose drags stick, as in SpeelTable: a dragged column keeps its width and stops
 *  flexing, and the others flex around it. */
function DragHost({ s }: { s: Scenario }): JSX.Element {
  const [dragged, setDragged] = React.useState<Record<string, number>>({});
  const columns = s.columns.map((c) =>
    dragged[c.key] !== undefined
      ? { ...c, width: dragged[c.key]!, grow: 0, shrink: 0 }
      : c,
  );
  return (
    <ShadTable
      columns={columns}
      items={s.items}
      onColumnResize={(key, width) =>
        setDragged((prev) => ({ ...prev, [key]: Math.round(width) }))
      }
      {...s.bounds}
    />
  );
}

function App(): JSX.Element {
  return (
    // The skin's scoped base styles live under .speel-shadcn; the font is pinned like the v8
    // fixture's so measurement and layout agree on every machine.
    <div
      className="speel-shadcn"
      style={{ fontFamily: "'Liberation Sans', Arial, sans-serif" }}
    >
      {scenarios.map((s) => (
        <section
          key={s.name}
          data-scenario={s.name}
          style={{ width: s.containerWidth, marginBottom: 24 }}
        >
          {s.draggable ? (
            <DragHost s={s} />
          ) : (
            <ShadTable
              columns={s.columns}
              items={s.items}
              onSortChange={() => undefined}
              {...s.bounds}
            />
          )}
        </section>
      ))}
    </div>
  );
}

ReactDOM.render(<App />, document.getElementById("root"), () => {
  document.body.dataset["ready"] = "1";
});
