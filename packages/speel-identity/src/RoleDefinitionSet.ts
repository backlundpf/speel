import type { IIdentityProvider } from "./IIdentityProvider.js";
import type { RoleDefinition } from "./permissionTypes.js";

function toRoleDefinition(rec: Record<string, unknown>): RoleDefinition {
  const rd: RoleDefinition = { Id: rec.Id as number };
  if (rec.Name !== undefined) rd.Name = rec.Name as string;
  if (rec.Description !== undefined) rd.Description = rec.Description as string;
  if (rec.RoleTypeKind !== undefined)
    rd.RoleTypeKind = rec.RoleTypeKind as number;
  return rd;
}

/**
 * Read-only access to web.roleDefinitions, for resolving the id addRoleAssignment needs.
 * Role definitions are web-scoped and effectively static, so the full set is fetched once
 * and cached; every lookup is served from memory. Call clearCache() to force a refetch.
 */
export class RoleDefinitionSet {
  #cache: RoleDefinition[] | undefined;

  constructor(private readonly provider: IIdentityProvider) {}

  private async all(): Promise<readonly RoleDefinition[]> {
    if (this.#cache === undefined) {
      this.#cache = (await this.provider.getRoleDefinitionsAsync()).map(
        toRoleDefinition,
      );
    }
    return this.#cache;
  }

  /** Drop the cached role definitions; the next call refetches from the provider. */
  clearCache(): void {
    this.#cache = undefined;
  }

  async getByNameAsync(name: string): Promise<RoleDefinition | null> {
    return (await this.all()).find((r) => r.Name === name) ?? null;
  }
  async getByTypeAsync(roleTypeKind: number): Promise<RoleDefinition | null> {
    return (
      (await this.all()).find((r) => r.RoleTypeKind === roleTypeKind) ?? null
    );
  }
  async getByIdAsync(id: number): Promise<RoleDefinition | null> {
    return (await this.all()).find((r) => r.Id === id) ?? null;
  }

  /** All role definitions on the web, keyed by Name. (Unnamed definitions are skipped.) */
  async getAllByNameAsync(): Promise<Map<string, RoleDefinition>> {
    const map = new Map<string, RoleDefinition>();
    for (const rd of await this.all()) {
      if (rd.Name !== undefined) map.set(rd.Name, rd);
    }
    return map;
  }

  /**
   * Fold a written definition into the catalogue and hand it back mapped.
   *
   * A cold cache stays cold: a write has nothing to look up, and warming here would turn
   * every create into a full catalogue fetch. An entry with the same Id is replaced.
   */
  absorb(rec: Record<string, unknown>): RoleDefinition {
    const mapped = toRoleDefinition(rec);
    if (this.#cache !== undefined) {
      const at = this.#cache.findIndex((r) => r.Id === mapped.Id);
      if (at === -1) this.#cache.push(mapped);
      else this.#cache[at] = mapped;
    }
    return mapped;
  }

  /** Drop one definition from the catalogue — what a delete leaves behind. */
  forget(id: number): void {
    if (this.#cache === undefined) return;
    this.#cache = this.#cache.filter((r) => r.Id !== id);
  }
}
