import { describe, it, expect } from "vitest";
import type { FilterNode } from "@speel/core";
import {
  principalSourceKey,
  servesPrincipalSource,
  selectFor,
  translateFilter,
  translateOrderBy,
  inboundRecord,
} from "../src/principalSources.js";
import { toODataString } from "../src/toODataString.js";

const cmp = (
  column: string,
  value: unknown,
  op: "eq" | "ne" | "gt" = "eq",
): FilterNode => ({ kind: "compare", column, op, value });
/** The error a synchronous call throws — asserted by name, since the class crosses a package boundary. */
const thrown = (fn: () => unknown): Error => {
  try {
    fn();
  } catch (e) {
    return e as Error;
  }
  throw new Error("did not throw");
};

describe("principalSourceKey", () => {
  it("accepts the three served keys and rejects any other, naming it and the served set", () => {
    for (const key of ["principals", "siteUsers", "siteGroups"]) {
      expect(principalSourceKey({ kind: "provider", key })).toBe(key);
    }
    expect(() => principalSourceKey({ kind: "provider", key: "nope" })).toThrow(
      /'nope'.*principals, siteUsers, siteGroups/,
    );
  });
  it("servesPrincipalSource is the same answer without the throw", () => {
    expect(servesPrincipalSource({ kind: "provider", key: "siteGroups" })).toBe(
      true,
    );
    expect(servesPrincipalSource({ kind: "provider", key: "nope" })).toBe(
      false,
    );
  });
});

describe("selectFor", () => {
  it("UIL: model names become endpoint names, PrincipalType becomes ContentTypeId, uncarried columns drop, Id leads", () => {
    expect(
      selectFor("principals", [
        "Title",
        "LoginName",
        "Email",
        "PrincipalType",
        "Description",
        "OwnerTitle",
      ]),
    ).toEqual(["Id", "Title", "Name", "EMail", "ContentTypeId"]);
  });
  it("UIL: never selects PrincipalType and never duplicates ContentTypeId", () => {
    const sel = selectFor("principals", [
      "PrincipalType",
      "ContentTypeId",
      "PrincipalType",
    ]);
    expect(sel).not.toContain("PrincipalType");
    expect(sel.filter((c) => c === "ContentTypeId")).toHaveLength(1);
    // ID is the same column as Id under a second spelling — one entry, not two.
    expect(selectFor("principals", ["ID", "Title"])).toEqual(["Id", "Title"]);
  });
  it("siteUsers keeps its native names and drops group-only columns", () => {
    expect(
      selectFor("siteUsers", [
        "Title",
        "LoginName",
        "Email",
        "PrincipalType",
        "Description",
      ]),
    ).toEqual(["Id", "Title", "LoginName", "Email", "PrincipalType"]);
  });
  it("siteGroups drops Email and PrincipalType (synthesised) and keeps its own columns", () => {
    expect(
      selectFor("siteGroups", [
        "Title",
        "LoginName",
        "Email",
        "PrincipalType",
        "Description",
        "OwnerTitle",
      ]),
    ).toEqual(["Id", "Title", "LoginName", "Description", "OwnerTitle"]);
  });
  it("passes a column it has no opinion about through verbatim", () => {
    expect(selectFor("siteUsers", ["IsSiteAdmin"])).toEqual([
      "Id",
      "IsSiteAdmin",
    ]);
  });
});

describe("translateFilter", () => {
  it("renames columns per key, recursively", () => {
    const node: FilterNode = {
      kind: "and",
      children: [
        cmp("LoginName", "x"),
        { kind: "not", child: cmp("Email", "y") },
      ],
    };
    expect(toODataString(translateFilter("principals", node))).toBe(
      "(Name eq 'x') and (not (EMail eq 'y'))",
    );
    expect(toODataString(translateFilter("siteUsers", node))).toBe(
      "(LoginName eq 'x') and (not (Email eq 'y'))",
    );
  });
  // Group is the two group content types, never `not person`: SharePoint's list
  // OData has no negated startswith (a 400 live, 2026-09-14).
  const PERSON = "startswith(ContentTypeId, '0x010A')";
  const GROUP =
    "(startswith(ContentTypeId, '0x010B')) or (startswith(ContentTypeId, '0x010C'))";
  it("UIL: PrincipalType eq 1 is the Person prefix test, eq 8 the two group prefixes, ne flips them", () => {
    expect(
      toODataString(translateFilter("principals", cmp("PrincipalType", 1))),
    ).toBe(PERSON);
    expect(
      toODataString(translateFilter("principals", cmp("PrincipalType", 8))),
    ).toBe(GROUP);
    expect(
      toODataString(
        translateFilter("principals", cmp("PrincipalType", 1, "ne")),
      ),
    ).toBe(GROUP);
    expect(
      toODataString(
        translateFilter("principals", cmp("PrincipalType", 8, "ne")),
      ),
    ).toBe(PERSON);
  });
  it("UIL: never emits `not` for PrincipalType", () => {
    const negated: FilterNode[] = [
      cmp("PrincipalType", 1, "ne"),
      cmp("PrincipalType", 8, "ne"),
      { kind: "in", column: "PrincipalType", values: [8], negate: true },
      { kind: "in", column: "PrincipalType", values: [1, 8], negate: true },
      { kind: "not", child: cmp("PrincipalType", 1) },
      { kind: "not", child: cmp("PrincipalType", 8, "ne") },
      {
        kind: "not",
        child: {
          kind: "in",
          column: "PrincipalType",
          values: [8],
          negate: false,
        },
      },
      {
        kind: "not",
        child: {
          kind: "in",
          column: "PrincipalType",
          values: [1],
          negate: true,
        },
      },
    ];
    for (const node of negated) {
      expect(toODataString(translateFilter("principals", node))).not.toMatch(
        /\bnot\b/,
      );
    }
  });
  it("UIL: a `not` directly over a PrincipalType leaf folds into it — the positive prefix form comes out", () => {
    // not(eq 1) ≡ ne 1 → group; not(in [8]) ≡ not in [8] → person; double negation cancels.
    expect(
      toODataString(
        translateFilter("principals", {
          kind: "not",
          child: cmp("PrincipalType", 1),
        }),
      ),
    ).toBe(GROUP);
    expect(
      toODataString(
        translateFilter("principals", {
          kind: "not",
          child: {
            kind: "in",
            column: "PrincipalType",
            values: [8],
            negate: false,
          },
        }),
      ),
    ).toBe(PERSON);
    expect(
      toODataString(
        translateFilter("principals", {
          kind: "not",
          child: cmp("PrincipalType", 1, "ne"),
        }),
      ),
    ).toBe(PERSON);
    // The fold does not launder a value the UIL cannot express.
    expect(
      thrown(() =>
        translateFilter("principals", {
          kind: "not",
          child: cmp("PrincipalType", 4),
        }),
      ).name,
    ).toBe("QueryTranslationException");
  });
  it("UIL: a PrincipalType leaf deeper under a `not` is refused rather than sent as `not (startswith …)`", () => {
    const deep: FilterNode = {
      kind: "not",
      child: {
        kind: "and",
        children: [cmp("PrincipalType", 1), cmp("Title", "x")],
      },
    };
    const err = thrown(() => translateFilter("principals", deep));
    expect(err.name).toBe("QueryTranslationException");
    expect(err.message).toMatch(/cannot negate a content-type test/);
    // Nested not-of-not over the leaf is deeper too: no pushing through.
    expect(
      thrown(() =>
        translateFilter("principals", {
          kind: "not",
          child: { kind: "not", child: cmp("PrincipalType", 1) },
        }),
      ).name,
    ).toBe("QueryTranslationException");
  });
  it("`not` over anything but a PrincipalType leaf still renders `not (…)` — on principals and the collection keys alike", () => {
    expect(
      toODataString(
        translateFilter("principals", {
          kind: "not",
          child: cmp("Title", "x"),
        }),
      ),
    ).toBe("not (Title eq 'x')");
    expect(
      toODataString(
        translateFilter("principals", {
          kind: "not",
          child: {
            kind: "and",
            children: [cmp("Title", "x"), cmp("Email", "y")],
          },
        }),
      ),
    ).toBe("not ((Title eq 'x') and (EMail eq 'y'))");
    // siteUsers carries a real PrincipalType column, so `not` over it is fine there.
    expect(
      toODataString(
        translateFilter("siteUsers", {
          kind: "not",
          child: cmp("PrincipalType", 4),
        }),
      ),
    ).toBe("not (PrincipalType eq 4)");
  });
  it("UIL: PrincipalType in [1, 8] is an or of the two tests; negate takes the complement; the empty complement is a contradiction", () => {
    const node: FilterNode = {
      kind: "in",
      column: "PrincipalType",
      values: [1, 8],
      negate: false,
    };
    expect(toODataString(translateFilter("principals", node))).toBe(
      `(${PERSON}) or (${GROUP})`,
    );
    // A single value collapses to its own test (no or), and negate takes the other type.
    const notIn: FilterNode = {
      kind: "in",
      column: "PrincipalType",
      values: [1],
      negate: true,
    };
    expect(toODataString(translateFilter("principals", notIn))).toBe(GROUP);
    // `not in [1, 8]` admits nothing the UIL holds: an empty answer, not an error.
    const none: FilterNode = {
      kind: "in",
      column: "PrincipalType",
      values: [1, 8],
      negate: true,
    };
    expect(toODataString(translateFilter("principals", none))).toBe(
      `(${PERSON}) and (${GROUP})`,
    );
  });
  it("UIL: refuses a PrincipalType the content type cannot express, and any operator but eq/ne/in", () => {
    expect(
      thrown(() => translateFilter("principals", cmp("PrincipalType", 4))).name,
    ).toBe("QueryTranslationException");
    expect(() =>
      translateFilter("principals", cmp("PrincipalType", 1, "gt")),
    ).toThrow(/only eq\/ne\/in/);
    const isNull = thrown(() =>
      translateFilter("principals", {
        kind: "is-null",
        column: "PrincipalType",
        negate: false,
      }),
    );
    expect(isNull.name).toBe("QueryTranslationException");
    expect(isNull.message).toMatch(/cannot be used in a 'is-null' filter/);
  });
  it("siteUsers: PrincipalType is a real column, any value goes", () => {
    expect(
      toODataString(translateFilter("siteUsers", cmp("PrincipalType", 4))),
    ).toBe("PrincipalType eq 4");
  });
  it("refuses a column the key cannot carry, with QueryTranslationException", () => {
    expect(
      thrown(() => translateFilter("siteUsers", cmp("Description", "x"))).name,
    ).toBe("QueryTranslationException");
    expect(
      thrown(() => translateFilter("siteGroups", cmp("Email", "x"))).name,
    ).toBe("QueryTranslationException");
    expect(
      thrown(() => translateFilter("principals", cmp("OwnerTitle", "x"))).name,
    ).toBe("QueryTranslationException");
  });
  it("refuses container scoping — a provider source has no folders", () => {
    expect(
      thrown(() =>
        translateFilter("principals", {
          kind: "container-scope",
          path: "a",
          recursive: false,
        }),
      ).name,
    ).toBe("QueryTranslationException");
  });
});

describe("translateOrderBy", () => {
  it("renames and refuses like the filter", () => {
    expect(
      translateOrderBy("principals", [
        { column: "LoginName", direction: "asc" },
      ]),
    ).toEqual([{ column: "Name", direction: "asc" }]);
    expect(() =>
      translateOrderBy("principals", [
        { column: "PrincipalType", direction: "asc" },
      ]),
    ).toThrow(/PrincipalType/);
    expect(() =>
      translateOrderBy("siteUsers", [
        { column: "OwnerTitle", direction: "asc" },
      ]),
    ).toThrow(/OwnerTitle/);
  });
});

describe("inboundRecord", () => {
  const FIELDS = ["Id", "Title", "LoginName", "Email", "PrincipalType"];
  it("UIL person: renames back, derives 1 from the Person content type, keeps ContentTypeId out unless asked", () => {
    const raw = {
      Id: 6,
      Title: "Ada",
      Name: "i:0#.f|m|ada",
      EMail: "ada@x",
      ContentTypeId: "0x010A00AB",
    };
    expect(inboundRecord("principals", raw, FIELDS)).toEqual({
      Id: 6,
      Title: "Ada",
      LoginName: "i:0#.f|m|ada",
      Email: "ada@x",
      PrincipalType: 1,
    });
    expect(
      inboundRecord("principals", raw, [...FIELDS, "ContentTypeId"])
        .ContentTypeId,
    ).toBe("0x010A00AB");
  });
  it("UIL group: any other content type is 8; a record without ContentTypeId gets no PrincipalType", () => {
    expect(
      inboundRecord(
        "principals",
        { Id: 12, Title: "G", Name: "G", ContentTypeId: "0x010B00" },
        FIELDS,
      ),
    ).toEqual({ Id: 12, Title: "G", LoginName: "G", PrincipalType: 8 });
    expect(inboundRecord("principals", { Id: 12, Title: "G" }, FIELDS)).toEqual(
      { Id: 12, Title: "G" },
    );
    // toEqual tolerates undefined-valued keys; the columns the endpoint did not return must be ABSENT, not undefined.
    expect(
      Object.keys(inboundRecord("principals", { Id: 12, Title: "G" }, FIELDS)),
    ).toEqual(["Id", "Title"]);
  });
  it("siteUsers passes PrincipalType through, 4 included", () => {
    expect(
      inboundRecord(
        "siteUsers",
        { Id: 15, Title: "E", LoginName: "c:0-.f|x", PrincipalType: 4 },
        FIELDS,
      ),
    ).toEqual({ Id: 15, Title: "E", LoginName: "c:0-.f|x", PrincipalType: 4 });
  });
  it("siteGroups synthesises 8 and never invents Email", () => {
    expect(
      inboundRecord(
        "siteGroups",
        {
          Id: 12,
          Title: "G",
          LoginName: "G",
          Description: "d",
          OwnerTitle: "o",
        },
        [...FIELDS, "Description", "OwnerTitle"],
      ),
    ).toEqual({
      Id: 12,
      Title: "G",
      LoginName: "G",
      PrincipalType: 8,
      Description: "d",
      OwnerTitle: "o",
    });
  });
  it("takes ID when Id is absent", () => {
    expect(
      inboundRecord("principals", { ID: 3, Title: "t" }, ["Title"]).Id,
    ).toBe(3);
  });
});
