// test/queryStringBudget.test.ts
import { describe, it, expect } from "vitest";
import {
  maxInFilterValues,
  type IInFilterQueryShape,
} from "../src/queryStringBudget.js";
import { toODataString } from "../src/toODataString.js";
import { SharePointProvider } from "../src/SharePointProvider.js";

/** ASP.NET/IIS default the budget is written against. */
const SERVER_LIMIT = 2048;

/**
 * What PnPjs bolts onto page 2 of a chunk when it follows the server's nextLink —
 * the member the budget's reserve exists for.
 */
const SKIPTOKEN = `&$skiptoken=${encodeURIComponent("Paged=TRUE&p_ID=562")}`;

/**
 * The query string `SharePointProvider.getItemsPagedAsync` actually emits for one
 * chunk, assembled from the same translator the provider uses. Tests assert against
 * this rather than against the budget's internal constants.
 */
function queryStringFor(
  shape: IInFilterQueryShape,
  values: readonly number[],
): string {
  const inner = toODataString({
    kind: "in",
    column: shape.column,
    values,
    negate: false,
  });
  const filter = `(${inner}) and FSObjType eq 0`;
  const members = [
    `$select=${encodeURIComponent(shape.selects.join(","))}`,
    ...(shape.expands.length
      ? [`$expand=${encodeURIComponent(shape.expands.join(","))}`]
      : []),
    `$top=1000`,
    `$filter=${encodeURIComponent(filter)}`,
  ];
  return members.join("&");
}

// The entity behind the live 400: a document-library-backed request list whose
// children carry ResIDId back to the parent. Its $select encodes to 185 characters
// and its File/Length column drags $expand=File along.
const liveShape: IInFilterQueryShape = {
  column: "ResIDId",
  maxValue: 562,
  selects: [
    "ID",
    "Title",
    "ResIDId",
    "Created",
    "Modified",
    "FSObjType",
    "FileLeafRef",
    "FileRef",
    "FileDirRef",
    "StatusValue",
    "DueDate",
    "AssignedToId",
    "ApproverId",
    "Comments0",
    "RequestType0",
    "File/Length",
  ],
  expands: ["File"],
};

/** Parent ids 433…562 — the set that produced the live failure. */
const liveIds = Array.from({ length: 130 }, (_, i) => 433 + i);

describe("maxInFilterValues — the live 400", () => {
  it("reproduces the failure: the old fixed chunk of 100 overruns the limit", () => {
    expect(
      queryStringFor(liveShape, liveIds.slice(0, 100)).length,
    ).toBeGreaterThan(SERVER_LIMIT);
    // …as did the 130-id set the query actually asked for.
    expect(queryStringFor(liveShape, liveIds).length).toBeGreaterThan(
      SERVER_LIMIT,
    );
  });

  it("sizes the chunk so page 1 fits with room for the paging members", () => {
    const chunk = maxInFilterValues(liveShape);
    expect(chunk).toBe(54);

    const page1 = queryStringFor(liveShape, liveIds.slice(0, chunk));
    expect(page1.length).toBeLessThan(SERVER_LIMIT);
    // Page 2 of the SAME chunk carries a $skiptoken page 1 did not — sizing to fit
    // page 1 exactly would 400 only on lists big enough to page.
    expect(page1.length + SKIPTOKEN.length).toBeLessThan(SERVER_LIMIT);
  });

  it("leaves headroom over the encoded page-1 query string", () => {
    const chunk = maxInFilterValues(liveShape);
    const page1 = queryStringFor(liveShape, liveIds.slice(0, chunk));
    expect(SERVER_LIMIT - page1.length).toBeGreaterThan(300);
  });
});

describe("maxInFilterValues — what shrinks the chunk", () => {
  const base: IInFilterQueryShape = {
    column: "ResIDId",
    maxValue: 100,
    selects: ["ID", "Title"],
    expands: [],
  };

  it("a long $select shrinks the chunk", () => {
    const wide = {
      ...base,
      selects: Array.from({ length: 60 }, (_, i) => `Column${i}Value`),
    };
    expect(maxInFilterValues(wide)).toBeLessThan(maxInFilterValues(base));
  });

  it("an $expand shrinks the chunk", () => {
    const expanded = {
      ...base,
      selects: [...base.selects, "File/Length"],
      expands: ["File"],
    };
    expect(maxInFilterValues(expanded)).toBeLessThan(maxInFilterValues(base));
  });

  it("large ids shrink the chunk", () => {
    expect(maxInFilterValues({ ...base, maxValue: 999_999_999 })).toBeLessThan(
      maxInFilterValues({ ...base, maxValue: 9 }),
    );
  });

  it("a long column name shrinks the chunk", () => {
    expect(
      maxInFilterValues({ ...base, column: "AVeryLongLookupColumnNameId" }),
    ).toBeLessThan(maxInFilterValues(base));
  });

  it("floors at 1 under a $select that alone all but fills the limit", () => {
    const pathological = {
      ...base,
      selects: Array.from({ length: 120 }, (_, i) => `AVeryLongColumnName${i}`),
    };
    expect(maxInFilterValues(pathological)).toBe(1);
  });

  it("never exceeds the 100-value ceiling, however cheap the shape", () => {
    // The cheapest shape expressible: one-character column, one-digit id, no $select.
    expect(
      maxInFilterValues({ column: "A", maxValue: 1, selects: [], expands: [] }),
    ).toBeLessThanOrEqual(100);
  });

  it("every result is a usable chunk size — an integer in [1, 100]", () => {
    for (const selectCount of [0, 1, 10, 40, 90]) {
      for (const maxValue of [1, 500, 1_000_000]) {
        const n = maxInFilterValues({
          column: "ResIDId",
          maxValue,
          expands: [],
          selects: Array.from({ length: selectCount }, (_, i) => `Column${i}`),
        });
        expect(Number.isInteger(n)).toBe(true);
        expect(n).toBeGreaterThanOrEqual(1);
        expect(n).toBeLessThanOrEqual(100);
      }
    }
  });
});

describe("SharePointProvider.maxInFilterValues", () => {
  // The capability needs no SPFI — it only prices the request it would build.
  const provider = new SharePointProvider(null as never);

  it("charges a path-shaped column for the $expand it implies", () => {
    const fields = ["ID", "Title", "File/Length"];
    // The read would emit $expand=File; so must the price of it.
    expect(provider.maxInFilterValues("ResIDId", fields, 562)).toBe(
      maxInFilterValues({
        column: "ResIDId",
        maxValue: 562,
        selects: fields,
        expands: ["File"],
      }),
    );
  });

  it("charges a plain column set for no $expand at all", () => {
    const fields = ["ID", "Title", "Body"];
    expect(provider.maxInFilterValues("ResIDId", fields, 562)).toBe(
      maxInFilterValues({
        column: "ResIDId",
        maxValue: 562,
        selects: fields,
        expands: [],
      }),
    );
    // Non-vacuous: pricing an expand it doesn't emit would cost this shape a value.
    expect(
      maxInFilterValues({
        column: "ResIDId",
        maxValue: 562,
        selects: fields,
        expands: ["File"],
      }),
    ).toBeLessThan(provider.maxInFilterValues("ResIDId", fields, 562));
  });

  it("answers the live entity with the same budget as the pure function", () => {
    expect(
      provider.maxInFilterValues(
        liveShape.column,
        liveShape.selects,
        liveShape.maxValue,
      ),
    ).toBe(maxInFilterValues(liveShape));
  });
});
