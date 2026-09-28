/** Build a sortable migration id `YYYYMMDDTHHmm_<SanitizedName>` (UTC). */
export function nextMigrationId(name: string, now: Date = new Date()): string {
  const clean = name.replace(/[^A-Za-z0-9]/g, "");
  if (clean.length === 0)
    throw new Error(
      `Migration name must contain alphanumeric characters (got '${name}').`,
    );
  const p = (n: number, w = 2) => String(n).padStart(w, "0");
  const stamp = `${now.getUTCFullYear()}${p(now.getUTCMonth() + 1)}${p(now.getUTCDate())}T${p(now.getUTCHours())}${p(now.getUTCMinutes())}`;
  return `${stamp}_${clean}`;
}

/**
 * Render the generated migrations index (ordered import + array). Specifiers carry
 * `.js` so the index loads under Node ESM as well as bundlers; TypeScript maps
 * `./X.js` to `X.ts`.
 */
export function renderIndex(ids: string[]): string {
  const imports = ids
    .map((id, i) => `import m${i} from './${id}.js';`)
    .join("\n");
  const arr = ids.map((_id, i) => `m${i}`).join(", ");
  return `${imports}${imports ? "\n\n" : ""}export const migrations = [${arr}];\n`;
}
