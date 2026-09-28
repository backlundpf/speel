import type { RoleUpdate } from "../src/RoleManager.js";

// A replacement set on its own.
const replace: RoleUpdate = { permissions: ["viewListItems"] };
// A delta on its own.
const delta: RoleUpdate = { add: ["viewListItems"], remove: ["manageWeb"] };
// Display fields with either.
const both: RoleUpdate = { name: "Reviewer", add: ["viewListItems"] };
// Display fields alone.
const neither: RoleUpdate = { description: "just words" };

// @ts-expect-error — a replacement and a delta in one call has no meaning.
const invalid: RoleUpdate = {
  permissions: ["viewListItems"],
  add: ["manageWeb"],
};

export type { RoleUpdate };
export { replace, delta, both, neither, invalid };
