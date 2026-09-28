import { describe, it, expect } from "vitest";
// Import through the barrel: these live in different modules (`@Entity` is in
// EntityTypeBuilder.ts, not decorators.ts) and the barrel is what consumers use.
import {
  ModelBuilder,
  Entity,
  JsonShape,
  TextField,
  DateTimeField,
  ManyToOne,
  ModelConfigurationException,
} from "../../../src/index.js";

@JsonShape()
class TaskDefinition {
  @TextField() Title?: string;
  @DateTimeField() DueDate?: Date;
}

describe("@JsonShape", () => {
  it("builds an embedded entity type carrying its fields", () => {
    const mb = new ModelBuilder();
    mb.shape(TaskDefinition);
    const model = mb.build();
    const et = model.findEntityType(TaskDefinition as never)!;

    expect(et.isEmbedded).toBe(true);
    expect(et.properties.map((p) => p.propertyName).sort()).toEqual([
      "DueDate",
      "Title",
    ]);
  });

  it("needs no Id and synthesizes none", () => {
    const mb = new ModelBuilder();
    mb.shape(TaskDefinition);
    const et = mb.build().findEntityType(TaskDefinition as never)!;
    expect(et.properties.some((p) => p.propertyName === "Id")).toBe(false);
  });

  it("rejects a navigation inside a shape, naming the property", () => {
    class Owner {}
    @JsonShape()
    class BadShape {
      @TextField() Title?: string;
      @ManyToOne(() => Owner) Owner?: Owner;
      OwnerId?: number;
    }
    const mb = new ModelBuilder();
    mb.shape(BadShape);
    expect(() => mb.build()).toThrow(ModelConfigurationException);
    expect(() => mb.build()).toThrow(/BadShape.*Owner/s);
  });

  it("rejects a shape whose constructor demands arguments", () => {
    @JsonShape()
    class NeedsArgs {
      constructor(_required: string) {
        // A bare `_required: string` parameter is not itself what fails —
        // JS doesn't enforce arity — so the constructor has to actually use
        // it for `new NeedsArgs()` to blow up the way a real "this needs an
        // argument" constructor would.
        void _required.length;
      }
      @TextField() Title?: string;
    }
    const mb = new ModelBuilder();
    mb.shape(NeedsArgs as never);
    // A load has to build one from nothing; a ctor that actually needs its
    // argument cannot be satisfied from a blob.
    expect(() => mb.build()).toThrow(
      /NeedsArgs cannot be constructed with no arguments/,
    );
  });

  // Arity (`ctor.length`) cannot answer "can a load build one of these from
  // nothing?" — it is wrong in both directions. These two pin them down.

  it("rejects a shape whose constructor's default-parameter evaluation throws", () => {
    @JsonShape()
    class ThrowsOnDefault {
      constructor(
        _x = (() => {
          throw new Error("boom");
        })(),
      ) {}
      @TextField() Title?: string;
    }
    const mb = new ModelBuilder();
    mb.shape(ThrowsOnDefault as never);
    // `ctor.length` is 0 here (a defaulted parameter doesn't count), so the old
    // arity check would have let this model build — and `new` would then throw
    // at load time instead of at model-build time.
    expect(() => mb.build()).toThrow(/boom/);
  });

  it("accepts a shape whose constructor takes an optional parameter", () => {
    @JsonShape()
    class OptionalArg {
      constructor(_x?: string) {}
      @TextField() Title?: string;
    }
    const mb = new ModelBuilder();
    mb.shape(OptionalArg as never);
    // `ctor.length` is 1 here (an optional parameter counts), so the old arity
    // check would have rejected this — even though `new OptionalArg()` works
    // fine, because JS never enforced the arity TypeScript declared.
    expect(() => mb.build()).not.toThrow();
  });
});

describe("mb.shape", () => {
  it("refuses a class that is already declared as an entity", () => {
    @Entity({ list: "Duals" })
    class Dual {
      Id?: number;
      @TextField() Title?: string;
    }
    const mb = new ModelBuilder();
    expect(() => mb.shape(Dual as never)).toThrow(ModelConfigurationException);
    expect(() => mb.shape(Dual as never)).toThrow(/Dual/);
  });

  it("leaves the shared registry builder alone when it refuses", () => {
    // The cost of the silent overwrite this guards: a decorated class's builder
    // is the one in the registry, so one `mb.shape(Dual)` used to rebuild Dual
    // as embedded in EVERY later model in the process.
    @Entity({ list: "Duals" })
    class Dual {
      Id?: number;
      @TextField() Title?: string;
    }
    expect(() => new ModelBuilder().shape(Dual as never)).toThrow();

    const later = new ModelBuilder();
    later.entity(Dual as never);
    expect(later.build().findEntityType(Dual as never)!.isEmbedded).toBe(false);
  });
});

describe("a navigation that targets a shape", () => {
  it("is refused at model build, naming the navigation and the shape", () => {
    @JsonShape()
    class Address {
      @TextField() Street?: string;
    }
    @Entity({ list: "People" })
    class Person {
      Id?: number;
      @ManyToOne(() => Address) Home?: Address;
    }
    const mb = new ModelBuilder();
    mb.entity(Person as never);
    // It used to build fine and fall over on the first load, in expand
    // resolution, with "Shape Address has no key".
    expect(() => mb.build()).toThrow(ModelConfigurationException);
    expect(() => mb.build()).toThrow(/Home.*Address.*shape/s);
  });
});

describe("DbContext.set", () => {
  it("refuses a shape — it has no rows to read", async () => {
    const { DbContext } = await import("../../../src/DbContext.js");
    class Ctx extends DbContext {
      shapes = this.set(TaskDefinition as never);
    }
    expect(() => new Ctx({ provider: {} as never })).toThrow(
      /TaskDefinition.*embedded|shape/s,
    );
  });
});
