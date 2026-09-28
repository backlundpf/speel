import { describe, it, expect } from "vitest";
import {
  DbContext,
  ModelBuilder,
  Entity,
  Key,
  SpeelEntity,
  TextField,
} from "../../../src/index.js";

@Entity({ list: "Own Items", readSecurity: "own", writeSecurity: "own" })
class OwnedThing extends SpeelEntity {
  @Key public override Id?: number = undefined;
  @TextField() public Title: string | null = null;
}

@Entity({ list: "Open Items" })
class OpenThing extends SpeelEntity {
  @Key public override Id?: number = undefined;
  @TextField() public Title: string | null = null;
}

class Ctx extends DbContext {
  protected override onModelCreating(mb: ModelBuilder): void {
    mb.entity(OwnedThing, () => undefined);
    mb.entity(OpenThing, () => undefined);
  }
}

describe("item-level list security", () => {
  it("carries read/write security into the entity source provisioning", () => {
    const model = new Ctx({ provider: {} as never }).model;
    const et = model.findEntityType(OwnedThing)!;
    const source = et.source as {
      kind: "list";
      provisioning?: { readSecurity?: string; writeSecurity?: string };
    };
    expect(source.provisioning?.readSecurity).toBe("own");
    expect(source.provisioning?.writeSecurity).toBe("own");
  });

  it("leaves it undefined when not declared, so existing lists are unaffected", () => {
    const model = new Ctx({ provider: {} as never }).model;
    const et = model.findEntityType(OpenThing)!;
    const source = et.source as {
      kind: "list";
      provisioning?: { readSecurity?: string };
    };
    expect(source.provisioning?.readSecurity).toBeUndefined();
  });
});
