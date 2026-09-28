// src/providers/capabilities.ts
//
// The optional halves of the provider contract, narrowed structurally. A provider
// object implements what it supports; core asks these before touching a folder,
// a file or the change feed, and refuses with an exception that names both the
// operation and the capability when the store has none.
import { InvalidOperationException } from "../errors.js";
import type {
  IChangeFeed,
  IFileSystem,
  IStorageProvider,
} from "./ISharePointProvider.js";

// Each member list is derived from a record the compiler checks against the
// interface, so adding a member to IFileSystem or IChangeFeed without listing
// it here is a type error — a new member can never slip past the guard.
const FILE_SYSTEM_MEMBERS = Object.keys({
  ensureFoldersAsync: true,
  uploadFileAsync: true,
  renameFileAsync: true,
  copyFileAsync: true,
  renameFolderAsync: true,
  deleteFolderAsync: true,
  checkinFileAsync: true,
} satisfies Record<keyof IFileSystem, true>) as readonly (keyof IFileSystem)[];

const CHANGE_FEED_MEMBERS = Object.keys({
  getListItemChangesSinceToken: true,
} satisfies Record<keyof IChangeFeed, true>) as readonly (keyof IChangeFeed)[];

function hasEvery(p: IStorageProvider, members: readonly string[]): boolean {
  const o = p as unknown as Record<string, unknown>;
  return members.every((m) => typeof o[m] === "function");
}

/** Structural: a provider has the file-system capability when every one of its members is a function. */
export function hasFileSystem(
  p: IStorageProvider,
): p is IStorageProvider & IFileSystem {
  return hasEvery(p, FILE_SYSTEM_MEMBERS);
}

export function hasChangeFeed(
  p: IStorageProvider,
): p is IStorageProvider & IChangeFeed {
  return hasEvery(p, CHANGE_FEED_MEMBERS);
}

/** The provider, narrowed — or an exception that names what the caller wanted and what the store lacks. */
export function requireFileSystem(
  p: IStorageProvider,
  operation: string,
): IStorageProvider & IFileSystem {
  if (hasFileSystem(p)) return p;
  throw new InvalidOperationException(
    `${operation} requires a provider with the IFileSystem capability (folders and files); the configured provider has none.`,
  );
}

export function requireChangeFeed(
  p: IStorageProvider,
  operation: string,
): IStorageProvider & IChangeFeed {
  if (hasChangeFeed(p)) return p;
  throw new InvalidOperationException(
    `${operation} requires a provider with the IChangeFeed capability (incremental sync); the configured provider has none.`,
  );
}
