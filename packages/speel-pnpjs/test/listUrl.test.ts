import { describe, it, expect } from "vitest";
import { DbContext, ModelBuilder } from "@speel/core";
import { SharePointProvider } from "../src/SharePointProvider.js";
import { listUrlAsync } from "../src/listUrl.js";

class Staged {
  Id?: number;
  Title: string | null = null;
}
class Unmapped {
  Id?: number;
}

class TestContext extends DbContext {
  protected override onModelCreating(mb: ModelBuilder): void {
    mb.entity(Staged, (b) => {
      // The title and the URL deliberately disagree: this list was created as
      // "Bulk" and renamed later, which is exactly the case a composed
      // `${webUrl}/Lists/${title}` gets wrong.
      b.toList("BulkTasks");
      b.property((e) => e.Id).isNumber();
      b.property((e) => e.Title).isText();
    });
  }
}

/** Counts rootFolder reads so the memo can be asserted rather than assumed. */
function fakeSp(url: string) {
  let reads = 0;
  const list = {
    rootFolder: {
      select: (_f: string) => async () => {
        reads += 1;
        return { ServerRelativeUrl: url };
      },
    },
  };
  const sp: any = {
    web: { lists: { getByTitle: () => list, getById: () => list } },
    batched() {
      return [sp, async () => undefined];
    },
  };
  return { sp, reads: () => reads };
}

function makeContext(url: string) {
  const { sp, reads } = fakeSp(url);
  const provider = new SharePointProvider(sp as never);
  return {
    ctx: new TestContext({ provider } as never),
    provider,
    reads,
  };
}

describe("listUrlAsync", () => {
  it("resolves the list's own URL, not one composed from its title", async () => {
    // Created as "Bulk", renamed to "BulkTasks" — the URL never moved.
    const { ctx } = makeContext("/sites/projects/Lists/Bulk");
    expect(await listUrlAsync(ctx, Staged)).toBe("/sites/projects/Lists/Bulk");
  });

  it("strips a trailing slash", async () => {
    const { ctx } = makeContext("/sites/projects/Lists/Bulk/");
    expect(await listUrlAsync(ctx, Staged)).toBe("/sites/projects/Lists/Bulk");
  });

  it("reads the root folder once however many callers ask", async () => {
    const { ctx, reads } = makeContext("/sites/projects/Lists/Bulk");
    await Promise.all([
      listUrlAsync(ctx, Staged),
      listUrlAsync(ctx, Staged),
      listUrlAsync(ctx, Staged),
    ]);
    expect(reads()).toBe(1);
  });

  it("refuses an entity this context does not model", async () => {
    const { ctx } = makeContext("/sites/projects/Lists/Bulk");
    await expect(listUrlAsync(ctx, Unmapped as never)).rejects.toThrow(
      /not part of this context's model/,
    );
  });
});

describe("SharePointProvider.resolveListRootUrl", () => {
  it("retries after a failed read rather than caching the failure", async () => {
    let calls = 0;
    const list = {
      rootFolder: {
        select: (_f: string) => async () => {
          calls += 1;
          if (calls === 1) throw new Error("transient");
          return { ServerRelativeUrl: "/sites/projects/Lists/Bulk" };
        },
      },
    };
    const sp: any = {
      web: { lists: { getByTitle: () => list, getById: () => list } },
      batched() {
        return [sp, async () => undefined];
      },
    };
    const provider = new SharePointProvider(sp as never);
    const handle = { kind: "title" as const, value: "BulkTasks" };
    await expect(provider.resolveListRootUrl(handle)).rejects.toThrow(
      "transient",
    );
    expect(await provider.resolveListRootUrl(handle)).toBe(
      "/sites/projects/Lists/Bulk",
    );
  });
});
