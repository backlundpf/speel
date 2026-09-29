import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { useState, type ReactElement } from "react";
import {
  DbContext,
  ModelBuilder,
  type FieldConfig,
  type OptionsCreator,
  type OptionsLoader,
} from "@speel/core";
import { SpeelProvider } from "../src/SpeelProvider.js";
import { useStandaloneField } from "../src/form/useStandaloneField.js";
import type { FieldHandle } from "../src/form/FieldHandle.js";
import { fakeAdapter } from "./fakeAdapter.js";
import { makeFakeProvider } from "./fakeProvider.js";

class Office {
  Id?: number;
  Title?: string;
}
class Person {
  Id?: number;
  OfficeId?: number;
  Office?: Office | null;
}

const OFFICES = [
  { ID: 1, Title: "London" },
  { ID: 2, Title: "Lisbon" },
];

/** A model with one Person → Office lookup; returns the context and that lookup's config. */
function lookupModel(
  opts: {
    query?: OptionsLoader<Person, Office>;
    creator?: OptionsCreator<Person, Office>;
  } = {},
): { db: DbContext; config: FieldConfig } {
  class Ctx extends DbContext {
    protected override onModelCreating(mb: ModelBuilder): void {
      mb.entity(Office, (b) => {
        b.toList("Offices");
        b.property((e) => e.Id).isNumber();
        b.property((e) => e.Title).isText();
      });
      mb.entity(Person, (b) => {
        b.toList("People");
        b.property((e) => e.Id).isNumber();
        const rb = b
          .hasOne(Office, (e) => e.Office)
          .withMany()
          .hasForeignKey((e) => e.OfficeId)
          .hasDisplayField((o) => o.Title);
        if (opts.query) rb.hasOptionsQueryAsync(opts.query);
        if (opts.creator) rb.hasOptionsCreateAsync(opts.creator);
      });
    }
  }
  const db = new Ctx({
    provider: makeFakeProvider({ Offices: OFFICES }, { applyFilter: true }),
  } as never);
  const config = db.model
    .findEntityType(Person as never)!
    .findNavigation("Office")!.config as FieldConfig;
  return { db, config };
}

/** Mounts a standalone field over `config` and hands back its latest handle. */
function mountStandalone(
  config: FieldConfig,
  db?: DbContext,
): () => FieldHandle | undefined {
  let handle: FieldHandle | undefined;
  function Standalone(): ReactElement | null {
    const [v, setV] = useState<unknown>(null);
    handle = useStandaloneField<unknown>({
      config,
      displayName: "Office",
      value: v,
      onChange: setV,
    });
    return null;
  }
  render(
    db ? (
      <SpeelProvider db={db as never} ui={fakeAdapter}>
        <Standalone />
      </SpeelProvider>
    ) : (
      <Standalone />
    ),
  );
  return () => handle;
}

const titles = (rows: unknown[]) =>
  rows.map((r) => (r as { Title: string }).Title);

describe("useStandaloneField — a lookup", () => {
  it("loads the target's rows once when it declares neither options nor a query", async () => {
    const { db, config } = lookupModel();
    const field = mountStandalone(config, db);
    const options = field()?.options;
    expect(options?.mode).toBe("list");
    expect(titles(await options!.load())).toEqual(["London", "Lisbon"]);
  });

  it("runs a declared optionsQueryAsync against the target's set", async () => {
    const { db, config } = lookupModel({
      query: ({ set, query }) =>
        set.where((o) => o.Title.contains(query)).toArrayAsync(),
    });
    const field = mountStandalone(config, db);
    const options = field()?.options;
    expect(options?.mode).toBe("query");
    expect(titles(await options!.load("Lis"))).toEqual(["Lisbon"]);
  });

  it("offers a declared optionsCreateAsync", async () => {
    const { db, config } = lookupModel({
      creator: async ({ text, set }) =>
        Object.assign(new Office(), {
          Id: 3,
          Title: `${text}@${set.constructor.name}`,
        }),
    });
    const field = mountStandalone(config, db);
    expect(field()?.create).toBeDefined();
    const created = (await field()!.create!("Paris")) as Office;
    expect(created.Title).toMatch(/^Paris@/);
  });

  it("offers no source outside a provider, rather than throwing", () => {
    const { config } = lookupModel();
    const field = mountStandalone(config);
    expect(field()?.options).toBeUndefined();
    expect(field()?.create).toBeUndefined();
  });
});
