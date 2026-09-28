import { describe, it, expect } from "vitest";
import { Materialize } from "../../../src/Query/Materialize.js";
import { EntityType } from "../../../src/Metadata/EntityType.js";
import { Property } from "../../../src/Metadata/Property.js";

class Blog {
  Id?: number;
  Title?: string;
  Body?: string;
  ViewCount?: number;
  IsPublished?: boolean;
  PublishedAt?: Date;
  Status?: string;
  Tags?: string[];
}

function et(): EntityType<Blog> {
  const make = (
    n: string,
    t:
      | "Number"
      | "Text"
      | "Note"
      | "Boolean"
      | "DateTime"
      | "Choice"
      | "MultiChoice",
    isKey = false,
    opts: Record<string, unknown> = {},
  ) => {
    const config = (() => {
      switch (t) {
        case "Text":
          return { kind: "Text", multiline: false, maxLength: 255 } as const;
        case "Note":
          return {
            kind: "Text",
            multiline: true,
            richText: false,
            appendOnly: false,
            numberOfLines: 6,
          } as const;
        case "Boolean":
          return { kind: "Boolean" } as const;
        case "DateTime":
          return {
            kind: "DateTime",
            displayFormat: "DateTime",
            friendlyFormat: "Disabled",
          } as const;
        case "Choice":
        case "MultiChoice":
          return {
            kind: "Choice",
            multi: t === "MultiChoice",
            options: (opts.options as readonly unknown[]) ?? [],
            fillIn: false,
            radioButtons: false,
          } as const;
        default:
          return { kind: "Number" } as const;
      }
    })();
    return new Property({
      propertyName: n,
      columnName: n === "Id" ? "ID" : n,
      displayName: n,
      config,
      required: false,
      readOnly: false,
      key: isKey,
    });
  };
  return new EntityType<Blog>({
    ctor: Blog,
    list: { kind: "title", value: "Blogs" },
    properties: [
      make("Id", "Number", true),
      make("Title", "Text"),
      make("Body", "Note"),
      make("ViewCount", "Number"),
      make("IsPublished", "Boolean"),
      make("PublishedAt", "DateTime"),
      make("Status", "Choice", false, { options: ["Draft", "Published"] }),
      make("Tags", "MultiChoice", false, { options: ["a", "b", "c"] }),
    ],
  });
}

describe("Materialize", () => {
  it("a record holding typed values reaches the entity unchanged", () => {
    // The provider types every column it returns (pnpjs coerces; the fake stores
    // typed values), so core assigns as-is: the same Date, no re-parse.
    const when = new Date("2026-01-02T03:04:05Z");
    const e = Materialize.item(
      {
        ID: 42,
        Title: "Hi",
        Body: "<p>body</p>",
        ViewCount: 7,
        IsPublished: false,
        PublishedAt: when,
        Status: "Draft",
        Tags: ["a", "b"],
      },
      et(),
    );
    expect(e.Id).toBe(42);
    expect(e.Title).toBe("Hi");
    expect(e.Body).toBe("<p>body</p>");
    expect(e.ViewCount).toBe(7);
    expect(e.IsPublished).toBe(false);
    expect(e.PublishedAt).toBe(when);
    expect(e.Status).toBe("Draft");
    expect(e.Tags).toEqual(["a", "b"]);
  });

  it("fromProvider runs on the record's value, per element, and the mapped array is fresh", () => {
    const seen: unknown[] = [];
    const props = et().properties.map((p) =>
      p.propertyName === "Tags" || p.propertyName === "PublishedAt"
        ? new Property({
            propertyName: p.propertyName,
            columnName: p.columnName,
            displayName: p.displayName,
            config: p.config,
            required: false,
            readOnly: false,
            key: false,
            codec: {
              fromProvider: (v) => {
                seen.push(v);
                return v;
              },
            },
          })
        : p,
    );
    const converted = new EntityType<Blog>({
      ctor: Blog,
      list: { kind: "title", value: "Blogs" },
      properties: props,
    });
    const when = new Date("2026-01-02T03:04:05Z");
    const record = { ID: 1, PublishedAt: when, Tags: ["a", "b"] };
    const e = Materialize.item(record, converted);
    // The Date the codec saw is the record's own instance: nothing is
    // copied on the way to fromProvider (the record is core's — see the
    // IStorageProvider contract and Materialize.item's doc).
    expect(seen[0]).toBe(when);
    // Per element: the codec saw elements, never the array itself.
    expect(seen.slice(1)).toEqual(["a", "b"]);
    e.Tags!.push("c");
    expect(record.Tags).toEqual(["a", "b"]);
  });

  it("null and missing fields produce undefined", () => {
    const e = Materialize.item({ ID: 1, Title: null }, et());
    expect(e.Title).toBeUndefined();
    expect(e.Body).toBeUndefined();
  });

  it("applies fromProvider per element, and only where a property declares one", () => {
    const upper = (v: unknown) => String(v).toUpperCase();
    const props = et().properties.map((p) =>
      p.propertyName === "Tags" || p.propertyName === "Status"
        ? new Property({
            propertyName: p.propertyName,
            columnName: p.columnName,
            displayName: p.displayName,
            config: p.config,
            required: false,
            readOnly: false,
            key: false,
            codec: { fromProvider: upper },
          })
        : p,
    );
    const converted = new EntityType<Blog>({
      ctor: Blog,
      list: { kind: "title", value: "Blogs" },
      properties: props,
    });
    const e = Materialize.item(
      { ID: 1, Title: "plain", Status: "draft", Tags: ["a", "b"] },
      converted,
    );
    expect(e.Status).toBe("DRAFT");
    expect(e.Tags).toEqual(["A", "B"]);
    expect(e.Title).toBe("plain");
  });

  it("a fromProvider that answers undefined — no matching model value — leaves the property absent", () => {
    // A ctor that declares no `Status` field, so an own property can only come
    // from Materialize (a declared optional field is already an own `undefined`).
    class Sparse {
      Id?: number;
    }
    const status = et().findProperty("Status")!;
    const converted = new EntityType<Sparse>({
      ctor: Sparse,
      list: { kind: "title", value: "Blogs" },
      properties: [
        et().findProperty("Id")!,
        new Property({
          propertyName: status.propertyName,
          columnName: status.columnName,
          displayName: status.displayName,
          config: status.config,
          required: false,
          readOnly: false,
          key: false,
          codec: { fromProvider: () => undefined },
        }),
      ],
    });
    const e = Materialize.item({ ID: 1, Status: "retired" }, converted);
    // Absent, not an own `undefined`: the entity looks exactly as if the column
    // had been null, which is what "no matching model value" means.
    expect("Status" in e).toBe(false);
  });

  // Regression guard for the codec merge: Materialize and PayloadBuilder read ONLY
  // the provider pair (toProvider/fromProvider). If Materialize ever started
  // applying codec.fromWire at the column boundary, a DateTime column would hand
  // the entity something other than the Date the provider gave it — this
  // property's author-supplied fromWire throws, so a wrongly-invoked wire pair
  // fails loudly instead of silently passing (a DateTime's own fromWire is
  // otherwise an identity no-op on an already-typed Date, which would mask the bug).
  it("ignores codec.fromWire at the column boundary — the provider's Date reaches the entity as a Date, never the wire pair", () => {
    const when = new Date("2026-01-02T03:04:05.000Z");
    const prop = new Property({
      propertyName: "When",
      columnName: "When",
      displayName: "When",
      config: {
        kind: "DateTime",
        displayFormat: "DateTime",
        friendlyFormat: "Disabled",
      },
      required: false,
      readOnly: false,
      key: false,
      codec: {
        fromWire: () => {
          throw new Error("fromWire must not run at the column boundary");
        },
      },
    });
    class Row {
      Id?: number;
      When?: Date;
    }
    const id = new Property({
      propertyName: "Id",
      columnName: "ID",
      displayName: "ID",
      config: { kind: "Number" },
      required: false,
      readOnly: true,
      key: true,
    });
    const etRow = new EntityType<Row>({
      ctor: Row,
      list: { kind: "title", value: "Rows" },
      properties: [id, prop],
    });
    const e = Materialize.item({ When: when }, etRow);
    expect(e.When).toBe(when);
    expect(e.When).toBeInstanceOf(Date);
  });

  it("does not invoke fromProvider on a null column", () => {
    const props = et().properties.map((p) =>
      p.propertyName === "Status"
        ? new Property({
            propertyName: p.propertyName,
            columnName: p.columnName,
            displayName: p.displayName,
            config: p.config,
            required: false,
            readOnly: false,
            key: false,
            codec: {
              fromProvider: () => {
                throw new Error("must not run");
              },
            },
          })
        : p,
    );
    const converted = new EntityType<Blog>({
      ctor: Blog,
      list: { kind: "title", value: "Blogs" },
      properties: props,
    });
    const e = Materialize.item({ ID: 1, Status: null }, converted);
    expect(e.Status).toBeUndefined();
  });
});

class Blog2 {
  Id?: number;
  AuthorId?: number;
  TagsId?: number[];
}

function blogEt(): EntityType<Blog2> {
  return new EntityType<Blog2>({
    ctor: Blog2,
    list: { kind: "title", value: "Blogs" },
    properties: [
      new Property({
        propertyName: "Id",
        columnName: "ID",
        displayName: "ID",
        config: { kind: "Number" },
        required: true,
        readOnly: true,
        key: true,
      }),
      new Property({
        propertyName: "AuthorId",
        columnName: "AuthorId",
        displayName: "AuthorId",
        config: {
          kind: "Lookup",
          target: undefined as unknown as EntityType,
          displayField: "Title",
          multi: false,
        },
        required: false,
        readOnly: false,
        key: false,
      }),
      new Property({
        propertyName: "TagsId",
        columnName: "TagsId",
        displayName: "TagsId",
        config: {
          kind: "Lookup",
          target: undefined as unknown as EntityType,
          displayField: "Title",
          multi: true,
        },
        required: false,
        readOnly: false,
        key: false,
      }),
    ],
  });
}

describe("Materialize for Lookup/User", () => {
  it("reads single-value Lookup as number", () => {
    const r = Materialize.item({ ID: 1, AuthorId: 7 }, blogEt());
    expect(r.AuthorId).toBe(7);
  });
  it("reads multi-value Lookup as the array it was given", () => {
    const r = Materialize.item({ ID: 1, TagsId: [3, 4] }, blogEt());
    expect(r.TagsId).toEqual([3, 4]);
  });
  it("treats missing single-value Lookup as undefined", () => {
    const r = Materialize.item({ ID: 1 }, blogEt());
    expect(r.AuthorId).toBeUndefined();
  });
});
