import type { PermissionKind } from "../src/index.js";

// The vocabulary IS a type — it is erased at runtime, so only the compiler enforces it.

const publish: PermissionKind = "addListItems";
const admin: PermissionKind = "managePermissions";
void publish;
void admin;

// @ts-expect-error — masks are not permissions; they would test as nonsense.
const mask: PermissionKind = "fullMask";
void mask;

// @ts-expect-error — the platform's names, not invented ones.
const friendly: PermissionKind = "write";
void friendly;

// @ts-expect-error — SharePoint's casing is PascalCase; ours is camel, and only ours is valid.
const pascal: PermissionKind = "AddListItems";
void pascal;
