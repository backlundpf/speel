import { describe, it, expect } from "vitest";
import { ModelBuilder } from "../../../src/ModelBuilder/ModelBuilder.js";
import {
  Entity,
  Key,
  TextField,
  NumberField,
  DateTimeField,
  ManyToOne,
} from "../../../src/index.js";

// An undecorated base with field decorators — the shape SpeelEntity takes next task.
abstract class Base {
  Id?: number = undefined;
  @DateTimeField({ readOnly: true }) readonly Created?: Date = undefined;
  @NumberField({ readOnly: true, visible: false }) readonly Flag?: number =
    undefined;
}
abstract class Mid extends Base {
  @TextField() Notes?: string = undefined;
}
class Person {
  Id?: number;
  Title?: string;
}
class Boss extends Person {
  Level?: number;
}

describe("decorator metadata up the constructor chain", () => {
  it("a fluent entity(ctor) on a decorated base inherits every level, emits them own-first (inheritance-depth order), and fluent refinements merge on top", () => {
    class Task extends Mid {
      Title?: string;
    }
    const mb = new ModelBuilder();
    mb.entity(Task, (b) => {
      b.toList("Tasks");
      b.property((t) => t.Title).isText();
      b.property((t) => t.Notes)
        .isText()
        .hasDisplayName("Task notes"); // refines the inherited Notes
    });
    const et = mb.build().findEntityType(Task)!;
    expect(et.properties.map((p) => p.propertyName).sort()).toEqual([
      "Created",
      "Flag",
      "Id",
      "Notes",
      "Title",
    ]);
    // Depth order: Task's own fluent Title (0), then Mid's Notes (1), then Base's
    // Created (2). The fluent refinement of Notes does not move it.
    const order = et.properties.map((p) => p.propertyName);
    expect(order.indexOf("Title")).toBeLessThan(order.indexOf("Notes"));
    expect(order.indexOf("Notes")).toBeLessThan(order.indexOf("Created"));
    expect(et.findProperty("Created")!.readOnly).toBe(true);
    expect(et.findProperty("Flag")!.visible).toBe(false);
    expect(et.findProperty("Notes")!.displayName).toBe("Task notes");
  });

  it("a decorated subclass with its own field decorators still inherits the base's (SWC does not chain metadata objects)", () => {
    @Entity({ list: "Items" })
    class Item extends Mid {
      @Key override Id?: number = undefined;
      @TextField() Title?: string = undefined;
    }
    const mb = new ModelBuilder();
    mb.entity(Item);
    const et = mb.build().findEntityType(Item)!;
    expect(et.properties.map((p) => p.propertyName).sort()).toEqual([
      "Created",
      "Flag",
      "Id",
      "Notes",
      "Title",
    ]);
  });

  it("a subclass re-declaring an inherited field wins, and the member takes the subclass's own declaration position", () => {
    @Entity({ list: "Loud" })
    class Loud extends Base {
      @Key override Id?: number = undefined;
      @TextField() Label?: string = undefined;
      @NumberField({ readOnly: false, visible: true })
      override readonly Flag?: number = undefined;
    }
    const mb = new ModelBuilder();
    mb.entity(Loud);
    const et = mb.build().findEntityType(Loud)!;
    const p = et.findProperty("Flag")!;
    expect(p.readOnly).toBe(false);
    expect(p.visible).toBe(true);
    // Flag is Loud's own now: it emits where Loud declared it (after Label), not
    // where Base first did.
    const order = et.properties.map((x) => x.propertyName);
    expect(order.indexOf("Label")).toBeLessThan(order.indexOf("Flag"));
  });

  it("a navigation re-declared by name replaces the inherited one instead of colliding", () => {
    abstract class Owned {
      Id?: number = undefined;
      @ManyToOne(() => Person, { readOnly: true, foreignKey: "OwnerId" })
      readonly Owner?: Person = undefined;
      readonly OwnerId?: number = undefined;
    }
    class Deal extends Owned {
      Title?: string;
    }
    const mb = new ModelBuilder();
    mb.entity(Person, (b) => {
      b.toList("People");
      b.property((p) => p.Title).isText();
    });
    mb.entity(Boss, (b) => {
      b.toList("Bosses");
      b.property((p) => p.Title).isText();
      b.property((p) => p.Level).isNumber();
    });
    mb.entity(Deal, (b) => {
      b.toList("Deals");
      b.property((d) => d.Title).isText();
      b.hasOne(Boss, (d) => d.Owner)
        .withMany()
        .hasForeignKey((d) => d.OwnerId); // re-points Owner
    });
    const m = mb.build();
    const et = m.findEntityType(Deal)!;
    expect(et.navigations().filter((n) => n.name === "Owner")).toHaveLength(1);
    expect(et.findNavigation("Owner")!.target).toBe(m.findEntityType(Boss));
  });
});
