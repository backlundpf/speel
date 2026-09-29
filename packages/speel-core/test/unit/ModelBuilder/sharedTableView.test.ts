import { describe, it, expect } from "vitest";
import {
  DbContext,
  ModelBuilder,
  SharedTableView,
  type EntitySource,
} from "../../../src/index.js";

class Ctx extends DbContext {
  protected override onModelCreating(mb: ModelBuilder): void {
    mb.entity(SharedTableView, () => undefined);
  }
}

const entityType = () =>
  new Ctx({ provider: {} as never }).model.findEntityType(SharedTableView)!;

describe("SharedTableView", () => {
  it("is readable by everyone — the write restriction is the tenant's list permissions", () => {
    const source = entityType().source as Extract<
      EntitySource,
      { kind: "list" }
    >;
    expect(source.list.value).toBe("Speel Shared Views");
    // Deliberately NOT 'own': every user must read every shared view. Restricting writes is a
    // list-permissions change no provisioning option can express.
    expect(source.provisioning?.readSecurity).toBeUndefined();
    expect(source.provisioning?.writeSecurity).toBeUndefined();
  });

  it("names the view in Title and carries the table id and descriptor", () => {
    const et = entityType();
    expect(et.findProperty("Title")).toBeDefined();
    expect(et.findProperty("TableId")).toBeDefined();
    expect(et.findProperty("Descriptor")).toBeDefined();
  });

  it("stores the descriptor as a note, since JSON outgrows a single-line field", () => {
    const descriptor = entityType().findProperty("Descriptor")!;
    expect((descriptor.config as { multiline?: boolean }).multiline).toBe(true);
  });
});
