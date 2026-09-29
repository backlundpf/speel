// Regression: an inverse-FK include over a wide parent set used to emit a fixed
// 100-id `in` filter. @speel/pnpjs renders that as ~100 OR-ed equality clauses, and a
// live query over ~130 parents came back "[400] Bad Request ::> The length of the
// query string for this request exceeds the configured maxQueryStringLength value."
// The chunk size now comes from the provider, which alone can cost its own URL.
import { describe, it, expect } from "vitest";
import { ModelBuilder } from "../../../src/ModelBuilder/ModelBuilder.js";
import { QueryExecutor } from "../../../src/Query/QueryExecutor.js";
import { Query } from "../../../src/Query/Query.js";
import { ChangeTracker } from "../../../src/ChangeTracker/ChangeTracker.js";
import { FakeStorageProvider } from "../fakes/FakeStorageProvider.js";
import type { IGetItemsOptions } from "../../../src/providers/ISharePointProvider.js";
import type { IListHandle } from "../../../src/types.js";

class Comment {
  Id?: number;
  Body?: string;
  BlogId?: number;
  Blog?: Blog;
}
class Blog {
  Id?: number;
  Title?: string;
  Comments?: Comment[];
}

const blogs: IListHandle = { kind: "title", value: "Blogs" };
const comments: IListHandle = { kind: "title", value: "Comments" };

const PARENT_COUNT = 130;

interface IBudgetCall {
  column: string;
  fields: readonly string[];
  maxValue: number;
}

/**
 * Records the `in` filters reaching getItemsPagedAsync, and answers the budget
 * capability with a caller-supplied number (or not at all, when `budget` is null).
 */
class RecordingProvider extends FakeStorageProvider {
  readonly inFilters: (readonly unknown[])[] = [];
  readonly budgetCalls: IBudgetCall[] = [];

  constructor(private readonly budget: number | null) {
    super();
  }

  override async getItemsPagedAsync(
    list: IListHandle,
    fields: readonly string[],
    pageSize: number,
    cursor?: string,
    options?: IGetItemsOptions,
  ): Promise<{ items: Record<string, unknown>[]; nextCursor: string | null }> {
    if (options?.filter?.kind === "in")
      this.inFilters.push(options.filter.values);
    return super.getItemsPagedAsync(list, fields, pageSize, cursor, options);
  }

  maxInFilterValues(
    column: string,
    fields: readonly string[],
    maxValue: number,
  ): number {
    this.budgetCalls.push({ column, fields, maxValue });
    return this.budget!;
  }
}

function withoutCapability(): RecordingProvider {
  const p = new RecordingProvider(null);
  // A provider that simply doesn't implement the optional capability.
  (p as { maxInFilterValues?: unknown }).maxInFilterValues = undefined;
  return p;
}

function buildModel() {
  const mb = new ModelBuilder();
  mb.entity(Comment, (b) => {
    b.toList("Comments");
    b.property((e) => e.Body).isNote();
    b.hasOne(Blog, (e) => e.Blog)
      .withMany((x) => x.Comments)
      .hasForeignKey((e) => e.BlogId);
  });
  mb.entity(Blog, (b) => {
    b.toList("Blogs");
    b.property((e) => e.Title).isText();
    b.hasMany(Comment, (e) => e.Comments)
      .withOne((c) => c.Blog)
      .hasForeignKey((c) => c.BlogId);
  });
  return mb.build();
}

function seed(provider: FakeStorageProvider): void {
  for (let i = 0; i < PARENT_COUNT; i++) {
    provider.seedRow(blogs, { Title: `Blog ${i + 1}` });
  }
  // One comment per blog, so a missing chunk is visible as a missing child.
  for (let i = 0; i < PARENT_COUNT; i++) {
    provider.seedRow(comments, { Body: `C${i + 1}`, BlogId: i + 1 });
  }
}

async function includeComments(provider: FakeStorageProvider): Promise<Blog[]> {
  const model = buildModel();
  const executor = new QueryExecutor<Blog>(
    provider,
    new ChangeTracker(model, provider),
  );
  const q = Query.empty<Blog>(model.findEntityType(Blog)!, executor);
  return q.include((b) => b.Comments).toArrayAsync();
}

describe("inverse-FK include — `in` chunking honors the provider budget", () => {
  it("chunks at the budget and still returns every child", async () => {
    const provider = new RecordingProvider(7);
    seed(provider);

    const result = await includeComments(provider);

    expect(result.length).toBe(PARENT_COUNT);
    // Every parent kept its child — nothing fell off the end of a chunk.
    expect(result.every((b) => b.Comments?.length === 1)).toBe(true);
    expect(result.map((b) => b.Comments![0]!.Body)).toEqual(
      Array.from({ length: PARENT_COUNT }, (_, i) => `C${i + 1}`),
    );

    expect(provider.inFilters.length).toBe(Math.ceil(PARENT_COUNT / 7));
    for (const values of provider.inFilters)
      expect(values.length).toBeLessThanOrEqual(7);
    // The chunks partition the parent id set: none dropped, none sent twice.
    const sent = provider.inFilters.flatMap((v) => [...v]);
    expect(sent.length).toBe(PARENT_COUNT);
    expect(
      [...new Set(sent)].sort((a, b) => (a as number) - (b as number)),
    ).toEqual(Array.from({ length: PARENT_COUNT }, (_, i) => i + 1));
  });

  it("asks the budget about the real request shape — FK column, child columns, widest id", async () => {
    const provider = new RecordingProvider(50);
    seed(provider);

    await includeComments(provider);

    expect(provider.budgetCalls.length).toBe(1);
    const call = provider.budgetCalls[0]!;
    expect(call.column).toBe("BlogId");
    expect(call.maxValue).toBe(PARENT_COUNT);
    // The child entity's columns — they are what drives the $select the read carries.
    expect(call.fields).toContain("Body");
    expect(call.fields).toContain("BlogId");
  });

  it("falls back to a conservative chunk when the provider has no budget capability", async () => {
    const provider = withoutCapability();
    seed(provider);

    const result = await includeComments(provider);

    expect(result.every((b) => b.Comments?.length === 1)).toBe(true);
    expect(provider.budgetCalls.length).toBe(0);
    for (const values of provider.inFilters)
      expect(values.length).toBeLessThanOrEqual(25);
    expect(provider.inFilters.length).toBe(Math.ceil(PARENT_COUNT / 25));
  });

  it("floors a nonsense budget at one id per request rather than dropping ids", async () => {
    const provider = new RecordingProvider(0);
    seed(provider);

    const result = await includeComments(provider);

    expect(result.every((b) => b.Comments?.length === 1)).toBe(true);
    expect(provider.inFilters.length).toBe(PARENT_COUNT);
    for (const values of provider.inFilters) expect(values.length).toBe(1);
  });
});
