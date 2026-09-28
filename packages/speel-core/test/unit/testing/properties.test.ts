import { describe, it, expect } from "vitest";
import {
  textProperty,
  booleanProperty,
  dateTimeProperty,
  choiceProperty,
  lookupProperty,
  stubEntityType,
} from "../../../src/testing/properties.js";
import { FakeStorageProvider } from "../../../src/testing/FakeStorageProvider.js";

describe("test property factories", () => {
  it("name a column after the property, and a lookup after its FK column", () => {
    expect(textProperty("Title").columnName).toBe("Title");
    expect(textProperty("Title").config.kind).toBe("Text");
    expect(booleanProperty("IsPublic").config.kind).toBe("Boolean");
    expect(dateTimeProperty("StartDate").config.kind).toBe("DateTime");
    const labels = choiceProperty("Labels", {
      multi: true,
      options: ["A", "B"],
    });
    expect(labels.config).toMatchObject({
      kind: "Choice",
      multi: true,
      options: ["A", "B"],
      radioButtons: false,
    });
    expect("displayAs" in labels.config).toBe(false);
    const tags = stubEntityType("Tags", {
      kind: "list",
      list: { kind: "title", value: "Tags" },
    });
    const owner = lookupProperty(
      "Owner",
      stubEntityType("Principal", { kind: "provider", key: "principals" }),
    );
    expect(owner.columnName).toBe("OwnerId");
    expect(owner.config).toMatchObject({ kind: "Lookup", multi: false });
    expect(lookupProperty("Tags", tags, { multi: true }).config).toMatchObject({
      kind: "Lookup",
      multi: true,
    });
    expect(tags.source).toEqual({
      kind: "list",
      list: { kind: "title", value: "Tags" },
    });
    expect(tags.key.columnName).toBe("Id");
  });
  it("are not keys and are writable", () => {
    const p = textProperty("Title");
    expect(p.key).toBe(false);
    expect(p.readOnly).toBe(false);
  });
});

describe("FakeStorageProvider.seedRow", () => {
  it("stores a typed record under a fresh id and returns it", async () => {
    const fake = new FakeStorageProvider();
    const list = { kind: "title" as const, value: "Projects" };
    const when = new Date(Date.UTC(2027, 2, 15, 12));
    const id = fake.seedRow(list, {
      Title: "t",
      StartDate: when,
      IsPublic: true,
    });
    expect(id).toBe(1);
    expect(fake.seedRow(list, { Title: "u" })).toBe(2);
    const row = await fake.getItemByIdAsync(list, id, [
      "Title",
      "StartDate",
      "IsPublic",
    ]);
    expect(row).toEqual({ ID: 1, Title: "t", StartDate: when, IsPublic: true });
  });
});
