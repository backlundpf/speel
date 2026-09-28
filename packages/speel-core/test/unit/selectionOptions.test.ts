import { describe, it, expect, vi } from "vitest";
import {
  DbContext,
  ModelBuilder,
  Entity,
  Key,
  SpeelEntity,
  TextField,
  ManyToOne,
} from "../../src/index.js";
import { ChoiceFieldBuilder } from "../../src/ModelBuilder/fieldTypes/ChoiceFieldBuilder.js";
import { declaredOptions } from "../../src/Metadata/selectionOptions.js";
import { ModelConfigurationException } from "../../src/errors.js";
import type { FieldConfig } from "../../src/Metadata/FieldConfig.js";
import { FakeStorageProvider } from "./fakes/FakeStorageProvider.js";

type Choice = Extract<FieldConfig, { kind: "Choice" }>;
type Lookup = Extract<FieldConfig, { kind: "Lookup" }>;
const asChoice = (c: FieldConfig): Choice => c as Choice;
const asLookup = (c: FieldConfig): Lookup => c as Lookup;

class Office {
  Id?: number;
  Title?: string;
}
class Person {
  Id?: number;
  Title?: string;
  Office?: Office;
}

/** Model exposes `findEntityType(ctor)`; an EntityType exposes `navigations()`. */
const navOf = (ctx: DbContext, ctor: never, name: string) =>
  ctx.model
    .findEntityType(ctor)!
    .navigations()
    .find((n) => n.name === name)!;

describe("the options surface", () => {
  it("a Choice's literal list lands on config.options", () => {
    const p = new ChoiceFieldBuilder<string>()
      .hasOptions(["A", "B"])
      .build("Status", false);
    const cfg = asChoice(p.config);
    expect(cfg.options).toEqual(["A", "B"]);
    expect(cfg.radioButtons).toBe(false);
  });

  it("a Choice's literal list is copied, not aliased", () => {
    const list = ["A", "B"];
    const p = new ChoiceFieldBuilder<string>()
      .hasOptions(list)
      .build("Status", false);
    list.push("C");
    expect(asChoice(p.config).options).toEqual(["A", "B"]);
  });

  it("a Choice thunk is stored, not invoked, at model build", () => {
    const thunk = vi.fn(() => ["A"]);
    const p = new ChoiceFieldBuilder<string>()
      .hasOptions(thunk)
      .build("Status", false);
    expect(thunk).not.toHaveBeenCalled();
    expect(asChoice(p.config).options).toBe(thunk);
  });

  it("asRadioButtons() sets radioButtons", () => {
    const p = new ChoiceFieldBuilder<string>()
      .hasOptions(["A"])
      .asRadioButtons()
      .build("Status", false);
    expect(asChoice(p.config).radioButtons).toBe(true);
  });

  it("a Choice carries optionsQuery and optionsQueryAsync from the fluent builder", () => {
    const q = (_q: string, o: readonly string[]) => o;
    const l = async () => ["A"];
    const p = new ChoiceFieldBuilder<string>()
      .hasOptions(["A"])
      .hasOptionsQuery(q)
      .hasOptionsQueryAsync(l)
      .build("Status", false);
    const cfg = asChoice(p.config);
    expect(cfg.optionsQuery).toBe(q);
    expect(cfg.optionsQueryAsync).toBe(l);
  });

  it("a Choice with neither options nor optionsQueryAsync throws at build", () => {
    expect(() =>
      new ChoiceFieldBuilder<string>().build("Status", false),
    ).toThrow(ModelConfigurationException);
    expect(() =>
      new ChoiceFieldBuilder<string>().build("Status", false),
    ).toThrow(/requires hasOptions/);
  });

  it("a Choice with only optionsQueryAsync builds", () => {
    const l = async () => ["A"];
    const p = new ChoiceFieldBuilder<string>()
      .hasOptionsQueryAsync(l)
      .build("Status", false);
    const cfg = asChoice(p.config);
    expect(cfg.optionsQueryAsync).toBe(l);
    expect("options" in cfg).toBe(false);
  });

  it("an empty literal list still throws", () => {
    expect(() =>
      new ChoiceFieldBuilder<string>().hasOptions([]).build("Status", false),
    ).toThrow(/requires hasOptions/);
  });

  it("a Choice's decorator bag reaches the config through the option route", () => {
    const thunk = vi.fn(() => ["A"]);
    const q = (_q: string, o: readonly unknown[]) => o;
    const p = new ChoiceFieldBuilder<string>({
      options: thunk,
      optionsQuery: q,
      radioButtons: true,
    }).build("Status", false);
    const cfg = asChoice(p.config);
    expect(cfg.options).toBe(thunk);
    expect(cfg.optionsQuery).toBe(q);
    expect(cfg.radioButtons).toBe(true);
    expect(thunk).not.toHaveBeenCalled();
  });

  it("a lookup carries options, optionsQuery and optionsQueryAsync from the fluent builder", () => {
    const thunk = vi.fn(() => [] as Office[]);
    const q = (_q: string, o: readonly Office[]) => o;
    const l = async () => [] as Office[];
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
          b.hasOne(() => Office, "Office")
            .withMany()
            .hasOptions(thunk)
            .hasOptionsQuery(q)
            .hasOptionsQueryAsync(l);
        });
      }
    }
    const nav = navOf(
      new Ctx({ provider: {} as never } as never),
      Person as never,
      "Office",
    );
    const cfg = asLookup(nav.config);
    expect(cfg.options).toBe(thunk);
    expect(cfg.optionsQuery).toBe(q);
    expect(cfg.optionsQueryAsync).toBe(l);
    expect(thunk).not.toHaveBeenCalled();
  });

  it("a lookup carries the same members from a decorator", () => {
    const thunk = vi.fn(() => [] as SoOffice[]);
    const q = (_q: string, o: readonly SoOffice[]) => o;
    const l = async () => [] as SoOffice[];

    @Entity({ list: "So_Offices" })
    class SoOffice extends SpeelEntity {
      @Key public override Id?: number = undefined;
      @TextField() public Title: string | null = null;
    }
    @Entity({ list: "So_People" })
    class SoPerson extends SpeelEntity {
      @Key public override Id?: number = undefined;
      @ManyToOne(() => SoOffice, {
        options: thunk,
        optionsQuery: q,
        optionsQueryAsync: l,
      })
      public Office: SoOffice | null = null;
    }
    class Ctx extends DbContext {
      public people = this.set(SoPerson);
      public offices = this.set(SoOffice);
    }
    const nav = navOf(
      new Ctx({ provider: new FakeStorageProvider() }),
      SoPerson as never,
      "Office",
    );
    const cfg = asLookup(nav.config);
    expect(cfg.options).toBe(thunk);
    expect(cfg.optionsQuery).toBe(q);
    expect(cfg.optionsQueryAsync).toBe(l);
    expect(thunk).not.toHaveBeenCalled();
  });

  it("the synthesized FK column carries no selection behaviour", () => {
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
          b.hasOne(() => Office, "Office")
            .withMany()
            .hasOptions(() => [])
            .hasOptionsQueryAsync(async () => []);
        });
      }
    }
    const nav = navOf(
      new Ctx({ provider: {} as never } as never),
      Person as never,
      "Office",
    );
    const fkCfg = nav.foreignKey.config;
    expect(Object.keys(fkCfg).sort()).toEqual(
      ["displayField", "kind", "multi", "target"].sort(),
    );
    expect("displayAs" in fkCfg).toBe(false);
  });
});

describe("declaredOptions", () => {
  const base = { multi: false, fillIn: false, radioButtons: false } as const;

  it("returns a literal list", () => {
    expect(
      declaredOptions({ kind: "Choice", ...base, options: ["a"] }),
    ).toEqual(["a"]);
  });

  it("is undefined (open) for a thunk", () => {
    expect(
      declaredOptions({ kind: "Choice", ...base, options: () => ["a"] }),
    ).toBeUndefined();
  });

  it("is undefined (open) when a query is declared beside a literal list — the query wins", () => {
    expect(
      declaredOptions({
        kind: "Choice",
        ...base,
        options: ["a", "b"],
        optionsQueryAsync: async () => ["z"],
      }),
    ).toBeUndefined();
  });
});
