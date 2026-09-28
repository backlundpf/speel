import { describe, it, expect } from "vitest";
import { ModelBuilder } from "../../../src/ModelBuilder/ModelBuilder.js";
import { Entity, Key, TextField } from "../../../src/index.js";
import { EntityTypeBuilder } from "../../../src/ModelBuilder/EntityTypeBuilder.js";
import {
  InvalidOperationException,
  ModelConfigurationException,
} from "../../../src/errors.js";

class Person {
  Id?: number;
  Title?: string;
}
class Doc {
  Id?: number;
  Title?: string;
  OwnerId?: number;
  Owner?: Person;
}

const PRINCIPALS = { kind: "provider", key: "principals" } as const;

describe("EntitySource: list or provider", () => {
  it("toProviderSource registers a provider source and sourceHandle IS it", () => {
    const mb = new ModelBuilder();
    mb.entity(Person, (b) => {
      b.toProviderSource(PRINCIPALS);
      b.property((p) => p.Title).isText();
    });
    const et = mb.build().findEntityType(Person)!;
    expect(et.source).toEqual(PRINCIPALS);
    expect(et.sourceHandle).toEqual(PRINCIPALS);
    expect(() => et.list).toThrow(InvalidOperationException);
    expect(() => et.list).toThrow(/provider 'principals'/);
  });

  it("toList is shorthand for toProviderSource of a list source, provisioning included", () => {
    const viaShorthand = new EntityTypeBuilder(Doc);
    viaShorthand.toList("Docs", { template: "documentLibrary" });
    const viaGeneral = new EntityTypeBuilder(Doc);
    viaGeneral.toProviderSource({
      kind: "list",
      list: { kind: "title", value: "Docs" },
      provisioning: { template: "documentLibrary" },
    });
    expect(viaShorthand.getSource()).toEqual(viaGeneral.getSource());
    const et = viaShorthand.build();
    expect(et.sourceHandle).toEqual({ kind: "title", value: "Docs" });
    expect(et.list).toEqual({ kind: "title", value: "Docs" });
  });

  it("the last source call wins, and the list handle follows it", () => {
    const b = new EntityTypeBuilder(Doc);
    b.toList("Docs");
    b.toProviderSource(PRINCIPALS);
    expect(b.getSource()).toEqual(PRINCIPALS);
    expect(b.getListHandle()).toBeUndefined();
    b.toList("Docs");
    expect(b.getListHandle()).toEqual({ kind: "title", value: "Docs" });
  });

  it("@Entity accepts source (general) or list (shorthand); both produce the same list source", () => {
    @Entity({ source: PRINCIPALS })
    class DecoratedPerson {
      @Key Id?: number = undefined;
      @TextField() Title?: string = undefined;
    }
    @Entity({ list: "Widgets", readSecurity: "own" })
    class ViaList {
      @Key Id?: number = undefined;
    }
    @Entity({
      source: {
        kind: "list",
        list: { kind: "title", value: "Gadgets" },
        provisioning: { readSecurity: "own" },
      },
    })
    class ViaSource {
      @Key Id?: number = undefined;
    }
    const mb = new ModelBuilder();
    mb.entity(DecoratedPerson);
    mb.entity(ViaList);
    mb.entity(ViaSource);
    const m = mb.build();
    expect(m.findEntityType(DecoratedPerson)!.source).toEqual(PRINCIPALS);
    expect(m.findEntityType(ViaList)!.source).toEqual({
      kind: "list",
      list: { kind: "title", value: "Widgets" },
      provisioning: { readSecurity: "own" },
    });
    expect(m.findEntityType(ViaSource)!.source).toEqual({
      kind: "list",
      list: { kind: "title", value: "Gadgets" },
      provisioning: { readSecurity: "own" },
    });
  });

  it("a lookup targeting a provider-source entity is kind Lookup (there is no User kind)", () => {
    const mb = new ModelBuilder();
    mb.entity(Person, (b) => {
      b.toProviderSource(PRINCIPALS);
      b.property((p) => p.Title).isText();
    });
    mb.entity(Doc, (b) => {
      b.toList("Docs");
      b.property((d) => d.Title).isText();
      b.hasOne(Person, (d) => d.Owner)
        .withMany()
        .hasForeignKey((d) => d.OwnerId);
    });
    const m = mb.build();
    const fk = m.findEntityType(Doc)!.findProperty("OwnerId")!;
    expect(fk.config.kind).toBe("Lookup");
    if (fk.config.kind === "Lookup") {
      expect(fk.config.target.source.kind).toBe("provider");
      expect(fk.config.target).toBe(m.findEntityType(Person));
    }
    expect(m.findEntityType(Doc)!.findNavigation("Owner")!.config.kind).toBe(
      "Lookup",
    );
  });

  it("an entity with no source fails naming both builder forms", () => {
    const mb = new ModelBuilder();
    mb.entity(Person, (b) => {
      b.property((p) => p.Title).isText();
    });
    expect(() => mb.build()).toThrow(ModelConfigurationException);
    expect(() => mb.build()).toThrow(/toList\/toProviderSource/);
  });
});
