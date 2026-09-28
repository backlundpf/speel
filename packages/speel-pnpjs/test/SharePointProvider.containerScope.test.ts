// test/SharePointProvider.containerScope.test.ts
import { describe, it, expect } from "vitest";
import { SharePointProvider } from "../src/SharePointProvider.js";
import type { FilterNode } from "@speel/core";

const list = { kind: "title" as const, value: "Docs" };

function fakeSp(opts?: { withRoot?: boolean }) {
  const calls = {
    filter: undefined as string | undefined,
    rootResolves: 0,
    itemCountReads: 0,
  };
  const items: Record<string, unknown>[] = [{ ID: 1 }];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const builder: any = {
    select: (..._c: string[]) => builder,
    filter: (s: string) => {
      calls.filter = s;
      return builder;
    },
    orderBy: () => builder,
    skip: () => builder,
    top: () => builder,
    [Symbol.asyncIterator]() {
      let done = false;
      return {
        async next() {
          if (done) return { done: true, value: undefined };
          done = true;
          return { done: false, value: items };
        },
      };
    },
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const listObj: any = {
    items: builder,
    select: (_f: string) => {
      calls.itemCountReads++;
      return async () => ({ ItemCount: 7 });
    },
  };
  if (opts?.withRoot) {
    listObj.rootFolder = {
      select: (_f: string) => async () => {
        calls.rootResolves++;
        return { ServerRelativeUrl: "/sites/dev/Docs" };
      },
    };
  }
  const sp = {
    web: { lists: { getByTitle: () => listObj, getById: () => listObj } },
    batched: () => [sp, async () => undefined],
  };
  return { sp, calls };
}

const scope: FilterNode = {
  kind: "container-scope",
  path: "a/b",
  recursive: false,
};

describe("SharePointProvider container scoping", () => {
  it("resolves the list root once and renders FileDirRef + items-only for a scoped query", async () => {
    const { sp, calls } = fakeSp({ withRoot: true });
    const provider = new SharePointProvider(sp as never);
    await provider.getItemsPagedAsync(list, ["Title"], 10, undefined, {
      filter: scope,
    });
    expect(calls.rootResolves).toBe(1);
    expect(calls.filter).toBe(
      "(FileDirRef eq '/sites/dev/Docs/a/b') and FSObjType eq 0",
    );
  });

  it("applies items-only with NO root resolution for an unscoped query", async () => {
    const { sp, calls } = fakeSp(); // no rootFolder on the fake — resolving would throw
    const provider = new SharePointProvider(sp as never);
    await provider.getItemsPagedAsync(list, ["Title"], 10);
    expect(calls.filter).toBe("FSObjType eq 0");
  });

  it("omits the items-only clause when includeContainers is set", async () => {
    const { sp, calls } = fakeSp();
    const provider = new SharePointProvider(sp as never);
    await provider.getItemsPagedAsync(list, ["Title"], 10, undefined, {
      includeContainers: true,
    });
    expect(calls.filter).toBeUndefined();
  });

  it("countAsync uses the cheap ItemCount only for includeContainers with no filter", async () => {
    const { sp, calls } = fakeSp();
    const provider = new SharePointProvider(sp as never);
    expect(await provider.countAsync(list, { includeContainers: true })).toBe(
      7,
    );
    expect(calls.itemCountReads).toBe(1);
    expect(calls.filter).toBeUndefined();
  });

  it("default countAsync iterates with the items-only clause", async () => {
    const { sp, calls } = fakeSp();
    const provider = new SharePointProvider(sp as never);
    expect(await provider.countAsync(list)).toBe(1);
    expect(calls.itemCountReads).toBe(0);
    expect(calls.filter).toBe("FSObjType eq 0");
  });
});
