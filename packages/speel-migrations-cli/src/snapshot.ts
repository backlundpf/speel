import {
  declaredOptions,
  type Model,
  type EntityType,
  type Property,
  type FieldConfig,
  type INavigation,
} from "@speel/core";
import type { FieldSpec, ListSpec } from "@speel/migrations";

export interface SnapshotEntity {
  list: ListSpec;
  fields: FieldSpec[];
}
export interface SnapshotDoc {
  version: 1;
  entities: SnapshotEntity[];
}

/** Project a core Model into a serializable provisioning snapshot (stable ordering). */
export function projectModel(model: Model): SnapshotDoc {
  const entities: SnapshotEntity[] = [];
  for (const et of model.entityTypes) {
    if (et.source.kind !== "list") continue; // a provider source is not provisioned
    entities.push({ list: listSpecFor(et), fields: fieldsFor(et) });
  }
  entities.sort((a, b) => a.list.title.localeCompare(b.list.title));
  return { version: 1, entities };
}

function listSpecFor(et: EntityType): ListSpec {
  const handle = et.list;
  if (handle.kind !== "title") {
    throw new Error(
      `Entity ${et.ctor.name}: list must be addressed by title for provisioning (got id).`,
    );
  }
  const p = et.listProvisioning;
  return {
    title: handle.value,
    template: p?.template ?? "genericList",
    ...(p?.url !== undefined ? { url: p.url } : {}),
    ...(p?.description !== undefined ? { description: p.description } : {}),
    ...(p?.onQuickLaunch !== undefined
      ? { onQuickLaunch: p.onQuickLaunch }
      : {}),
    ...(p?.readSecurity !== undefined ? { readSecurity: p.readSecurity } : {}),
    ...(p?.writeSecurity !== undefined
      ? { writeSecurity: p.writeSecurity }
      : {}),
  };
}

/**
 * SharePoint built-ins SpeelEntity declares WRITABLE — so `readOnly` cannot be
 * what keeps them out of the snapshot — that every list and library already has.
 * FileLeafRef is writable because writing it renames the row's file or folder.
 */
const WRITABLE_BUILT_INS: ReadonlySet<string> = new Set(["FileLeafRef"]);

/**
 * Which columns are provisionable: everything except the key and the server-managed
 * members. `readOnly` — not a list of names — is the test. It covers SpeelEntity's
 * system columns (Created/Modified/FSObjType/File*) and the Author/Editor navs, which
 * carry it, and it lets a model read any other SharePoint built-in (say
 * `File_x0020_Size`) by declaring it read-only without provisioning over it.
 * The one exception is {@link WRITABLE_BUILT_INS}: system columns a caller may
 * write (FileLeafRef renames) yet every list already has.
 * The key needs no name check of its own: both key paths in EntityTypeBuilder build the
 * `ID` column, and a second property claiming that column fails the duplicate-column check.
 */
function fieldsFor(et: EntityType): FieldSpec[] {
  const fields: FieldSpec[] = [];

  // A self-FK navigation owns a creatable Lookup/User field; its `<X>Id` column is
  // SharePoint's auto-generated companion (NOT separately creatable). So provision
  // the navigation field, and exclude its FK-id column from the scalar projection.
  const selfFkNavs = et
    .navigations()
    .filter(
      (n: INavigation) =>
        n.storage === "self-fk-scalar" || n.storage === "self-fk-array",
    );
  const fkColumns = new Set(
    selfFkNavs.map((n: INavigation) => n.foreignKey.columnName),
  );

  for (const p of et.properties) {
    if (
      p.key ||
      p.readOnly ||
      fkColumns.has(p.columnName) ||
      WRITABLE_BUILT_INS.has(p.columnName)
    )
      continue;
    fields.push(fieldConfigToSpec(p));
  }
  for (const nav of selfFkNavs) {
    if (nav.readOnly) continue; // server-managed nav (Author/Editor) — never provisioned
    fields.push(navToSpec(nav));
  }

  fields.sort((a, b) => a.internalName.localeCompare(b.internalName));
  return fields;
}

/** Project a self-FK navigation to its creatable Lookup/User field (named without the `Id`). */
function navToSpec(nav: INavigation): FieldSpec {
  const c = nav.config;
  if (c.kind !== "Lookup") {
    throw new Error(
      `Navigation '${nav.name}': expected a Lookup config (got '${c.kind}').`,
    );
  }
  // Provision the navigation's lookup column (its $expand target). SharePoint generates
  // the `<columnName>Id` companion that the model's FK column keys off.
  const internalName = nav.columnName;
  const base = {
    internalName,
    ...(nav.displayName !== undefined ? { displayName: nav.displayName } : {}),
    ...(nav.required === true ? { required: true } : {}),
    // isIndexed() on a navigation is recorded on the FK property the builder
    // synthesizes, but the provisioned column is the lookup itself — so read the
    // flag from there and write it here, where SharePoint can act on it.
    ...(nav.foreignKey.indexed ? { indexed: true } : {}),
  };
  // A person column is a lookup whose target is provider-routed; SharePoint's
  // field type for it is User (the migrations FieldSpec keeps that vocabulary).
  return c.target.source.kind === "provider"
    ? { ...base, kind: "User", showField: c.displayField, multi: c.multi }
    : {
        ...base,
        kind: "Lookup",
        list: navTargetTitle(nav, c),
        showField: c.displayField,
        multi: c.multi,
      };
}

function navTargetTitle(
  nav: INavigation,
  c: Extract<FieldConfig, { kind: "Lookup" }>,
): string {
  const src = c.target.source;
  if (src.kind !== "list" || src.list.kind !== "title") {
    throw new Error(
      `Navigation '${nav.name}': lookup target must be a title-addressed list.`,
    );
  }
  return src.list.value;
}

function fieldConfigToSpec(p: Property): FieldSpec {
  const base = {
    internalName: p.columnName,
    ...(p.displayName !== undefined ? { displayName: p.displayName } : {}),
    ...(p.description !== undefined ? { description: p.description } : {}),
    ...(p.required === true ? { required: true } : {}), // conditional (fn) required → not provisioned-required
    ...(p.indexed ? { indexed: true } : {}),
    ...(p.defaultValue !== undefined ? { default: p.defaultValue } : {}),
  };
  const c: FieldConfig = p.config;
  switch (c.kind) {
    case "Text":
      return {
        ...base,
        kind: "Text",
        multiline: c.multiline,
        ...(c.maxLength !== undefined ? { maxLength: c.maxLength } : {}),
        ...(c.minLength !== undefined ? { minLength: c.minLength } : {}),
        ...(c.richText !== undefined ? { richText: c.richText } : {}),
        ...(c.appendOnly !== undefined ? { appendOnly: c.appendOnly } : {}),
        ...(c.numberOfLines !== undefined
          ? { numberOfLines: c.numberOfLines }
          : {}),
      };
    case "Number":
      return {
        ...base,
        kind: "Number",
        ...(c.min !== undefined ? { min: c.min } : {}),
        ...(c.max !== undefined ? { max: c.max } : {}),
        ...(c.decimalPlaces !== undefined
          ? { decimalPlaces: c.decimalPlaces }
          : {}),
        ...(c.showAsPercentage !== undefined
          ? { showAsPercentage: c.showAsPercentage }
          : {}),
      };
    case "Currency":
      return {
        ...base,
        kind: "Currency",
        decimalPlaces: c.decimalPlaces,
        ...(c.currencyCode !== undefined
          ? { currencyCode: c.currencyCode }
          : {}),
        ...(c.min !== undefined ? { min: c.min } : {}),
        ...(c.max !== undefined ? { max: c.max } : {}),
      };
    case "Boolean":
      return { ...base, kind: "Boolean" };
    case "DateTime":
      return {
        ...base,
        kind: "DateTime",
        displayFormat: c.displayFormat,
        friendlyFormat: c.friendlyFormat,
        ...(c.min !== undefined ? { min: c.min } : {}),
        ...(c.max !== undefined ? { max: c.max } : {}),
      };
    case "Choice": {
      // A list that is not literal is not known at build, so the column must accept any
      // value: SharePoint refuses one outside `Choices` unless FillInChoice is on.
      const declared = declaredOptions(c);
      const choices: string[] = declared
        ? declared.map((o: unknown) =>
            String(c.optionsValue ? c.optionsValue(o) : o),
          )
        : [];
      return {
        ...base,
        kind: "Choice",
        multi: c.multi,
        choices,
        fillIn: declared ? c.fillIn : true,
        displayAs: c.radioButtons ? "RadioButtons" : "Dropdown",
      };
    }
    case "Lookup":
      return c.target.source.kind === "provider"
        ? { ...base, kind: "User", showField: c.displayField, multi: c.multi }
        : {
            ...base,
            kind: "Lookup",
            list: targetTitle(p, c),
            showField: c.displayField,
            multi: c.multi,
          };
    case "Json":
      // On disk it is a Note column; the JSON inside it is core's business, not
      // the list schema's.
      return { ...base, kind: "Text", multiline: true };
  }
}

function targetTitle(
  p: Property,
  c: Extract<FieldConfig, { kind: "Lookup" }>,
): string {
  const src = c.target.source;
  if (src.kind !== "list" || src.list.kind !== "title") {
    throw new Error(
      `Lookup column '${p.columnName}': target must be a title-addressed list.`,
    );
  }
  return src.list.value;
}
