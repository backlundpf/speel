// Property factories for tests and harnesses that need the model's own field
// description without building a whole model: the provider contract now carries
// a Property on every write and on every typed read.
import { Property } from "../Metadata/Property.js";
import { EntityType, type EntitySource } from "../Metadata/EntityType.js";
import type { FieldConfig } from "../Metadata/FieldConfig.js";
import type { EntityCtor } from "../types.js";

function make(name: string, config: FieldConfig, columnName = name): Property {
  return new Property({
    propertyName: name,
    columnName,
    displayName: name,
    config,
    required: false,
    readOnly: false,
    key: false,
  });
}

export const textProperty = (
  name: string,
  opts: { multiline?: boolean } = {},
): Property => make(name, { kind: "Text", multiline: opts.multiline ?? false });
export const numberProperty = (name: string): Property =>
  make(name, { kind: "Number" });
export const booleanProperty = (name: string): Property =>
  make(name, { kind: "Boolean" });
export const dateTimeProperty = (name: string): Property =>
  make(name, {
    kind: "DateTime",
    displayFormat: "DateTime",
    friendlyFormat: "Disabled",
  });
export const choiceProperty = (
  name: string,
  opts: {
    multi?: boolean;
    options?: readonly unknown[];
    radioButtons?: boolean;
  } = {},
): Property =>
  make(name, {
    kind: "Choice",
    multi: opts.multi ?? false,
    options: opts.options ?? [],
    fillIn: false,
    radioButtons: opts.radioButtons ?? false,
  });
/** A lookup FK property: column `${name}Id` (ModelBuilder's FK convention), target as given. */
export const lookupProperty = (
  name: string,
  target: EntityType,
  opts: { multi?: boolean } = {},
): Property =>
  make(
    name,
    {
      kind: "Lookup",
      target,
      displayField: "Title",
      multi: opts.multi ?? false,
    },
    `${name}Id`,
  );

/** An entity type with only an Id key — enough to be a lookup target. */
export function stubEntityType(name: string, source: EntitySource): EntityType {
  // A named class, so an error that prints the ctor names the stub as intended.
  const ctor = { [name]: class {} }[name] as unknown as EntityCtor;
  return new EntityType({
    ctor,
    source,
    properties: [
      new Property({
        propertyName: "Id",
        columnName: "Id",
        displayName: "Id",
        config: { kind: "Number" },
        required: false,
        readOnly: true,
        key: true,
      }),
    ],
  });
}
