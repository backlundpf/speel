// test/SharePointProvider.nestedExpand.test.ts
import { describe, it, expect } from "vitest";
import { SharePointProvider } from "../src/SharePointProvider.js";
import type { IExpandClause } from "@speel/core";

// Records the $select and $expand args the provider passes to PnPjs for a paged read.
function recordingSp(captured: { selects?: string[]; expands?: string[] }) {
  const items = {
    select: (...s: string[]) => {
      captured.selects = s;
      return {
        expand: (...e: string[]) => {
          captured.expands = e;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const chain: any = {
            filter: (_s: string) => chain,
            top: (_n: number) => ({
              [Symbol.asyncIterator]() {
                let done = false;
                return {
                  async next() {
                    if (done) return { done: true, value: undefined };
                    done = true;
                    return { done: false, value: [] };
                  },
                };
              },
            }),
          };
          return chain;
        },
      };
    },
  };
  return {
    web: {
      lists: { getByTitle: () => ({ items }), getById: () => ({ items }) },
    },
  };
}

describe("SharePointProvider nested expand assembly", () => {
  it("unions navColumn + expandPaths into $expand and selectPaths into $select", async () => {
    const captured: { selects?: string[]; expands?: string[] } = {};
    const provider = new SharePointProvider(recordingSp(captured) as never);
    const clause: IExpandClause = {
      navColumn: "RoleAssignments",
      selectFields: [],
      expandPaths: [
        "RoleAssignments/Member",
        "RoleAssignments/RoleDefinitionBindings",
      ],
      selectPaths: [
        "RoleAssignments/Member",
        "RoleAssignments/RoleDefinitionBindings",
      ],
    };
    await provider.getItemsPagedAsync(
      { kind: "title", value: "Projects" },
      ["Id", "Title"],
      50,
      undefined,
      { expand: [clause] },
    );

    expect(captured.expands).toEqual([
      "RoleAssignments",
      "RoleAssignments/Member",
      "RoleAssignments/RoleDefinitionBindings",
    ]);
    // base selects (Id, Title) then the nested select paths
    expect(captured.selects).toEqual([
      "Id",
      "Title",
      "RoleAssignments/Member",
      "RoleAssignments/RoleDefinitionBindings",
    ]);
  });
});
