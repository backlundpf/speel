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
];

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
          <ShadTable
            columns={s.columns}
            items={s.items}
            onSortChange={() => undefined}
            {...s.bounds}
          />
        </section>
      ))}
    </div>
  );
}

ReactDOM.render(<App />, document.getElementById("root"), () => {
  document.body.dataset["ready"] = "1";
});
