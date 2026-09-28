import { describe, it, expectTypeOf } from "vitest";
import {
  Entity,
  Key,
  SpeelDocument,
  SpeelEntity,
  TextField,
} from "../../../src/index.js";

// These declarations are never executed — `npm run test:types` (tsc -p tsconfig.test.json)
// is the assertion. A stage-3 class decorator must return `void | typeof Class`; `@Entity`
// therefore has to hand back the very constructor it received, static side included.
// `SpeelDocument` carries a static brand, and an app may declare statics of its own.

describe("@Entity preserves the class's static side", () => {
  it("accepts a SpeelDocument subclass (inherits the static document brand)", () => {
    @Entity({ list: "Docs" })
    class Doc extends SpeelDocument {
      @Key override Id?: number = undefined;
      @TextField() Title?: string = undefined;
    }
    expectTypeOf<InstanceType<typeof Doc>>().toMatchTypeOf<SpeelDocument>();
  });

  it("accepts an entity that declares its own statics", () => {
    @Entity({ list: "Widgets" })
    class Widget extends SpeelEntity {
      static readonly kind = "widget";
      @Key override Id?: number = undefined;
      @TextField() Title?: string = undefined;
    }
    expectTypeOf(Widget.kind).toBeString();
  });
});
