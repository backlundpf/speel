import { describe, it, expect } from "vitest";
import { DbContext, ModelBuilder } from "@speel/core";
import { resolveColumns } from "../src/table/columns.js";
import { applySort } from "../src/table/sort.js";
import { matches, type FilterCriteria } from "../src/table/filter/match.js";
import { makeFakeProvider } from "./fakeProvider.js";

class Program {
  Id?: number;
  Title?: string;
}
class Item {
  Id?: number;
  Name?: string;
  Qty?: number;
  Secret?: string;
  Maybe?: string;
  ProgramId?: number;
  Program?: Program;
}
class Resp {
  Id?: number;
  Status?: string;
  ParentClosed?: boolean;
}
class Ctx extends DbContext {
  protected override onModelCreating(mb: ModelBuilder): void {
    mb.entity(Program, (b) => {
      b.toList("Programs");
      b.property((e) => e.Id).isNumber();
      b.property((e) => e.Title).isText();
    });
    mb.entity(Item, (b) => {
      b.toList("Items");
      b.property((e) => e.Id).isNumber();
      b.property((e) => e.Name)
        .isText()
        .hasDisplayName("Name");
      b.property((e) => e.Qty)
        .isNumber()
        .hasDisplayName("Qty");
      b.property((e) => e.Secret)
        .isText()
        .isVisible(false);
      b.property((e) => e.Maybe)
        .isText()
        .isVisible(() => false);
      b.hasOne(Program, (e) => e.Program)
        .withMany()
        .hasForeignKey((e) => e.ProgramId)
        .hasDisplayName("Program");
    });
    mb.entity(Resp, (b) => {
      b.toList("Responses");
      b.property((e) => e.Id).isNumber();
      b.property((e) => e.Status)
        .isChoice()
        .hasOptions(["Open", "Closed"])
        .hasDisplayName("Status");
      b.property((e) => e.ParentClosed).isBoolean();
    });
  }
}
function et() {
  return new Ctx({
    provider: makeFakeProvider({}),
  } as never).model.findEntityType(Item)!;
}
function respType() {
  return new Ctx({
    provider: makeFakeProvider({}),
  } as never).model.findEntityType(Resp)!;
}

describe("resolveColumns", () => {
  it("default = props (−key/FK/hidden) + navs, in order", () => {
    const cols = resolveColumns(et(), undefined);
    expect(cols.map((c) => c.key)).toEqual(["Name", "Qty", "Maybe", "Program"]);
    expect(cols.map((c) => c.header)).toEqual([
      "Name",
      "Qty",
      "Maybe",
      "Program",
    ]);
  });
  it("array form picks/orders + a custom descriptor", () => {
    const cols = resolveColumns(et(), [
      "Qty",
      { key: "flag", header: "Flag", render: () => "F" },
    ]);
    expect(cols.map((c) => c.key)).toEqual(["Qty", "flag"]);
    expect(cols[1]!.render({} as never)).toBe("F");
  });
  it("accessor (proxy) captures keys + order, passes descriptors through", () => {
    const cols = resolveColumns(et(), (p: Item) => [
      p.Name,
      { key: "x", render: () => "X" },
      p.Qty,
    ]);
    expect(cols.map((c) => c.key)).toEqual(["Name", "x", "Qty"]);
  });
  it("cell uses formatFieldValue for an auto column", () => {
    const cols = resolveColumns(et(), ["Name"]);
    expect(cols[0]!.render({ Name: "Widget" } as never)).toBe("Widget");
  });
  it("throws for a non-field key without render", () => {
    expect(() => resolveColumns(et(), [{ key: "nope" }])).toThrow();
  });
});

describe("resolveColumns sort/filter metadata", () => {
  it("field columns are sortable + filterable by default (filter keys off raw value)", () => {
    const cols = resolveColumns(et(), ["Qty"]);
    const qty = cols[0]!;
    expect(qty.sortable).toBe(true);
    expect(qty.sortAccessor!({ Qty: 5 } as never)).toBe(5);
    expect(qty.comparator!(2, 10)).toBeLessThan(0);
    expect(qty.filter!.config).toEqual({ kind: "numberRange" });
    expect(qty.filter!.getValue({ Qty: 5 } as never)).toBe(5);
  });

  it("descriptor sortable:false opts a field column out of sort but keeps filter", () => {
    const cols = resolveColumns(et(), [{ key: "Qty", sortable: false }]);
    expect(cols[0]!.sortable).toBe(false);
    expect(cols[0]!.filter).toBeDefined();
  });

  it("custom (non-field) column is inert without accessors", () => {
    const cols = resolveColumns(et(), [{ key: "health", render: () => "x" }]);
    expect(cols[0]!.sortable).toBe(false);
    expect(cols[0]!.filter).toBeUndefined();
  });

  it("custom column opts in via sortValue + tableFilter/filterValue", () => {
    const cols = resolveColumns(et(), [
      {
        key: "health",
        render: () => "x",
        sortValue: (r: { Qty?: number }) => r.Qty ?? 0,
        tableFilter: { kind: "numberRange" },
        filterValue: (r: { Qty?: number }) => r.Qty,
      },
    ]);
    expect(cols[0]!.sortable).toBe(true);
    expect(cols[0]!.sortAccessor!({ Qty: 3 } as never)).toBe(3);
    expect(cols[0]!.filter!.config).toEqual({ kind: "numberRange" });
  });

  it("tableFilter:{kind:none} removes the filter", () => {
    const cols = resolveColumns(et(), [
      { key: "Qty", tableFilter: { kind: "none" } },
    ]);
    expect(cols[0]!.filter).toBeUndefined();
    expect(cols[0]!.sortable).toBe(true);
  });
});

// A response under a closed parent must read as closed whatever it stores — the column
// keys to the model field (for its Choice dropdown) but sorts/filters on the masked value.
describe("resolveColumns field column with accessor overrides", () => {
  const masked = (r: Resp): string =>
    r.ParentClosed ? "Closed" : (r.Status ?? "");
  const plainOpen = Object.assign(new Resp(), {
    Id: 1,
    Status: "Open",
    ParentClosed: false,
  });
  const maskedClosed = Object.assign(new Resp(), {
    Id: 2,
    Status: "Open",
    ParentClosed: true,
  });

  it("filterValue overrides the value the inherited filter matches on", () => {
    const cols = resolveColumns<Resp>(respType(), [
      { key: "Status", filterValue: masked },
    ]);
    const f = cols[0]!.filter!;
    expect(f.getValue(maskedClosed)).toBe("Closed");
    const closed: FilterCriteria = { kind: "select", selected: ["Closed"] };
    expect(matches(f.fieldConfig, closed, f.getValue(maskedClosed))).toBe(true);
    expect(matches(f.fieldConfig, closed, f.getValue(plainOpen))).toBe(false);
  });

  it("filterValue leaves the inherited filter UI kind + fieldConfig intact", () => {
    const rt = respType();
    const cols = resolveColumns<Resp>(rt, [
      { key: "Status", filterValue: masked },
    ]);
    expect(cols[0]!.filter!.config).toEqual({ kind: "select", multi: true });
    expect(cols[0]!.filter!.fieldConfig).toBe(
      (rt.findProperty("Status") as { config: unknown }).config,
    );
  });

  it("sortValue overrides the value the sort keys off, keeping the field comparator", () => {
    const cols = resolveColumns<Resp>(respType(), [
      { key: "Status", sortValue: masked },
    ]);
    const c = cols[0]!;
    expect(c.sortAccessor!(maskedClosed)).toBe("Closed");
    // Choice comparator = declared order (Open before Closed), applied to the masked value.
    const sorted = applySort(
      [maskedClosed, plainOpen],
      c.sortAccessor!,
      c.comparator!,
      "asc",
    );
    expect(sorted.map((r) => r.Id)).toEqual([1, 2]);
  });

  it("a field-keyed descriptor without accessors still keys off the raw field value", () => {
    const cols = resolveColumns<Resp>(respType(), [
      { key: "Status", header: "State" },
    ]);
    const c = cols[0]!;
    expect(c.header).toBe("State");
    expect(c.sortable).toBe(true);
    expect(c.sortAccessor!(maskedClosed)).toBe("Open");
    expect(c.filter!.getValue(maskedClosed)).toBe("Open");
    expect(c.filter!.config).toEqual({ kind: "select", multi: true });
  });
});

describe("resolveColumns visibility", () => {
  it("default columns exclude literal visible:false but keep function-valued isVisible", () => {
    const cols = resolveColumns(et(), undefined);
    const keys = cols.map((c) => c.key);
    expect(keys).not.toContain("Secret"); // literal false → hidden from defaults
    expect(keys).toContain("Maybe"); // per-entity predicate → forms-only concern
  });

  it("explicit column specs can still reference a hidden property", () => {
    const cols = resolveColumns(et(), ["Secret"]);
    expect(cols.map((c) => c.key)).toEqual(["Secret"]);
  });

  it("a literal visible:false navigation is hidden from defaults, like a property", () => {
    class Owner {
      Id?: number;
      Title?: string;
    }
    class Doc {
      Id?: number;
      Title?: string;
      OwnerId?: number;
      Owner?: Owner;
    }
    class HiddenNavCtx extends DbContext {
      protected override onModelCreating(mb: ModelBuilder): void {
        mb.entity(Owner, (b) => {
          b.toList("Owners");
          b.property((e) => e.Id).isNumber();
          b.property((e) => e.Title).isText();
        });
        mb.entity(Doc, (b) => {
          b.toList("Docs");
          b.property((e) => e.Id).isNumber();
          b.property((e) => e.Title).isText();
          b.hasOne(Owner, (e) => e.Owner)
            .withMany()
            .hasForeignKey((e) => e.OwnerId)
            .isVisible(false);
        });
      }
    }
    const docType = new HiddenNavCtx({
      provider: makeFakeProvider({}),
    } as never).model.findEntityType(Doc)!;
    const keys = resolveColumns(docType, undefined).map((c) => c.key);
    expect(keys).toEqual(["Title"]);
  });
});
