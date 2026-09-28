import * as React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, waitFor } from "@testing-library/react";
import {
  DbContext,
  ModelBuilder,
  OPTIONS_QUERY_TAKE,
  searchesDisplayField,
  type ChoiceOptionsLoader,
  type OptionsLoader,
  type OptionsThunk,
} from "@speel/core";
import { SpeelProvider } from "../src/SpeelProvider.js";
import {
  useEntityForm,
  EntityFormProvider,
} from "../src/form/useEntityForm.js";
import { useField } from "../src/form/useField.js";
import { optionsSourceFor } from "../src/form/optionsSource.js";
import type { FieldHandle } from "../src/form/FieldHandle.js";
import { fakeAdapter } from "./fakeAdapter.js";
import { makeFakeProvider } from "./fakeProvider.js";

class Office {
  Id?: number;
  Title?: string;
}
class Program {
  Id?: number;
  Title?: string;
}
class Person {
  Id?: number;
  Title?: string;
  OfficeId?: number;
  Office?: Office | null;
  Status?: string;
}

/**
 * A one-lookup, one-choice model: `Office` is the nav's target,
 * `Program` exists only so a Choice can source its list from a query, and `Status`
 * is a plain Choice on `Person`. Every knob defaults to today's plainest shape
 * (a bare lookup, a two-item literal choice) so a test overrides only what it's
 * actually about.
 */
function makeCtx(
  opts: {
    offices?: Record<string, unknown>[];
    programs?: Record<string, unknown>[];
    officeOptions?: readonly Office[] | OptionsThunk<Office>;
    officeOptionsQueryAsync?: OptionsLoader<Person, Office>;
    statusOptions?: readonly string[] | OptionsThunk<string>;
    statusOptionsQueryAsync?: ChoiceOptionsLoader<
      Record<string, unknown>,
      string
    >;
  } = {},
): { db: DbContext; provider: ReturnType<typeof makeFakeProvider> } {
  const provider = makeFakeProvider(
    {
      Offices: opts.offices ?? [
        { ID: 1, Title: "London" },
        { ID: 2, Title: "Lisbon" },
        { ID: 3, Title: "Oslo" },
      ],
      Programs: opts.programs ?? [],
      People: [{ ID: 7, Title: "Ada" }],
    },
    { applyFilter: true },
  );
  class Ctx extends DbContext {
    protected override onModelCreating(mb: ModelBuilder): void {
      mb.entity(Office, (b) => {
        b.toList("Offices");
        b.property((e) => e.Id).isNumber();
        b.property((e) => e.Title).isText();
      });
      mb.entity(Program, (b) => {
        b.toList("Programs");
        b.property((e) => e.Id).isNumber();
        b.property((e) => e.Title).isText();
      });
      mb.entity(Person, (b) => {
        b.toList("People");
        b.property((e) => e.Id).isNumber();
        b.property((e) => e.Title).isText();
        const rb = b
          .hasOne(Office, (e) => e.Office)
          .withMany()
          .hasForeignKey((e) => e.OfficeId)
          .hasDisplayField((o) => o.Title);
        if (opts.officeOptions !== undefined) rb.hasOptions(opts.officeOptions);
        if (opts.officeOptionsQueryAsync)
          rb.hasOptionsQueryAsync(opts.officeOptionsQueryAsync);
        b.property((e) => e.Status).isChoice(
          opts.statusOptionsQueryAsync
            ? { optionsQueryAsync: opts.statusOptionsQueryAsync }
            : { options: opts.statusOptions ?? ["A", "B"] },
        );
      });
    }
  }
  return { db: new Ctx({ provider } as never), provider };
}

describe("optionsSourceFor", () => {
  it("a lookup declaring neither issues the same single uncapped read it always did", async () => {
    // Padded past the search cap: a real cap would show up here if one leaked in.
    const offices = Array.from({ length: 150 }, (_, i) => ({
      ID: i + 1,
      Title: `Office ${i + 1}`,
    }));
    const { db, provider } = makeCtx({ offices });
    const nav = db.model.findEntityType(Person)!.findNavigation("Office")!;
    const src = optionsSourceFor({
      config: nav.config,
      db,
      set: db.set(Office),
      values: {},
    })!;
    expect(src.mode).toBe("list");

    provider.queries.length = 0;
    const rows = await src.load();
    expect(provider.queries).toHaveLength(1);
    expect(provider.lastQuery().filter).toBeUndefined();
    expect(provider.lastQuery().top).not.toBe(OPTIONS_QUERY_TAKE); // not the search cap
    expect(rows).toHaveLength(150); // loaded whole, past the cap

    // A list source's `load` ignores whatever it's handed — narrowing what's
    // already in hand is the CALLER's job, not the source's.
    provider.queries.length = 0;
    await src.load("anything");
    expect(provider.queries[0]!.filter).toBeUndefined();
  });

  it("a lookup's options thunk is called with the context and not the source", async () => {
    const thunk = vi.fn(({ db }: { db: DbContext }) =>
      db.set(Office).toArrayAsync(),
    );
    const { db } = makeCtx({ officeOptions: thunk });
    const nav = db.model.findEntityType(Person)!.findNavigation("Office")!;
    const src = optionsSourceFor({
      config: nav.config,
      db,
      set: db.set(Office),
      // A live draft, so "not the source" is actually being tested.
      values: { Id: 7, Title: "Ada" },
    })!;
    expect(src.mode).toBe("list");

    await src.load();
    expect(thunk).toHaveBeenCalledTimes(1);
    expect(Object.keys(thunk.mock.calls[0]![0])).toEqual(["db"]);
  });

  it("optionsQueryAsync puts the field in query mode and hands the loader the typed text", async () => {
    const seen: unknown[] = [];
    const { db } = makeCtx({
      officeOptionsQueryAsync: async (args) => {
        seen.push(args);
        return [];
      },
    });
    const nav = db.model.findEntityType(Person)!.findNavigation("Office")!;
    const values = { Id: 7, Title: "Ada" };
    const src = optionsSourceFor({
      config: nav.config,
      db,
      set: db.set(Office),
      values,
    })!;
    expect(src.mode).toBe("query");

    await src.load("Lo");
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({
      query: "Lo",
      source: values,
      displayField: "Title",
    });
  });

  it("optionsQueryAsync wins when options is declared too", () => {
    const { db } = makeCtx({
      officeOptions: [{ Id: 999, Title: "Ignored" }],
      officeOptionsQueryAsync: async () => [],
    });
    const nav = db.model.findEntityType(Person)!.findNavigation("Office")!;
    const src = optionsSourceFor({
      config: nav.config,
      db,
      set: db.set(Office),
      values: {},
    })!;
    expect(src.mode).toBe("query");
  });

  it("a lookup's declared query with no target set yields no source, not a loader handed set: undefined", () => {
    const loader = vi.fn(async () => []);
    const { db } = makeCtx({ officeOptionsQueryAsync: loader });
    const nav = db.model.findEntityType(Person)!.findNavigation("Office")!;
    expect(
      optionsSourceFor({ config: nav.config, db, values: {} }),
    ).toBeUndefined();
    expect(loader).not.toHaveBeenCalled();
  });

  it("a Choice thunk or query with no db throws a clear error; a literal list needs none", async () => {
    const { db } = makeCtx({ statusOptions: () => Promise.resolve(["A"]) });
    const thunk = db.model.findEntityType(Person)!.findProperty("Status")!;
    expect(() =>
      optionsSourceFor({ config: thunk.config, values: {} }),
    ).toThrow(/SpeelProvider/);

    const { db: qdb } = makeCtx({
      statusOptionsQueryAsync: async () => ["A"],
    });
    const queried = qdb.model.findEntityType(Person)!.findProperty("Status")!;
    expect(() =>
      optionsSourceFor({ config: queried.config, values: {} }),
    ).toThrow(/SpeelProvider/);

    const { db: ldb } = makeCtx({ statusOptions: ["A", "B"] });
    const literal = ldb.model.findEntityType(Person)!.findProperty("Status")!;
    const src = optionsSourceFor({ config: literal.config, values: {} })!;
    expect(await src.load()).toEqual(["A", "B"]);
  });

  it("searchesDisplayField() as the declared query narrows at the source and caps", async () => {
    const offices = Array.from({ length: 150 }, (_, i) => ({
      ID: i + 1,
      Title: i === 0 ? "London" : `Office ${i + 1}`,
    }));
    const { db, provider } = makeCtx({
      offices,
      officeOptionsQueryAsync: searchesDisplayField(),
    });
    const nav = db.model.findEntityType(Person)!.findNavigation("Office")!;
    const src = optionsSourceFor({
      config: nav.config,
      db,
      set: db.set(Office),
      values: {},
    })!;

    provider.queries.length = 0;
    await src.load("Lon");
    expect(provider.lastQuery()).toMatchObject({
      filter: expect.stringContaining("Lon") as unknown,
      top: OPTIONS_QUERY_TAKE,
    });

    // Nothing typed: still capped, no filter — the mount-time read.
    provider.queries.length = 0;
    await src.load();
    expect(provider.lastQuery().filter).toBeUndefined();
    expect(provider.lastQuery().top).toBe(OPTIONS_QUERY_TAKE);
  });

  it("a literal Choice is a list", async () => {
    const { db } = makeCtx({ statusOptions: ["A", "B"] });
    const prop = db.model.findEntityType(Person)!.findProperty("Status")!;
    const src = optionsSourceFor({ config: prop.config, db, values: {} })!;
    expect(src.mode).toBe("list");
    expect(await src.load()).toEqual(["A", "B"]);
  });

  it("a Choice can source its options from a thunk that queries the db — no route before this", async () => {
    // The thunk closes over `db` only, the same mechanism a
    // `@ChoiceField({ options: ({ db }) => ... })` decorator uses (it has nothing
    // else to close over) — exercised fluently here for a real DbContext/provider.
    const { db } = makeCtx({
      programs: [
        { ID: 1, Title: "Alpha" },
        { ID: 2, Title: "Beta" },
      ],
      statusOptions: ({ db }) =>
        db
          .set(Program)
          .toArrayAsync()
          .then((rows) => rows.map((p) => p.Title ?? "")),
    });
    const prop = db.model.findEntityType(Person)!.findProperty("Status")!;
    const src = optionsSourceFor({ config: prop.config, db, values: {} })!;
    expect(src.mode).toBe("list");
    expect(await src.load()).toEqual(["Alpha", "Beta"]);
  });

  it("a queried Choice gets db and source, and no set", async () => {
    const seen: unknown[] = [];
    const { db } = makeCtx({
      statusOptionsQueryAsync: async (args) => {
        seen.push(args);
        return ["A"];
      },
    });
    const prop = db.model.findEntityType(Person)!.findProperty("Status")!;
    const src = optionsSourceFor({
      config: prop.config,
      db,
      values: { Id: 1 },
    })!;
    expect(src.mode).toBe("query");

    await src.load("a");
    expect(Object.keys(seen[0] as Record<string, unknown>).sort()).toEqual([
      "db",
      "query",
      "source",
    ]);
  });

  it("a Text field has no options source", () => {
    const { db } = makeCtx();
    const prop = db.model.findEntityType(Person)!.findProperty("Title")!;
    expect(
      optionsSourceFor({ config: prop.config, db, values: {} }),
    ).toBeUndefined();
  });
});

/**
 * `optionsSourceFor` above is pure and gets a hand-built `values`; these two mount
 * a real form so `useField`'s own wiring — resolving the nav's target set, reading
 * the live store — is what is exercised, not a stand-in for it.
 *
 * This file is `.ts`, not `.tsx` (`optionsSourceFor` needs no JSX at all), so the
 * two components below are built with `React.createElement` rather than JSX.
 */
describe("useField wiring", () => {
  async function mountOfficeField(db: DbContext): Promise<FieldHandle> {
    const person = Object.assign(new Person(), { Id: 7, Title: "Ada" });
    let handle: FieldHandle | undefined;
    function Probe(): null {
      handle = useField("Office");
      return null;
    }
    function Inner() {
      const form = useEntityForm(person, "edit");
      return React.createElement(EntityFormProvider, {
        value: form as never,
        children: React.createElement(Probe),
      });
    }
    render(
      React.createElement(SpeelProvider, {
        db: db as never,
        ui: fakeAdapter,
        children: React.createElement(Inner),
      }),
    );
    await waitFor(() => expect(handle).toBeDefined());
    return handle!;
  }

  it("useField exposes an OptionsSource wired to the live db for a bare lookup", async () => {
    const { db, provider } = makeCtx();
    const handle = await mountOfficeField(db);
    provider.queries.length = 0;
    const rows = (await handle.options!.load()) as Office[];
    expect(rows.map((o) => o.Title)).toEqual(["London", "Lisbon", "Oslo"]);
  });

  it("a declared optionsQueryAsync sees the live draft as `source`, not an empty bag", async () => {
    const seen: unknown[] = [];
    const { db } = makeCtx({
      officeOptionsQueryAsync: async (args) => {
        seen.push(args);
        return [];
      },
    });
    const handle = await mountOfficeField(db);

    await handle.options!.load("ada");
    expect(seen).toHaveLength(1);
    // ...and `source` is the live draft, not an empty bag: asserting only on
    // `query` would pass with `source: {}` too, pinning nothing.
    expect(seen[0]).toMatchObject({
      query: "ada",
      source: { Id: 7, Title: "Ada" },
    });
  });
});
