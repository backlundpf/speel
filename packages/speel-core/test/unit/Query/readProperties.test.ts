// Every read core issues tells the provider which properties describe the columns it
// asked for, so the provider can hand back TYPED values (a Date, a boolean, an id
// array) and Materialize never sees a wire shape. One recording wrapper around the
// fake pins the parameter on every read path: the DbSet point read, the paged query,
// both include shapes, explicit and implicit expands, the cache sync, an entry
// reload, and the inverse-fixup child fetch. Identity, not equality — core passes
// the model's own array, never a derived copy.
import { describe, it, expect } from "vitest";
import { DbContext } from "../../../src/DbContext.js";
import { ModelBuilder } from "../../../src/ModelBuilder/ModelBuilder.js";
import { initSpeelDbContext } from "../../../src/initSpeelDbContext.js";
import { InMemoryCacheProvider } from "../../../src/Cache/InMemoryCacheProvider.js";
import { FakeStorageProvider } from "../fakes/FakeStorageProvider.js";
import type { Property } from "../../../src/Metadata/Property.js";
import type { IListHandle } from "../../../src/types.js";
import type {
  IExpandClause,
  IGetItemsOptions,
  IReadOperation,
  IReadOperationResult,
  ISourceHandle,
} from "../../../src/providers/ISharePointProvider.js";

class Author {
  Id?: number;
  Name?: string;
}
class Comment {
  Id?: number;
  Body?: string;
  BlogId?: number;
  Blog?: Blog;
}
class Blog {
  Id?: number;
  Title?: string;
  AuthorId?: number;
  Author?: Author;
  Comments?: Comment[];
  readonly Fancy?: unknown = undefined;
}

class Ctx extends DbContext {
  blogs = this.set(Blog);
  comments = this.set(Comment);
  protected onModelCreating(mb: ModelBuilder): void {
    mb.entity(Author, (b) => {
      b.toList("Authors");
      b.property((e) => e.Name).isText();
    });
    mb.entity(Comment, (b) => {
      b.toList("Comments");
      b.property((e) => e.Body).isText();
      b.hasOne(Blog, (e) => e.Blog)
        .withMany((x) => x.Comments)
        .hasForeignKey((e) => e.BlogId);
    });
    mb.entity(Blog, (b) => {
      b.toList("Blogs");
      b.property((e) => e.Title).isText();
      b.hasOne(Author, (e) => e.Author)
        .withMany()
        .hasForeignKey((e) => e.AuthorId);
      b.hasMany(Comment, (e) => e.Comments)
        .withOne((c) => c.Blog)
        .hasForeignKey((c) => c.BlogId);
      b.useCaching((c) => c.withTimeout(1_000_000).expand((e) => e.Author));
    });
    // A special expand is not a navigation: it has no target and so no properties.
    mb.addSpecialExpand({
      navName: "Fancy",
      spec: () => ({
        navName: "Fancy",
        fields: [],
        materialize: (target: Record<string, unknown>, record) => {
          target.Fancy = record.Fancy;
        },
      }),
    });
  }
}

interface IRead {
  method: string;
  source: string;
  properties: readonly Property[] | undefined;
  expand?: readonly IExpandClause[] | undefined;
}

function sourceName(source: ISourceHandle): string {
  return source.kind === "provider" ? source.key : source.value;
}

/** The fake, with every read's `properties` (and expand clauses) written down. */
class RecordingProvider extends FakeStorageProvider {
  readonly reads: IRead[] = [];
  /** The descriptors a batched level read carried, before dispatch. */
  readonly batchOps: IReadOperation[] = [];

  override getItemByIdAsync(
    source: ISourceHandle,
    id: number,
    fields: readonly string[],
    opts?: {
      expand?: readonly IExpandClause[];
      properties?: readonly Property[];
    },
  ) {
    this.reads.push({
      method: "getItemByIdAsync",
      source: sourceName(source),
      properties: opts?.properties,
    });
    return super.getItemByIdAsync(source, id, fields, opts);
  }
  override getItemsByIdsAsync(
    source: ISourceHandle,
    ids: readonly number[],
    fields: readonly string[],
    opts?: {
      expand?: readonly IExpandClause[];
      properties?: readonly Property[];
    },
  ) {
    this.reads.push({
      method: "getItemsByIdsAsync",
      source: sourceName(source),
      properties: opts?.properties,
    });
    return super.getItemsByIdsAsync(source, ids, fields, opts);
  }
  override getItemsPagedAsync(
    source: ISourceHandle,
    fields: readonly string[],
    pageSize: number,
    cursor?: string,
    options?: IGetItemsOptions,
  ) {
    this.reads.push({
      method: "getItemsPagedAsync",
      source: sourceName(source),
      properties: options?.properties,
      expand: options?.expand,
    });
    return super.getItemsPagedAsync(source, fields, pageSize, cursor, options);
  }
  override getListItemChangesSinceToken(
    list: IListHandle,
    token: string,
    fields: readonly string[],
    expand?: readonly IExpandClause[],
    properties?: readonly Property[],
  ) {
    this.reads.push({
      method: "getListItemChangesSinceToken",
      source: list.value,
      properties,
      expand,
    });
    return super.getListItemChangesSinceToken(
      list,
      token,
      fields,
      expand,
      properties,
    );
  }
  override executeReadBatchAsync(
    operations: readonly IReadOperation[],
  ): Promise<readonly IReadOperationResult[]> {
    this.batchOps.push(...operations);
    return super.executeReadBatchAsync(operations);
  }
}

const BLOGS: IListHandle = { kind: "title", value: "Blogs" };
const AUTHORS: IListHandle = { kind: "title", value: "Authors" };
const COMMENTS: IListHandle = { kind: "title", value: "Comments" };

function setup() {
  const provider = new RecordingProvider();
  provider.seedRow(AUTHORS, { Name: "Ada" });
  provider.seedRow(BLOGS, { Title: "Post", AuthorId: 1 });
  provider.seedRow(COMMENTS, { Body: "c1", BlogId: 1 });
  provider.seedRow(COMMENTS, { Body: "orphan" });
  provider.registerJoin(BLOGS, "Author", {
    foreignKey: "AuthorId",
    targetList: AUTHORS,
  });
  const ctx = initSpeelDbContext(Ctx, (b) => {
    b.useProvider(provider);
    b.useCaching(new InMemoryCacheProvider());
  });
  const blogEt = ctx.model.findEntityType(Blog)!;
  const authorEt = ctx.model.findEntityType(Author)!;
  const commentEt = ctx.model.findEntityType(Comment)!;
  return { provider, ctx, blogEt, authorEt, commentEt };
}

function only(reads: readonly IRead[], method: string, source: string): IRead {
  const hits = reads.filter((r) => r.method === method && r.source === source);
  expect(hits, `${method}(${source})`).toHaveLength(1);
  return hits[0]!;
}

describe("every read passes the entity's properties", () => {
  it("DbSet.findAsync: the entity's own", async () => {
    const { provider, ctx, blogEt } = setup();
    await ctx.blogs.findAsync(1);
    expect(only(provider.reads, "getItemByIdAsync", "Blogs").properties).toBe(
      blogEt.properties,
    );
  });

  it("the paged query: the entity's own on every page request", async () => {
    const { provider, ctx, blogEt } = setup();
    await ctx.blogs.toArrayAsync();
    expect(only(provider.reads, "getItemsPagedAsync", "Blogs").properties).toBe(
      blogEt.properties,
    );
  });

  it("a self-FK include: the TARGET's, on the itemsByIds descriptor and the by-ids read it dispatches", async () => {
    const { provider, ctx, authorEt } = setup();
    await ctx.blogs.include((b) => b.Author).toArrayAsync();
    const op = provider.batchOps.find((o) => o.kind === "itemsByIds");
    expect(op && op.kind === "itemsByIds" && op.properties).toBe(
      authorEt.properties,
    );
    expect(
      only(provider.reads, "getItemsByIdsAsync", "Authors").properties,
    ).toBe(authorEt.properties);
  });

  it("an inverse-FK include: the TARGET's, on the filtered items descriptor and the paged read it dispatches", async () => {
    const { provider, ctx, commentEt } = setup();
    await ctx.blogs.include((b) => b.Comments).toArrayAsync();
    const op = provider.batchOps.find((o) => o.kind === "items");
    expect(op && op.kind === "items" && op.options?.properties).toBe(
      commentEt.properties,
    );
    expect(
      only(provider.reads, "getItemsPagedAsync", "Comments").properties,
    ).toBe(commentEt.properties);
  });

  it("an explicit expand: the target's on its clause, beside the entity's own", async () => {
    const { provider, ctx, blogEt, authorEt } = setup();
    await ctx.blogs.expand((b) => b.Author).toArrayAsync();
    const read = only(provider.reads, "getItemsPagedAsync", "Blogs");
    expect(read.properties).toBe(blogEt.properties);
    expect(read.expand?.map((c) => [c.navColumn, c.properties])).toEqual([
      ["Author", authorEt.properties],
    ]);
    expect(read.expand![0]!.properties).toBe(authorEt.properties);
  });

  it("an implicit expand (a predicate through a navigation): the target's too", async () => {
    const { provider, ctx, authorEt } = setup();
    await ctx.blogs
      .where((b) =>
        (b.Author as unknown as { Name: { eq(v: string): never } }).Name.eq(
          "Ada",
        ),
      )
      .toArrayAsync();
    const read = only(provider.reads, "getItemsPagedAsync", "Blogs");
    expect(read.expand).toHaveLength(1);
    expect(read.expand![0]!.navColumn).toBe("Author");
    expect(read.expand![0]!.properties).toBe(authorEt.properties);
  });

  it("a special expand: none — it is not a navigation and has no target", async () => {
    const { provider, ctx } = setup();
    await ctx.blogs.expand((b) => b.Fancy).toArrayAsync();
    const read = only(provider.reads, "getItemsPagedAsync", "Blogs");
    expect(read.expand!.map((c) => c.navColumn)).toEqual(["Fancy"]);
    expect(read.expand![0]!.properties).toBeUndefined();
  });

  it("the cache sync: the entity's own, and the target's on each cached expand", async () => {
    const { provider, ctx, blogEt, authorEt } = setup();
    await ctx.blogs.cacheAsync();
    const read = only(provider.reads, "getListItemChangesSinceToken", "Blogs");
    expect(read.properties).toBe(blogEt.properties);
    expect(read.expand!.map((c) => c.navColumn)).toEqual(["Author"]);
    expect(read.expand![0]!.properties).toBe(authorEt.properties);
  });

  it("an entry reload: the entity's own", async () => {
    const { provider, ctx, blogEt } = setup();
    const blog = (await ctx.blogs.findAsync(1))!;
    provider.reads.length = 0;
    await ctx.entry(blog).reload();
    expect(only(provider.reads, "getItemByIdAsync", "Blogs").properties).toBe(
      blogEt.properties,
    );
  });

  it("the inverse-fixup child fetch: the CHILD's", async () => {
    const { provider, ctx, commentEt } = setup();
    const blog = (await ctx.blogs.findAsync(1))!;
    // An untracked instance naming row 2 joins the collection: fixup must fetch it.
    const joining = new Comment();
    joining.Id = 2;
    blog.Comments = [joining];
    provider.reads.length = 0;
    await ctx.saveChangesAsync();
    expect(
      only(provider.reads, "getItemByIdAsync", "Comments").properties,
    ).toBe(commentEt.properties);
  });
});
