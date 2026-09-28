// src/errors.ts
import type { FilterNode } from "./Query/FilterNode.js";

export class ModelConfigurationException extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ModelConfigurationException";
  }
}

export class DataException extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DataException";
  }
}

export class InvalidOperationException extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidOperationException";
  }
}

export class DbUpdateException extends Error {
  public readonly entries: ReadonlyArray<unknown>;
  public readonly innerErrors: ReadonlyArray<unknown>;

  constructor(
    message: string,
    entries: ReadonlyArray<unknown>,
    innerErrors: ReadonlyArray<unknown>,
  ) {
    super(message);
    this.name = "DbUpdateException";
    this.entries = entries;
    this.innerErrors = innerErrors;
  }
}

export class DbUpdateConcurrencyException extends DbUpdateException {
  constructor(
    message: string,
    entries: ReadonlyArray<unknown>,
    innerErrors: ReadonlyArray<unknown>,
  ) {
    super(message, entries, innerErrors);
    this.name = "DbUpdateConcurrencyException";
  }
}

/** A save was aborted via ISaveChangesOptions.signal. Completed work was reconciled; remaining entries stay dirty. */
export class SaveAbortedException extends Error {
  constructor(message = "SaveChangesAsync was aborted.") {
    super(message);
    this.name = "SaveAbortedException";
  }
}

export class QueryTranslationException extends Error {
  public readonly node: FilterNode;
  constructor(message: string, node: FilterNode) {
    super(message);
    this.name = "QueryTranslationException";
    this.node = node;
  }
}

export class NavigationConfigurationException extends ModelConfigurationException {
  constructor(message: string) {
    super(message);
    this.name = "NavigationConfigurationException";
  }
}
