// test/unit/Save/SaveExecutor.inflight.test.ts
//
// Edits made while a save's write is in flight must stay pending for the next
// save, whichever property they touch.
import { describe, it, expect } from "vitest";
import { SaveExecutor } from "../../../src/Save/SaveExecutor.js";
import { ChangeTracker } from "../../../src/ChangeTracker/ChangeTracker.js";
import { EntityState } from "../../../src/ChangeTracker/EntityEntry.js";
import { Snapshot } from "../../../src/ChangeTracker/Snapshot.js";
import { Model } from "../../../src/Metadata/Model.js";
import { EntityType } from "../../../src/Metadata/EntityType.js";
import { Property } from "../../../src/Metadata/Property.js";
import { FakeStorageProvider } from "../fakes/FakeStorageProvider.js";

class Note {
  Id?: number;
  Title?: string | null;
  Body?: string | null;
}

function text(name: string) {
  return new Property({
    propertyName: name,
    columnName: name,
    displayName: name,
    config: { kind: "Text", multiline: false, maxLength: 255 },
    required: false,
    readOnly: false,
    key: false,
  });
}

function setup() {
  const id = new Property({
    propertyName: "Id",
    columnName: "ID",
    displayName: "ID",
    config: { kind: "Number" },
    required: true,
    readOnly: true,
    key: true,
  });
  const et = new EntityType<Note>({
    ctor: Note,
    list: { kind: "title", value: "Notes" },
    properties: [id, text("Title"), text("Body")],
  });
  const model = new Model([et]);
  const provider = new FakeStorageProvider();
  const tracker = new ChangeTracker(model);
  return { model, provider, tracker, et };
}

/** Runs `during` once, while the save's first batch is in flight. */
function interleave(provider: FakeStorageProvider, during: () => void): void {
  const original = provider.executeBatchAsync.bind(provider);
  let ran = false;
  provider.executeBatchAsync = async (...args) => {
    if (!ran) {
      ran = true;
      during();
    }
    return original(...args);
  };
}

async function bodyOnStore(
  provider: FakeStorageProvider,
  et: EntityType<Note>,
  id: number,
): Promise<unknown> {
  const row = await provider.getItemByIdAsync(et.list, id, ["ID", "Body"]);
  return (row as Record<string, unknown> | null)?.Body;
}

// The save's second pass (the inverse-collection pass) re-detects changes, so an
// edit made during the first pass's write is sent by the same save. What must
// never happen is the edit being adopted as the original and dropped.
describe("SaveExecutor: edits made while the write is in flight", () => {
  it("keeps an edit to a property the update did not carry", async () => {
    const { model, provider, tracker, et } = setup();
    const id = provider.seedRow(et.list, { Title: "a", Body: "x" });
    const n = Object.assign(new Note(), { Id: id, Title: "a", Body: "x" });
    tracker.track(n, EntityState.Unchanged, Snapshot.take(n, et));
    n.Title = "b"; // the update carries Title only
    interleave(provider, () => {
      n.Body = "y"; // edited while that update is in flight
    });

    await new SaveExecutor(model, provider, tracker).saveChangesAsync();

    const entry = tracker.entries(Note)[0]!;
    expect(await bodyOnStore(provider, et, n.Id!)).toBe("y");
    tracker.detectChanges();
    expect(entry.state).toBe(EntityState.Unchanged);
  });

  it("keeps an edit to a property an insert left unset", async () => {
    const { model, provider, tracker, et } = setup();
    const n = Object.assign(new Note(), { Title: "a" });
    tracker.track(n, EntityState.Added);
    interleave(provider, () => {
      n.Body = "y";
    });

    await new SaveExecutor(model, provider, tracker).saveChangesAsync();

    const entry = tracker.entries(Note)[0]!;
    expect(await bodyOnStore(provider, et, n.Id!)).toBe("y");
    tracker.detectChanges();
    expect(entry.state).toBe(EntityState.Unchanged);
  });
});
