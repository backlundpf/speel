import { describe, it, expect } from "vitest";
import { DbContext, ModelBuilder } from "../../src/index.js";
import type { FieldContext } from "../../src/index.js";

class Office {
  Id?: number;
  Title?: string;
}
class Person {
  Id?: number;
  Title?: string;
  Office?: Office;
}

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
      b.property((e) => e.Title).isText();
      b.hasOne(() => Office, "Office")
        .withMany()
        .hasDisplayField((o: Office) => o.Title)
        .hasOptionsFilter((c) => (c.option as Office).Title !== "Hidden");
    });
  }
}

/** Model exposes `findEntityType(ctor)`; an EntityType exposes `navigations()`. */
const navOf = (ctx: DbContext, ctor: never, name: string) =>
  ctx.model
    .findEntityType(ctor)!
    .navigations()
    .find((n) => n.name === name)!;

describe("Lookup field config carries its options settings", () => {
  const nav = navOf(
    new Ctx({ provider: {} as never } as never),
    Person as never,
    "Office",
  );

  it("declares no picker shape on the field config — there is one control", () => {
    expect(nav.config).toMatchObject({ kind: "Lookup" });
    expect("displayAs" in nav.config).toBe(false);
  });

  it("carries the client-side optionsFilter on the config, not the navigation", () => {
    const cfg = nav.config as Extract<typeof nav.config, { kind: "Lookup" }>;
    expect(typeof cfg.optionsFilter).toBe("function");
    expect(cfg.optionsFilter!({ option: { Title: "Hidden" } } as never)).toBe(
      false,
    );
    expect((nav as unknown as Record<string, unknown>).optionsFilter).toBe(
      undefined,
    );
  });

  it("declares no options source when nothing is declared (load the target once)", () => {
    class Plain extends DbContext {
      protected override onModelCreating(mb: ModelBuilder): void {
        mb.entity(Office, (b) => {
          b.toList("Offices");
          b.property((e) => e.Id).isNumber();
        });
        mb.entity(Person, (b) => {
          b.toList("People");
          b.property((e) => e.Id).isNumber();
          b.hasOne(() => Office, "Office").withMany();
        });
      }
    }
    const n = navOf(
      new Plain({ provider: {} as never } as never),
      Person as never,
      "Office",
    );
    expect(n.config).toMatchObject({ kind: "Lookup", multi: false });
    expect("options" in n.config).toBe(false);
    expect("optionsQuery" in n.config).toBe(false);
    expect("optionsQueryAsync" in n.config).toBe(false);
  });
});

describe("a navigation's own render reaches the navigation record", () => {
  // `render` is a REFINEMENT_KEY, so both the fluent `.hasRender()` and a
  // decorator's `{ render }` option land in the same slot — the shared field-state
  // draft. The navigation record has to read the renderer from there.
  const renderChip = (ctx: FieldContext): string => `chip:${String(ctx.value)}`;

  class RenderCtx extends DbContext {
    protected override onModelCreating(mb: ModelBuilder): void {
      mb.entity(Office, (b) => {
        b.toList("Offices");
        b.property((e) => e.Id).isNumber();
      });
      mb.entity(Person, (b) => {
        b.toList("People");
        b.property((e) => e.Id).isNumber();
        b.hasOne(() => Office, "Office")
          .withMany()
          .hasRender(renderChip);
      });
    }
  }

  it("surfaces a declared field renderer on the navigation", () => {
    const nav = navOf(
      new RenderCtx({ provider: {} as never } as never),
      Person as never,
      "Office",
    );
    expect(nav.render).toBe(renderChip);
  });
});
