import { describe, it, expect } from "vitest";
import { DbContext, ModelBuilder } from "@speel/core";
import { resolveColumns } from "../src/table/columns.js";
import {
  resolveGroupLevels,
  groupRows,
  groupLabel,
  defaultGroupHeader,
  type GroupNode,
} from "../src/table/grouping.js";
import { makeFakeProvider } from "./fakeProvider.js";

class Task {
  Id?: number;
  Title?: string;
  Status?: string;
  Owner?: string;
  Due?: Date;
}
class Ctx extends DbContext {
  protected override onModelCreating(mb: ModelBuilder): void {
    mb.entity(Task, (b) => {
      b.toList("Tasks");
      b.property((e) => e.Id).isNumber();
      b.property((e) => e.Title)
        .isText()
        .hasDisplayName("Title");
      b.property((e) => e.Status)
        .isChoice()
        .hasOptions(["Open", "Closed", "Blocked"])
        .hasDisplayName("Status");
      b.property((e) => e.Owner)
        .isText()
        .hasDisplayName("Owner");
      b.property((e) => e.Due)
        .isDateTime()
        .asDateOnly()
        .hasDisplayName("Due");
    });
  }
}
const et = new Ctx({
  provider: makeFakeProvider({}),
} as never).model.findEntityType(Task)!;
const columns = resolveColumns<Task>(et, undefined);
const task = (o: Partial<Task>): Task => Object.assign(new Task(), o);

const rows: Task[] = [
  task({ Id: 1, Title: "a", Status: "Blocked", Owner: "Ann" }),
  task({ Id: 2, Title: "b", Status: "Closed", Owner: "Bob" }),
  task({ Id: 3, Title: "c", Status: "Open", Owner: "Bob" }),
  task({ Id: 4, Title: "d", Status: "Open", Owner: "Ann" }),
  task({ Id: 5, Title: "e", Status: "Closed", Owner: "Ann" }),
  task({ Id: 6, Title: "f", Status: "Open", Owner: "Ann" }),
];
const ids = (rs: readonly Task[]): number[] => rs.map((r) => r.Id!);
function walk(nodes: GroupNode<Task>[], out: GroupNode<Task>[] = []) {
  for (const n of nodes) {
    out.push(n);
    walk(n.children, out);
  }
  return out;
}

describe("groupRows", () => {
  it("nests and counts", () => {
    const levels = resolveGroupLevels<Task>(et, columns, (p) => [
      p.Status,
      p.Owner,
    ]);
    const g = groupRows(rows, levels);
    // Declared-choice order, not alphabetical.
    expect(g.roots.map((r) => r.label)).toEqual(["Open", "Closed", "Blocked"]);
    for (const root of g.roots)
      expect(root.count).toBe(root.children.reduce((s, c) => s + c.count, 0));
    expect(ids(g.rows)).toEqual([4, 6, 3, 5, 2, 1]);
    for (const n of walk(g.roots))
      expect(ids(n.rows)).toEqual(
        ids(g.rows.slice(n.startIndex, n.startIndex + n.count)),
      );
    const open = g.roots[0]!;
    expect(open.level).toBe(0);
    expect(open.children[0]!.level).toBe(1);
    expect(open.children[0]!.parent).toBe(open);
  });

  it("puts the blank group last in both directions", () => {
    const withBlank = [...rows, task({ Id: 7, Title: "g" })];
    for (const order of ["asc", "desc"] as const) {
      const levels = resolveGroupLevels<Task>(et, columns, [
        { key: "Status", order },
      ]);
      const roots = groupRows(withBlank, levels).roots;
      const last = roots[roots.length - 1]!;
      expect(last.label).toBe("");
      expect(groupLabel(last)).toBe("(blank)");
      expect(ids(last.rows)).toEqual([7]);
    }
    const desc = groupRows(
      withBlank,
      resolveGroupLevels<Task>(et, columns, [{ key: "Status", order: "desc" }]),
    ).roots;
    expect(desc.map((r) => r.label)).toEqual(["Blocked", "Closed", "Open", ""]);
  });

  it("keeps the table's row order inside groups", () => {
    const sorted = [...rows].sort((a, b) => b.Title!.localeCompare(a.Title!));
    const g = groupRows(
      sorted,
      resolveGroupLevels<Task>(et, columns, ["Status"]),
    );
    expect(ids(g.roots[0]!.rows)).toEqual([6, 4, 3]);
  });

  it("groups by label text: a date-only field groups by day", () => {
    const d1 = new Date(2026, 4, 1, 9, 0);
    const d2 = new Date(2026, 4, 1, 17, 30);
    const g = groupRows(
      [task({ Id: 1, Due: d1 }), task({ Id: 2, Due: d2 })],
      resolveGroupLevels<Task>(et, columns, ["Due"]),
    );
    expect(g.roots).toHaveLength(1);
    expect(g.roots[0]!.count).toBe(2);
  });

  it("orders by a custom comparator", () => {
    const g = groupRows(
      rows,
      resolveGroupLevels<Task>(et, columns, [
        { key: "Owner", order: (a, b) => String(b).localeCompare(String(a)) },
      ]),
    );
    expect(g.roots.map((r) => r.label)).toEqual(["Bob", "Ann"]);
  });

  it("groups a by level on its computed value", () => {
    const levels = resolveGroupLevels<Task>(et, columns, [
      { key: "due", by: (t) => (t.Id! <= 2 ? "Overdue" : "Upcoming") },
    ]);
    expect(levels[0]!.title).toBeUndefined();
    const g = groupRows(rows, levels);
    expect(g.roots.map((r) => r.label)).toEqual(["Overdue", "Upcoming"]);
    expect(defaultGroupHeader(levels[0]!, g.roots[0]!)).toBe("Overdue (2)");
    const status = resolveGroupLevels<Task>(et, columns, ["Status"]);
    const open = groupRows(rows, status).roots[0]!;
    expect(defaultGroupHeader(status[0]!, open)).toBe("Status: Open (3)");
  });

  it("treats a by level's key as only an id, even when it names a column", () => {
    const levels = resolveGroupLevels<Task>(et, columns, [
      { key: "Status", by: () => "x" },
    ]);
    expect(levels[0]!.title).toBeUndefined();
    expect(groupRows(rows, levels).roots.map((r) => r.label)).toEqual(["x"]);
  });

  it("escapes group ids", () => {
    const g = groupRows(
      [
        task({ Id: 1, Status: "Open", Owner: "A/B" }),
        task({ Id: 2, Status: "Open/A", Owner: "B" }),
        task({ Id: 3, Status: "Open", Owner: "a=b" }),
      ],
      resolveGroupLevels<Task>(et, columns, [
        { key: "s", by: (t) => t.Status },
        { key: "o", by: (t) => t.Owner },
      ]),
    );
    const all = walk(g.roots).map((n) => n.id);
    expect(new Set(all).size).toBe(all.length);
    expect(all).toContain("s=Open/o=A\\/B");
    expect(all).toContain("s=Open\\/A/o=B");
    expect(all).toContain("s=Open/o=a\\=b");
  });

  it("groups on an entity field with no column", () => {
    const only = resolveColumns<Task>(et, ["Title"]);
    const levels = resolveGroupLevels<Task>(et, only, ["Status"]);
    expect(levels[0]!.title).toBe("Status");
    expect(groupRows(rows, levels).roots.map((r) => r.label)).toEqual([
      "Open",
      "Closed",
      "Blocked",
    ]);
  });

  it("throws on a key that names nothing", () => {
    expect(() => resolveGroupLevels<Task>(et, columns, ["Nope"])).toThrow(
      /groupBy key 'Nope' names no column or field/,
    );
  });
});
