import * as React from "react";
import {
  SpeelEntityTable,
  useSpeelUI,
  type ColumnRefs,
  type GroupSpec,
  type SpeelEntityTableHandle,
} from "@speel/react";
import { Project } from "../../../entities/Project";

/** Which way the panel slices the projects. Each preset shows a different side of `groupBy`. */
type Preset = "status" | "owner" | "due";
type Grouping = (p: ColumnRefs<Project>) => GroupSpec<Project>[];

const startOfToday = (): Date => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};

const GROUPINGS: Record<Preset, { text: string; groupBy: Grouping }> = {
  // Three levels: a column, a column with its own header/order/starting state, and a
  // computed bucket no column holds.
  status: {
    text: "Status → Priority → Due",
    groupBy: (p) => [
      // Choice levels order by the declared choices; a finished project starts folded.
      { key: p.Status.key, collapsed: (g) => g.label === "Complete" },
      {
        key: p.Priority.key,
        order: "desc", // Critical first
        collapsed: true,
        header: (g) => (
          <span>
            {g.label} priority · <strong>{g.count}</strong>{" "}
            {g.count === 1 ? "project" : "projects"}
          </span>
        ),
      },
      {
        key: "due",
        by: (r) =>
          r.DueDate === null
            ? undefined // → the "(blank)" group, always last
            : r.DueDate < startOfToday()
              ? "Overdue"
              : "Upcoming",
      },
    ],
  },
  // A person column groups by the name it displays.
  owner: {
    text: "Owner → Status",
    groupBy: (p) => [p.Owner, p.Status],
  },
  // A computed value with its own label and order: newest year first.
  due: {
    text: "Due year → Status",
    groupBy: (p) => [
      {
        key: "dueYear",
        by: (r) => r.DueDate?.getFullYear(),
        label: (year) => `Due in ${String(year)}`,
        order: "desc",
      },
      p.Status,
    ],
  },
};

/**
 * Grouping demo: nested, collapsible, counted groups over the projects list. The grouping
 * picker swaps `groupBy`; the checkbox turns it off to show that grouping takes precedence
 * over `pageSize` — the pager is hidden while grouped and comes back on the page it was on.
 */
export const GroupedProjectsPanel: React.FC<{
  tableRef: React.RefObject<SpeelEntityTableHandle>;
}> = ({ tableRef }) => {
  const ui = useSpeelUI();
  const [preset, setPreset] = React.useState<Preset>("status");
  const [grouped, setGrouped] = React.useState(true);

  return (
    <div style={{ marginTop: 24 }}>
      <h3>Projects grouped — SpeelEntityTable groupBy</h3>
      <div
        style={{
          display: "flex",
          alignItems: "flex-end",
          gap: 12,
          flexWrap: "wrap",
          marginBottom: 8,
        }}
      >
        <div style={{ width: 240 }}>
          <ui.Dropdown
            label="Group by"
            value={preset}
            options={(Object.keys(GROUPINGS) as Preset[]).map((key) => ({
              key,
              text: GROUPINGS[key].text,
              data: key,
            }))}
            onChange={(v) => setPreset(v as Preset)}
          />
        </div>
        <ui.Checkbox
          label="Group rows (off: page 5 at a time)"
          checked={grouped}
          onChange={setGrouped}
        />
        {/* The toolbar has its own Expand/Collapse all; these drive the same thing from
            outside the table, through the handle. */}
        <ui.Button
          text="Expand all"
          disabled={!grouped}
          onClick={() => tableRef.current?.expandAllGroups()}
        />
        <ui.Button
          text="Collapse all"
          disabled={!grouped}
          onClick={() => tableRef.current?.collapseAllGroups()}
        />
      </div>
      <SpeelEntityTable
        ref={tableRef}
        of={Project}
        columns={(p) => [p.Title, p.Owner, p.Priority, p.DueDate]}
        pageSize={5}
        {...(grouped ? { groupBy: GROUPINGS[preset].groupBy } : {})}
        search
        exportCsv
        emptyMessage="No projects yet — create one."
        loadingMessage="Loading projects…"
      />
    </div>
  );
};
