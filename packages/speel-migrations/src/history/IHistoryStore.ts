import type { SchemaSnapshot } from "../schema/SchemaSnapshot.js";

export interface IHistoryStore {
  /**
   * Ensure the history list exists, reading existence from `snapshot` rather
   * than probing. Anything created is folded back into `snapshot` in place.
   */
  bootstrap(snapshot: SchemaSnapshot): Promise<void>;
  /** Applied migration ids (unordered). */
  applied(): Promise<string[]>;
  /** Record a migration as applied. */
  record(id: string): Promise<void>;
  /** Remove a migration's applied record. */
  unrecord(id: string): Promise<void>;
}

/** In-memory store for Migrator tests. */
export class FakeHistoryStore implements IHistoryStore {
  private readonly ids = new Set<string>();
  constructor(applied: string[] = []) {
    for (const id of applied) this.ids.add(id);
  }
  async bootstrap(_snapshot: SchemaSnapshot): Promise<void> {}
  async applied(): Promise<string[]> {
    return [...this.ids];
  }
  async record(id: string): Promise<void> {
    this.ids.add(id);
  }
  async unrecord(id: string): Promise<void> {
    this.ids.delete(id);
  }
}
