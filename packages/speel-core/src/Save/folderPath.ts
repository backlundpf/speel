// src/Save/folderPath.ts
import { InvalidOperationException } from "../errors.js";

/**
 * Normalize a caller-supplied list-relative folder path to `'a/b/c'` form
 * (no leading/trailing slash, no empty/`.` segments). Returns `''` when the
 * path is empty after cleanup. Throws on `..` (no path traversal).
 */
export function normalizeFolderPath(raw: string): string {
  const segments = raw
    .replace(/\\/g, "/")
    .split("/")
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && s !== ".");
  for (const s of segments) {
    if (s === "..") {
      throw new InvalidOperationException(
        `Invalid folder path '${raw}': '..' segments are not allowed.`,
      );
    }
  }
  return segments.join("/");
}

/**
 * Validate a caller-supplied leaf name for a rename — one path segment, not a
 * path. Returns the trimmed name. `operation` names the caller so the message
 * points at the method the caller actually invoked.
 *
 * Deliberately narrow: SharePoint owns the rest of the naming rules (reserved
 * characters, length, reserved names) and reports them far better than a
 * duplicated client-side table would.
 */
export function normalizeLeafName(raw: string, operation: string): string {
  const name = raw.trim();
  if (name === "") {
    throw new InvalidOperationException(
      `${operation}() requires a non-empty name.`,
    );
  }
  if (name.includes("/") || name.includes("\\")) {
    throw new InvalidOperationException(
      `${operation}() takes a name, not a path: '${raw}' contains a path separator.`,
    );
  }
  return name;
}
