// src/formValues.ts
//
// Every string SharePoint's two write APIs want, in one place. The JSON API
// (`items.add`, `items.update`) does its own typing; the form-values API
// (`addValidateUpdateItemUsingPath` / `validateUpdateListItem`) takes stringified
// values in shapes that vary by field type. Core hands over typed fields and never
// learns either.
import type { IWriteField, IProviderSource, Property } from "@speel/core";
import { DataException } from "@speel/core";
import {
  principalSourceKey,
  servesPrincipalSource,
} from "./principalSources.js";

/** One row of the validate-update APIs' request. */
export interface IFormValue {
  FieldName: string;
  FieldValue: string;
}

/** Multi-value Lookup form: `id;#` pairs joined by `;#` — `[3, 7]` → `'3;#;#7;#'`, `[]` → `''`. */
export function encodeLookupCollectionFormValue(
  ids: readonly unknown[],
): string {
  return ids.map((id) => `${String(id)};#`).join(";#");
}

/** Multi-choice form: the values wrapped in `;#` — `['Red','Blue']` → `';#Red;#Blue;#'`, `[]` → `''`. */
export function encodeMultiChoiceFormValue(values: readonly unknown[]): string {
  if (values.length === 0) return "";
  return `;#${values.map((v) => String(v)).join(";#")};#`;
}

/**
 * Person form: a JSON array of `{ Key }` claims, the Key being the principal's User
 * Information List login — a claims string for a user, the plain title for a group.
 * Verified live: a person column accepts NOTHING else through this API, and reports
 * no error for what it rejects — it stores nothing and answers 200.
 */
export function encodeClaimsFormValue(loginNames: readonly string[]): string {
  return JSON.stringify(loginNames.map((Key) => ({ Key })));
}

/**
 * The form-values API parses dates per the site's regional settings and REJECTS ISO
 * 8601 ('T'/'Z'). It accepts the culture-invariant sortable form
 * 'YYYY-MM-DD HH:mm:ss' — no 'T', no fraction, no zone.
 */
export function encodeDateTimeFormValue(value: unknown): string {
  const d = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(d.getTime())
    ? String(value)
    : d.toISOString().slice(0, 19).replace("T", " ");
}

/** A Lookup whose target is provider-routed is a person column. */
export function isPersonField(f: IWriteField): boolean {
  const c = f.property.config;
  return c.kind === "Lookup" && c.target.source.kind === "provider";
}

/**
 * The JSON API takes the FK column; the form-values API takes the bare field.
 * ModelBuilder names every Lookup FK column `${field}Id` — multi-value ones
 * included — so stripping the suffix recovers the field name the form addresses.
 */
export function formFieldName(p: Property): string {
  return p.config.kind === "Lookup"
    ? p.columnName.replace(/Id$/, "")
    : p.columnName;
}

/** The provider source a person field's target routes to — `isPersonField` first. */
function personSource(f: IWriteField): IProviderSource {
  const c = f.property.config as Extract<
    Property["config"],
    { kind: "Lookup" }
  >;
  return c.target.source as IProviderSource;
}

/**
 * The write-side half of rule 1: a person column's target must name a key this
 * provider serves. Throws `principalSourceKey`'s error, naming the key, so an
 * insert with a mistyped target fails its own operation before it is sent, exactly
 * as a read of that key would throw — instead of resolving its ids through the
 * User Information List and succeeding.
 */
function assertServedTarget(f: IWriteField): void {
  principalSourceKey(personSource(f));
}

function isMulti(f: IWriteField): boolean {
  const c = f.property.config;
  return (c.kind === "Choice" || c.kind === "Lookup") && c.multi;
}

function lookupValues(f: IWriteField): unknown[] {
  // A non-array on a multi-value column carries no collection.
  return isMulti(f) ? (Array.isArray(f.value) ? [...f.value] : []) : [f.value];
}

/** A value of a person field that names a principal — null/undefined and non-numeric values name none. */
function principalIdOf(v: unknown): number | undefined {
  if (v === null || v === undefined) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

/**
 * The distinct principal ids every person field of `fields` names. A field whose
 * target key this provider does not serve names nothing to resolve: its operation
 * is refused before it is sent (`firstUnresolvedPrincipal` / `toFormValues`), so
 * a UIL read for its ids would be wasted — and throwing here would reject the whole
 * batch rather than that one operation.
 */
export function collectPrincipalIds(fields: readonly IWriteField[]): number[] {
  const out: number[] = [];
  for (const f of fields) {
    if (!isPersonField(f) || !servesPrincipalSource(personSource(f))) continue;
    for (const v of lookupValues(f)) {
      const n = principalIdOf(v);
      if (n !== undefined && !out.includes(n)) out.push(n);
    }
  }
  return out;
}

/**
 * A field kind neither write encoder knows. Exhaustive by construction — adding
 * a FieldConfig kind fails to compile in both switches until it gets a case —
 * and loud at runtime for a cast: an unsupported kind is refused, never written
 * as `String(value)`, exactly as the read side refuses it.
 */
function unsupportedKind(config: never, column: string): never {
  throw new DataException(
    `Column ${column}: unsupported field kind '${(config as { kind: string }).kind}'`,
  );
}

/**
 * JSON payload for `items.add` / `items.update`, keyed by the property's column (a
 * lookup's FK column): ISO for DateTime, an array for every multi-value column,
 * everything else as given. `null` passes through as JSON null — a clear on update.
 */
export function toJsonPayload(
  fields: readonly IWriteField[],
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of fields) {
    const { columnName, config } = f.property;
    out[columnName] =
      f.value === null ? null : jsonValue(f, config, columnName);
  }
  return out;
}

function jsonValue(
  f: IWriteField,
  config: Property["config"],
  column: string,
): unknown {
  switch (config.kind) {
    case "DateTime":
      return f.value instanceof Date ? f.value.toISOString() : String(f.value);
    case "Choice":
    case "Lookup":
      return isMulti(f) ? lookupValues(f) : f.value;
    case "Text":
    case "Json":
    case "Number":
    case "Currency":
    case "Boolean":
      return f.value;
    default:
      return unsupportedKind(config, column);
  }
}

/**
 * A person field names an id that `loginOf` could not answer, or answered with an
 * empty login. Both must be loud, on either write API: SharePoint checks neither.
 * The form-values API takes claims Keys and accepts an empty Key with a 200,
 * storing nothing; `items.add` takes ids and accepts one the site has never issued
 * with a 201, storing a dangling reference (verified live: `OwnerId` kept, the
 * expanded `Owner.Title` null). Either way the write would "succeed" and the
 * column would be wrong.
 */
export class UnresolvedPrincipalException extends Error {
  constructor(
    public readonly id: number,
    public readonly field: string,
  ) {
    super(
      `Field '${field}': principal ${id} could not be resolved in this site's User ` +
        `Information List (the id is not there, or it has no login). SharePoint does ` +
        `not check a person id on write — it would store a dangling reference, or ` +
        `nothing — so the write is refused here. The principal must be a member of ` +
        `this site collection (ensure it first) and the id must come from this site's ` +
        `User Information List.`,
    );
    this.name = "UnresolvedPrincipalException";
  }
}

/**
 * The first principal in `fields` that `loginOf` cannot answer, as the exception a
 * write of it would raise — or null when every principal resolves. The root-path
 * check: `items.add` needs no login, but it needs to know the id is real. Only the
 * ids `collectPrincipalIds` resolves are checked: a null/undefined or non-numeric
 * value names no principal (it is not "principal 0"), and goes to SharePoint as
 * given. A person field whose target key this provider does not serve THROWS,
 * naming the key — the same refusal as `toFormValues`, and as a read of it.
 */
export function firstUnresolvedPrincipal(
  fields: readonly IWriteField[],
  loginOf: (id: number) => string | undefined,
): UnresolvedPrincipalException | null {
  for (const f of fields) {
    if (!isPersonField(f)) continue;
    assertServedTarget(f);
    for (const v of lookupValues(f)) {
      const id = principalIdOf(v);
      if (id === undefined) continue;
      if (!loginOf(id)) {
        return new UnresolvedPrincipalException(id, formFieldName(f.property));
      }
    }
  }
  return null;
}

/**
 * Form values for the validate-update APIs. `loginOf` answers a principal id with
 * its login name; undefined or empty throws UnresolvedPrincipalException — an empty
 * Key is one more thing the API accepts with a 200 and stores nothing. A person
 * field whose target key this provider does not serve throws, naming the key.
 */
export function toFormValues(
  fields: readonly IWriteField[],
  loginOf: (id: number) => string | undefined,
): IFormValue[] {
  return fields.map((f) => ({
    FieldName: formFieldName(f.property),
    FieldValue: encodeFormValue(f, loginOf),
  }));
}

function encodeFormValue(
  f: IWriteField,
  loginOf: (id: number) => string | undefined,
): string {
  const { config } = f.property;
  switch (config.kind) {
    case "Boolean":
      return f.value ? "1" : "0";
    case "DateTime":
      return encodeDateTimeFormValue(f.value);
    case "Choice":
      return config.multi
        ? encodeMultiChoiceFormValue(lookupValues(f))
        : String(f.value);
    case "Lookup": {
      if (isPersonField(f)) {
        assertServedTarget(f);
        const logins: string[] = [];
        for (const v of lookupValues(f)) {
          // The same rule as `collectPrincipalIds`: a null/undefined or
          // non-numeric element names no principal — it is not "principal 0".
          const id = principalIdOf(v);
          if (id === undefined) continue;
          const login = loginOf(id);
          if (!login) {
            throw new UnresolvedPrincipalException(
              id,
              formFieldName(f.property),
            );
          }
          logins.push(login);
        }
        return encodeClaimsFormValue(logins);
      }
      return config.multi
        ? encodeLookupCollectionFormValue(lookupValues(f))
        : String(f.value);
    }
    case "Text":
    case "Json":
    case "Number":
    case "Currency":
      return String(f.value);
    default:
      return unsupportedKind(config, f.property.columnName);
  }
}
