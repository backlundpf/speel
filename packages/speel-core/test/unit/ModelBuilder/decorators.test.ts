import { describe, it, expect } from "vitest";
import {
  Entity,
  SpeelEntity,
  ModelBuilder,
  TextField,
  NoteField,
  NumberField,
  CurrencyField,
  BooleanField,
  DateTimeField,
  ChoiceField,
  MultiChoiceField,
  DbSet,
  ChangeTracker,
  EntityState,
  InvalidOperationException,
} from "../../../src/index.js";
import { ENTITY_REGISTRY } from "../../../src/ModelBuilder/EntityTypeBuilder.js";
import { FakeStorageProvider } from "../fakes/FakeStorageProvider.js";
import type { EntityCtor, IEntity } from "../../../src/types.js";
import { TestPrincipal as Principal } from "../fakes/testPrincipals.js";

/** Build just this decorated entity's EntityType (no full-model build → no global-registry crosstalk). */
function propOf<T extends IEntity>(ctor: EntityCtor<T>, name: string) {
  return ENTITY_REGISTRY.get(ctor)!
    .build()
    .properties.find((p) => p.propertyName === name)!;
}

describe("field decorators", () => {
  it("@TextField applies config + state like the fluent path", () => {
    @Entity({ list: "DecText" })
    class T extends SpeelEntity {
      @TextField({ maxLength: 80, required: true, displayName: "Title" })
      public Title: string | null = null;
    }
    const p = propOf(T, "Title");
    expect(p.config).toEqual({ kind: "Text", multiline: false, maxLength: 80 });
    expect(p.required).toBe(true);
    expect(p.displayName).toBe("Title");
  });

  it("@NoteField is a multiline TextField", () => {
    @Entity({ list: "DecNote" })
    class N extends SpeelEntity {
      @NoteField({ richText: true, displayName: "Body" })
      public Body: string | null = null;
    }
    const p = propOf(N, "Body");
    expect(p.config).toMatchObject({
      kind: "Text",
      multiline: true,
      richText: true,
    });
    expect(p.displayName).toBe("Body");
  });

  it("@NumberField / @CurrencyField / @BooleanField / @DateTimeField match fluent output", () => {
    @Entity({ list: "DecScalar" })
    class S extends SpeelEntity {
      @NumberField({ min: 0, decimalPlaces: 1, required: true }) public Hours:
        number | null = null;
      @CurrencyField({ currencyCode: "USD", min: 0 }) public Cost:
        number | null = null;
      @BooleanField({ displayName: "Billable" }) public Billable:
        boolean | null = null;
      @DateTimeField({ min: new Date("2020-01-01T00:00:00.000Z") })
      public Due: Date | null = null;
    }
    expect(propOf(S, "Hours").config).toEqual({
      kind: "Number",
      min: 0,
      decimalPlaces: 1,
    });
    expect(propOf(S, "Hours").required).toBe(true);
    expect(propOf(S, "Cost").config).toEqual({
      kind: "Currency",
      decimalPlaces: 2,
      currencyCode: "USD",
      min: 0,
    });
    expect(propOf(S, "Billable").config).toEqual({ kind: "Boolean" });
    expect(propOf(S, "Billable").displayName).toBe("Billable");
    expect((propOf(S, "Due").config as { min?: string }).min).toBe(
      "2020-01-01T00:00:00.000Z",
    );
  });

  it("@ChoiceField infers T from options; object-valued + @MultiChoiceField set multi", () => {
    const CATS = [
      { id: "a", label: "A" },
      { id: "b", label: "B" },
    ];
    @Entity({ list: "DecChoice" })
    class Ch extends SpeelEntity {
      @ChoiceField({
        options: ["Lo", "Hi"],
        radioButtons: true,
        required: true,
      })
      public S: "Lo" | "Hi" | null = null;
      @ChoiceField({ options: CATS, optionsValue: (o) => o.id })
      public Cat: { id: string; label: string } | null = null;
      @MultiChoiceField({ options: ["x", "y"] })
      public Tags: string[] | null = null;
    }
    expect(propOf(Ch, "S").config).toMatchObject({
      kind: "Choice",
      multi: false,
      options: ["Lo", "Hi"],
      radioButtons: true,
    });
    expect(propOf(Ch, "S").required).toBe(true);
    expect(
      (propOf(Ch, "Cat").config as { optionsValue?: (o: unknown) => unknown })
        .optionsValue!(CATS[0]),
    ).toBe("a");
    expect(propOf(Ch, "Tags").config).toMatchObject({
      kind: "Choice",
      multi: true,
      options: ["x", "y"],
    });
  });

  it("a readOnly field declared `?: T = undefined` inserts; one holding a value still throws", () => {
    @Entity({ list: "DecReadOnly" })
    class Doc extends SpeelEntity {
      @TextField({ maxLength: 255 }) public Title: string | null = null;
      // A server-populated column: `= undefined` is the only initializer that both
      // compiles and survives add(), which rejects a read-only property with a value.
      @NumberField({ columnName: "ReviewScore", readOnly: true })
      public ReviewScore?: number = undefined;
    }
    const mb = new ModelBuilder();
    mb.entity(Doc, () => {
      /* decorators declare everything */
    });
    mb.entity(Principal, (b) =>
      b.toProviderSource({ kind: "provider", key: "principals" }),
    ); // the test principal source
    const model = mb.build();
    expect(propOf(Doc, "ReviewScore").readOnly).toBe(true);

    const set = new DbSet<Doc>(
      Doc,
      model,
      new FakeStorageProvider(),
      new ChangeTracker(model),
    );
    const ok = new Doc();
    ok.Title = "report.docx";
    expect(set.add(ok).state).toBe(EntityState.Added);

    const bad = new Doc();
    bad.Title = "other.docx";
    bad.ReviewScore = 5;
    expect(() => set.add(bad)).toThrow(InvalidOperationException);
  });

  it("a non-readOnly field is unaffected — a value on it still inserts", () => {
    @Entity({ list: "DecWritable" })
    class W extends SpeelEntity {
      @NumberField({}) public Hours: number | null = null;
    }
    const mb = new ModelBuilder();
    mb.entity(W, () => {
      /* decorators declare everything */
    });
    mb.entity(Principal, (b) =>
      b.toProviderSource({ kind: "provider", key: "principals" }),
    ); // the test principal source
    const model = mb.build();
    expect(propOf(W, "Hours").readOnly).toBe(false);

    const set = new DbSet<W>(
      W,
      model,
      new FakeStorageProvider(),
      new ChangeTracker(model),
    );
    const w = new W();
    w.Hours = 7;
    expect(set.add(w).state).toBe(EntityState.Added);
  });

  it("a decorator-declared field merges with onModelCreating refinement (coexistence)", () => {
    @Entity({ list: "DecCoexist" })
    class C extends SpeelEntity {
      @TextField({ maxLength: 50 }) public Title: string | null = null;
    }
    const mb = new ModelBuilder();
    // Reuses the decorator-registered builder; the fluent refinement merges, not throws.
    mb.entity(C, (b) => {
      b.property((e) => e.Title)
        .isText()
        .hasDisplayName("Refined");
    });
    const p = propOf(C, "Title");
    expect(p.displayName).toBe("Refined");
    expect((p.config as { maxLength?: number }).maxLength).toBe(50);
  });
});
