// The motivating shape: two include roots of different depths. Depth 1 (Comments +
// Author) must resolve in ONE provider read call, depth 2 (Docs) in a second.
// Depth-first would have cost three, with the shallow Author lookup waiting behind
// an unrelated branch's deeper level.
import { describe, it, expect } from "vitest";
import { ModelBuilder } from "../../../src/ModelBuilder/ModelBuilder.js";
import { QueryExecutor } from "../../../src/Query/QueryExecutor.js";
import { Query } from "../../../src/Query/Query.js";
import { ChangeTracker } from "../../../src/ChangeTracker/ChangeTracker.js";
import { FakeStorageProvider } from "../fakes/FakeStorageProvider.js";
import type {
  IReadOperation,
  IReadOperationResult,
} from "../../../src/providers/ISharePointProvider.js";
import type { IListHandle } from "../../../src/types.js";

class Doc {
  Id?: number;
  FileName?: string;
  CommentId?: number;
  Comment?: Comment;
}
class Comment {
  Id?: number;
  Body?: string;
  BlogId?: number;
  Blog?: Blog;
  Docs?: Doc[];
}
class Author {
  Id?: number;
  Name?: string;
}
class Blog {
  Id?: number;
  Title?: string;
  AuthorId?: number;
  Author?: Author;
  ReviewerId?: number;
  Reviewer?: Author;
  Comments?: Comment[];
}

const blogs: IListHandle = { kind: "title", value: "Blogs" };
const comments: IListHandle = { kind: "title", value: "Comments" };
const docs: IListHandle = { kind: "title", value: "Docs" };
const authors: IListHandle = { kind: "title", value: "Authors" };

class BatchRecordingProvider extends FakeStorageProvider {
  readonly batches: (readonly IReadOperation[])[] = [];

  override async executeReadBatchAsync(
    ops: readonly IReadOperation[],
  ): Promise<readonly IReadOperationResult[]> {
    this.batches.push(ops);
    return super.executeReadBatchAsync(ops);
  }
}

function buildModel() {
  const mb = new ModelBuilder();
  mb.entity(Author, (b) => {
    b.toList("Authors");
    b.property((e) => e.Name).isText();
  });
  mb.entity(Doc, (b) => {
    b.toList("Docs");
    b.property((e) => e.FileName).isText();
    b.hasOne(Comment, (e) => e.Comment)
      .withMany((c) => c.Docs)
      .hasForeignKey((e) => e.CommentId);
  });
  mb.entity(Comment, (b) => {
    b.toList("Comments");
    b.property((e) => e.Body).isNote();
    b.hasOne(Blog, (e) => e.Blog)
      .withMany((x) => x.Comments)
      .hasForeignKey((e) => e.BlogId);
    b.hasMany(Doc, (e) => e.Docs)
      .withOne((d) => d.Comment)
      .hasForeignKey((d) => d.CommentId);
  });
  mb.entity(Blog, (b) => {
    b.toList("Blogs");
    b.property((e) => e.Title).isText();
    b.hasMany(Comment, (e) => e.Comments)
      .withOne((c) => c.Blog)
      .hasForeignKey((c) => c.BlogId);
    b.hasOne(Author, (e) => e.Author)
      .withMany()
      .hasForeignKey((e) => e.AuthorId);
    b.hasOne(Author, (e) => e.Reviewer)
      .withMany()
      .hasForeignKey((e) => e.ReviewerId);
  });
  return mb.build();
}

async function run(provider: FakeStorageProvider): Promise<Blog[]> {
  const model = buildModel();
  const executor = new QueryExecutor<Blog>(
    provider,
    new ChangeTracker(model, provider),
  );
  const q = Query.empty<Blog>(model.findEntityType(Blog)!, executor);
  return q
    .include((b) => b.Comments)
    .thenInclude((c) => c.Docs)
    .include((b) => b.Author)
    .toArrayAsync();
}

describe("include level batching", () => {
  it("resolves each navigation depth in exactly one provider read call", async () => {
    const provider = new BatchRecordingProvider();
    provider.seedRow(authors, { Name: "Ada" });
    provider.seedRow(blogs, { Title: "Blog 1", AuthorId: 1 });
    provider.seedRow(comments, { Body: "C1", BlogId: 1 });
    provider.seedRow(docs, { FileName: "f.pdf", CommentId: 1 });

    const result = await run(provider);

    expect(provider.batches.length).toBe(2);
    // Depth 1: the inverse-FK Comments read AND the Author lookup, together.
    expect(provider.batches[0]!.map((o) => o.kind).sort()).toEqual([
      "items",
      "itemsByIds",
    ]);
    // Depth 2: Docs alone.
    expect(provider.batches[1]!.length).toBe(1);
    expect(provider.batches[1]![0]!.kind).toBe("items");

    const blog = result[0]!;
    expect(blog.Author?.Name).toBe("Ada");
    expect(blog.Comments?.[0]?.Body).toBe("C1");
    expect(blog.Comments?.[0]?.Docs?.[0]?.FileName).toBe("f.pdf");
  });

  it("de-duplicates same-target lookups at one depth into a single request", async () => {
    const provider = new BatchRecordingProvider();
    provider.seedRow(authors, { Name: "Ada" });
    provider.seedRow(authors, { Name: "Bob" });
    provider.seedRow(blogs, { Title: "Blog 1", AuthorId: 1, ReviewerId: 2 });
    provider.seedRow(blogs, { Title: "Blog 2", AuthorId: 2, ReviewerId: 2 });

    const model = buildModel();
    const executor = new QueryExecutor<Blog>(
      provider,
      new ChangeTracker(model, provider),
    );
    const q = Query.empty<Blog>(model.findEntityType(Blog)!, executor);
    const result = await q
      .include((b) => b.Author)
      .include((b) => b.Reviewer)
      .toArrayAsync();

    // Author and Reviewer both resolve against Authors: ONE itemsByIds op, ids unioned.
    expect(provider.batches.length).toBe(1);
    expect(provider.batches[0]!.length).toBe(1);
    const op = provider.batches[0]![0]!;
    expect(op.kind).toBe("itemsByIds");
    expect((op as { ids: readonly number[] }).ids).toEqual([1, 2]);

    expect(result[0]!.Author?.Name).toBe("Ada");
    expect(result[0]!.Reviewer?.Name).toBe("Bob");
    expect(result[1]!.Author?.Name).toBe("Bob");
    expect(result[1]!.Reviewer?.Name).toBe("Bob");
  });

  it("issues no read call for a depth that plans nothing, but still applies it", async () => {
    const provider = new BatchRecordingProvider();
    // A blog with no author and no comments. Depth 1 plans only the Comments read (the
    // blog has an Id); the Author lookup plans nothing because no parent carries a FK.
    // Depth 2 has no parents at all, so it must not reach the provider — while Comments
    // still has to be assigned `[]`, which is the always-apply rule.
    provider.seedRow(blogs, { Title: "Lonely" });

    const result = await run(provider);

    expect(provider.batches.length).toBe(1);
    expect(provider.batches[0]!.length).toBe(1);
    expect(result[0]!.Comments).toEqual([]);
    expect(result[0]!.Author).toBeUndefined();
  });
});
