// runReadBatch is the single I/O point for one include level: the capability when the
// provider has it, concurrent individual reads when it does not, and nothing at all
// when the level planned nothing.
import { describe, it, expect } from "vitest";
import { FakeStorageProvider } from "../fakes/FakeStorageProvider.js";
import { runReadBatch } from "../../../src/Query/ReadBatch.js";
import type {
  IReadOperation,
  IReadOperationResult,
} from "../../../src/providers/ISharePointProvider.js";
import type { IListHandle } from "../../../src/types.js";

const blogs: IListHandle = { kind: "title", value: "Blogs" };

class CountingProvider extends FakeStorageProvider {
  batchCalls = 0;
  pagedCalls = 0;

  override async executeReadBatchAsync(
    ops: readonly IReadOperation[],
  ): Promise<readonly IReadOperationResult[]> {
    this.batchCalls++;
    return super.executeReadBatchAsync(ops);
  }

  override async getItemsPagedAsync(
    ...args: Parameters<FakeStorageProvider["getItemsPagedAsync"]>
  ): ReturnType<FakeStorageProvider["getItemsPagedAsync"]> {
    this.pagedCalls++;
    return super.getItemsPagedAsync(...args);
  }
}

/** A provider that simply doesn't implement the optional capability. */
function withoutCapability(p: CountingProvider): CountingProvider {
  (p as { executeReadBatchAsync?: unknown }).executeReadBatchAsync = undefined;
  return p;
}

function seed(provider: FakeStorageProvider, count: number): void {
  for (let i = 0; i < count; i++) {
    provider.seedRow(blogs, { Title: `Blog ${i + 1}` });
  }
}

const twoReads: readonly IReadOperation[] = [
  {
    kind: "itemsByIds",
    source: blogs,
    ids: [1],
    fields: ["Id", "Title"],
    clientToken: "a",
  },
  {
    kind: "itemsByIds",
    source: blogs,
    ids: [2],
    fields: ["Id", "Title"],
    clientToken: "b",
  },
];

describe("runReadBatch", () => {
  it("uses the capability once for the whole level", async () => {
    const provider = new CountingProvider();
    seed(provider, 3);

    const byToken = await runReadBatch(provider, twoReads);

    expect(provider.batchCalls).toBe(1);
    expect(byToken.get("a")!.map((r) => r.Title)).toEqual(["Blog 1"]);
    expect(byToken.get("b")!.map((r) => r.Title)).toEqual(["Blog 2"]);
  });

  it("falls back to the individual read methods when the capability is absent", async () => {
    const provider = withoutCapability(new CountingProvider());
    seed(provider, 3);

    const byToken = await runReadBatch(provider, twoReads);

    expect(provider.batchCalls).toBe(0);
    // Same results, more round-trips — the degradation is in cost, not correctness.
    expect(byToken.get("a")!.map((r) => r.Title)).toEqual(["Blog 1"]);
    expect(byToken.get("b")!.map((r) => r.Title)).toEqual(["Blog 2"]);
  });

  it("makes no provider call at all for an empty operation list", async () => {
    const provider = new CountingProvider();

    const byToken = await runReadBatch(provider, []);

    expect(provider.batchCalls).toBe(0);
    expect(provider.pagedCalls).toBe(0);
    expect(byToken.size).toBe(0);
  });

  it("attributes a fallback-path failure to its operation", async () => {
    const provider = withoutCapability(new CountingProvider());
    provider.getItemsByIdsAsync = async (): Promise<never> => {
      throw new Error("boom");
    };

    await expect(runReadBatch(provider, twoReads)).rejects.toMatchObject({
      clientToken: "a",
    });
  });

  it("preserves a clientToken the capability itself attributed", async () => {
    const provider = new CountingProvider();
    provider.executeReadBatchAsync = async (): Promise<never> => {
      throw Object.assign(new Error("boom"), { clientToken: "b" });
    };

    await expect(runReadBatch(provider, twoReads)).rejects.toMatchObject({
      clientToken: "b",
    });
  });
});
