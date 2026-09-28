import { describe, it, expect } from "vitest";
import { Property } from "../../../src/Metadata/Property.js";
import type { EntityType } from "../../../src/Metadata/EntityType.js";
import type { FieldConfig } from "../../../src/Metadata/FieldConfig.js";

describe("Property metadata", () => {
  it("captures core fields", () => {
    const p = new Property({
      propertyName: "Title",
      columnName: "Title",
      displayName: "Title",
      config: { kind: "Text", maxLength: 255 },
      required: true,
      readOnly: false,
      key: false,
    });
    expect(p.propertyName).toBe("Title");
    expect(p.config.kind).toBe("Text");
    expect(p.required).toBe(true);
    expect(p.config).toEqual({ kind: "Text", maxLength: 255 });
  });

  it("keeps config carried through (Text maxLength)", () => {
    const config: FieldConfig = { kind: "Text", maxLength: 50 };
    const p = new Property({
      propertyName: "X",
      columnName: "X",
      displayName: "X",
      config,
      required: false,
      readOnly: false,
      key: false,
    });
    expect(p.config).toBe(config);
    expect((p.config as Extract<FieldConfig, { kind: "Text" }>).maxLength).toBe(
      50,
    );
  });

  it("accepts Lookup config with target resolved later", () => {
    const p = new Property({
      propertyName: "AuthorId",
      columnName: "AuthorId",
      displayName: "AuthorId",
      config: {
        kind: "Lookup",
        target: undefined as unknown as EntityType,
        displayField: "Title",
        multi: false,
      },
      required: false,
      readOnly: false,
      key: false,
    });
    const cfg = p.config as Extract<FieldConfig, { kind: "Lookup" }>;
    expect(p.config.kind).toBe("Lookup");
    expect(cfg.multi).toBe(false);
    expect(cfg.displayField).toBe("Title");
    expect(cfg.target).toBeUndefined(); // resolved later by ModelBuilder
  });

  it("accepts a multi-value Lookup config", () => {
    const p = new Property({
      propertyName: "EditorsId",
      columnName: "EditorsId",
      displayName: "EditorsId",
      config: {
        kind: "Lookup",
        target: undefined as unknown as EntityType,
        displayField: "Title",
        multi: true,
      },
      required: false,
      readOnly: false,
      key: false,
    });
    const cfg = p.config as Extract<FieldConfig, { kind: "Lookup" }>;
    expect(p.config.kind).toBe("Lookup");
    expect(cfg.multi).toBe(true);
  });

  it("allows config.target to be mutated after construction (not frozen)", () => {
    const p = new Property({
      propertyName: "AuthorId",
      columnName: "AuthorId",
      displayName: "AuthorId",
      config: {
        kind: "Lookup",
        target: undefined as unknown as EntityType,
        displayField: "Title",
        multi: false,
      },
      required: false,
      readOnly: false,
      key: false,
    });
    const target = {} as EntityType;
    (p.config as Extract<FieldConfig, { kind: "Lookup" }>).target = target;
    expect((p.config as Extract<FieldConfig, { kind: "Lookup" }>).target).toBe(
      target,
    );
  });
});
