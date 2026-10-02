import { describe, it, expect } from "vitest";
import { ModelBuilder } from "../../../src/ModelBuilder/ModelBuilder.js";
import { Property } from "../../../src/Metadata/Property.js";
import { TextField } from "../../../src/ModelBuilder/fieldTypes/TextFieldBuilder.js";
import { ManyToOne } from "../../../src/ModelBuilder/navigations/relationshipDecorators.js";

class Owner {
  Id?: number;
  Title?: string;
}

describe("systemGenerated", () => {
  it("Property defaults systemGenerated to false and carries an explicit true", () => {
    const base = {
      propertyName: "X",
      columnName: "X",
      displayName: "X",
      config: { kind: "Number" as const },
      required: false,
      readOnly: true,
      key: false,
    };
    expect(new Property(base).systemGenerated).toBe(false);
    expect(
      new Property({ ...base, systemGenerated: true }).systemGenerated,
    ).toBe(true);
  });

  describe("decorated fields", () => {
    class Row {
      Id?: number;
      @TextField({ systemGenerated: true }) Sys?: string = undefined;
      @TextField({ systemGenerated: true, readOnly: false })
      SysWritable?: string = undefined;
      @TextField({ readOnly: true }) ReadOnlyOnly?: string = undefined;
      @TextField() Plain?: string = undefined;
      @ManyToOne(() => Owner, { systemGenerated: true })
      SysOwner?: Owner = undefined;
      @ManyToOne(() => Owner, {
        systemGenerated: true,
        readOnly: false,
        foreignKey: "OtherOwnerId",
      })
      OtherOwner?: Owner = undefined;
    }

    function et() {
      const mb = new ModelBuilder();
      mb.entity(Owner, (b) => {
        b.toList("Owners");
        b.property((e) => e.Title).isText();
      });
      mb.entity(Row, (b) => b.toList("Rows"));
      return mb.build().findEntityType(Row)!;
    }

    it("systemGenerated implies readOnly", () => {
      const p = et().findProperty("Sys")!;
      expect(p.systemGenerated).toBe(true);
      expect(p.readOnly).toBe(true);
    });

    it("an explicit readOnly: false clears the implied readOnly", () => {
      const p = et().findProperty("SysWritable")!;
      expect(p.systemGenerated).toBe(true);
      expect(p.readOnly).toBe(false);
    });

    it("readOnly alone is not systemGenerated", () => {
      const p = et().findProperty("ReadOnlyOnly")!;
      expect(p.readOnly).toBe(true);
      expect(p.systemGenerated).toBe(false);
      const plain = et().findProperty("Plain")!;
      expect(plain.readOnly).toBe(false);
      expect(plain.systemGenerated).toBe(false);
    });

    it("a systemGenerated navigation is read-only, and so is its FK column", () => {
      const t = et();
      const nav = t.findNavigation("SysOwner")!;
      expect(nav.systemGenerated).toBe(true);
      expect(nav.readOnly).toBe(true);
      expect(nav.foreignKey.systemGenerated).toBe(true);
      expect(nav.foreignKey.readOnly).toBe(true);
    });

    it("a systemGenerated navigation with readOnly: false stays writable", () => {
      const nav = et().findNavigation("OtherOwner")!;
      expect(nav.systemGenerated).toBe(true);
      expect(nav.readOnly).toBe(false);
      expect(nav.foreignKey.readOnly).toBe(false);
    });
  });

  describe("fluent fields", () => {
    class Item {
      Id?: number;
      A?: string;
      B?: string;
      C?: string;
      Owner?: Owner;
      OwnerId?: number;
    }

    function et() {
      const mb = new ModelBuilder();
      mb.entity(Owner, (b) => {
        b.toList("Owners");
        b.property((e) => e.Title).isText();
      });
      mb.entity(Item, (b) => {
        b.toList("Items");
        b.property((e) => e.A)
          .isText()
          .isSystemGenerated();
        b.property((e) => e.B)
          .isText()
          .isSystemGenerated()
          .isReadOnly(false);
        b.property((e) => e.C)
          .isText()
          .isReadOnly();
        b.hasOne(Owner, (e) => e.Owner)
          .withMany()
          .isSystemGenerated();
      });
      return mb.build().findEntityType(Item)!;
    }

    it("isSystemGenerated() implies readOnly; isReadOnly(false) clears it", () => {
      const t = et();
      expect(t.findProperty("A")!.readOnly).toBe(true);
      expect(t.findProperty("A")!.systemGenerated).toBe(true);
      expect(t.findProperty("B")!.readOnly).toBe(false);
      expect(t.findProperty("B")!.systemGenerated).toBe(true);
      expect(t.findProperty("C")!.readOnly).toBe(true);
      expect(t.findProperty("C")!.systemGenerated).toBe(false);
    });

    it("isSystemGenerated() on a relationship marks the navigation and its FK", () => {
      const nav = et().findNavigation("Owner")!;
      expect(nav.systemGenerated).toBe(true);
      expect(nav.readOnly).toBe(true);
      expect(nav.foreignKey.systemGenerated).toBe(true);
    });
  });
});
