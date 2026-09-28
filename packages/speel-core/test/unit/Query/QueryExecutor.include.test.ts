import { describe, it, expect, beforeEach } from "vitest";
import { ModelBuilder } from "../../../src/ModelBuilder/ModelBuilder.js";
import { QueryExecutor } from "../../../src/Query/QueryExecutor.js";
import { Query } from "../../../src/Query/Query.js";
import { ChangeTracker } from "../../../src/ChangeTracker/ChangeTracker.js";
import { FakeStorageProvider } from "../fakes/FakeStorageProvider.js";
import type { IListHandle } from "../../../src/types.js";

class User {
  Id?: number;
  Title?: string;
}
class Comment {
  Id?: number;
  Body?: string;
  BlogId?: number;
  Blog?: Blog;
  AuthorId?: number;
  Author?: User;
}
class Blog {
  Id?: number;
  Title?: string;
  AuthorId?: number;
  Author?: User;
  Comments?: Comment[];
}

const users: IListHandle = { kind: "title", value: "UserInfo" };
const blogs: IListHandle = { kind: "title", value: "Blogs" };
const comments: IListHandle = { kind: "title", value: "Comments" };

function buildModel() {
  const mb = new ModelBuilder();
  mb.entity(User, (b) => {
    b.toList("UserInfo");
    b.property((e) => e.Title).isText();
  });
  mb.entity(Comment, (b) => {
    b.toList("Comments");
    b.property((e) => e.Body).isNote();
    b.hasOne(Blog, (e) => e.Blog)
      .withMany((b2) => b2.Comments)
      .hasForeignKey((e) => e.BlogId);
    b.hasOne(User, (e) => e.Author)
      .withMany()
      .hasForeignKey((e) => e.AuthorId);
  });
  mb.entity(Blog, (b) => {
    b.toList("Blogs");
    b.property((e) => e.Title).isText();
    b.hasOne(User, (e) => e.Author)
      .withMany()
      .hasForeignKey((e) => e.AuthorId);
    b.hasMany(Comment, (e) => e.Comments)
      .withOne((c) => c.Blog)
      .hasForeignKey((c) => c.BlogId);
  });
  return mb.build();
}

describe("QueryExecutor — include + thenInclude + expand", () => {
  let provider: FakeStorageProvider;
  let model: ReturnType<typeof buildModel>;

  beforeEach(async () => {
    provider = new FakeStorageProvider();
    model = buildModel();
    // Seed
    provider.seedRow(users, { Title: "Alice" });
    provider.seedRow(users, { Title: "Bob" });
    provider.seedRow(blogs, { Title: "Post 1", AuthorId: 1 });
    provider.seedRow(blogs, { Title: "Post 2", AuthorId: 2 });
    provider.seedRow(comments, { Body: "C1", BlogId: 1, AuthorId: 1 });
    provider.seedRow(comments, { Body: "C2", BlogId: 1, AuthorId: 2 });
    provider.seedRow(comments, { Body: "C3", BlogId: 2, AuthorId: 1 });
    // Register joins so expand works.
    provider.registerJoin(blogs, "Author", {
      foreignKey: "AuthorId",
      targetList: users,
    });
    provider.registerJoin(comments, "Author", {
      foreignKey: "AuthorId",
      targetList: users,
    });
    provider.registerJoin(comments, "Blog", {
      foreignKey: "BlogId",
      targetList: blogs,
    });
  });

  function newQuery() {
    const tracker = new ChangeTracker(model, provider);
    const executor = new QueryExecutor<Blog>(provider, tracker);
    return {
      tracker,
      q: Query.empty<Blog>(model.findEntityType(Blog)!, executor),
    };
  }

  it("include loads Author on every parent", async () => {
    const { q } = newQuery();
    const r = await q.include((b) => b.Author).toArrayAsync();
    expect(r.length).toBe(2);
    expect(r[0]!.Author?.Title).toBe("Alice");
    expect(r[1]!.Author?.Title).toBe("Bob");
  });

  it("thenInclude loads Author on each Comment", async () => {
    const { q } = newQuery();
    const r = await q
      .include((b) => b.Comments)
      .thenInclude((c) => c.Author)
      .toArrayAsync();
    expect(r[0]!.Comments!.length).toBe(2);
    expect(r[0]!.Comments![0]!.Author?.Title).toBe("Alice");
    expect(r[0]!.Comments![1]!.Author?.Title).toBe("Bob");
    expect(r[1]!.Comments![0]!.Author?.Title).toBe("Alice");
  });

  it("identity-map: same Author instance referenced by sibling parents", async () => {
    const { q } = newQuery();
    const r = await q
      .include((b) => b.Comments)
      .thenInclude((c) => c.Author)
      .toArrayAsync();
    // Blog 1 comment 0 Author and Blog 2 comment 0 Author are both Alice id=1 — same instance.
    expect(r[0]!.Comments![0]!.Author).toBe(r[1]!.Comments![0]!.Author);
  });

  it("asNoTracking yields fresh instances and no tracker entries for includes", async () => {
    const { tracker, q } = newQuery();
    const r = await q
      .include((b) => b.Author)
      .asNoTracking()
      .toArrayAsync();
    expect(r[0]!.Author?.Title).toBe("Alice");
    expect(tracker.entries(User).length).toBe(0);
  });

  it("nav predicate triggers implicit $expand for the display field", async () => {
    const { q } = newQuery();
    const r = await q
      .where((b) => (b.Author as any).Title.eq("Alice"))
      .toArrayAsync();
    expect(r.length).toBe(1);
    expect(r[0]!.Title).toBe("Post 1");
  });

  it("explicit expand attaches sparse partial sub-object", async () => {
    const { q } = newQuery();
    const r = await q.expand((b) => b.Author).toArrayAsync();
    expect(r[0]!.Author?.Title).toBe("Alice");
  });
});

// Multi-value Lookup (self-fk-array) include scenario: Blog.TagsId: number[] → Tag[]
class Tag {
  Id?: number;
  Name?: string;
}
class TaggedBlog {
  Id?: number;
  Title?: string;
  TagsId?: number[];
  Tags?: Tag[];
}

const tags: IListHandle = { kind: "title", value: "Tags" };
const taggedBlogs: IListHandle = { kind: "title", value: "TaggedBlogs" };

function buildMvModel() {
  const mb = new ModelBuilder();
  mb.entity(Tag, (b) => {
    b.toList("Tags");
    b.property((e) => e.Name).isText();
  });
  mb.entity(TaggedBlog, (b) => {
    b.toList("TaggedBlogs");
    b.property((e) => e.Title).isText();
    b.hasMany(Tag, (e) => e.Tags)
      .withMany()
      .hasForeignKey((e) => e.TagsId);
  });
  return mb.build();
}

describe("QueryExecutor — multi-value Lookup include (self-fk-array)", () => {
  let provider: FakeStorageProvider;
  let model: ReturnType<typeof buildMvModel>;

  beforeEach(async () => {
    provider = new FakeStorageProvider();
    model = buildMvModel();
    provider.seedRow(tags, { Name: "Red" });
    provider.seedRow(tags, { Name: "Green" });
    provider.seedRow(tags, { Name: "Blue" });
    // Blog 1: tags [2, 1] — ordering deliberately reversed to verify FK order preservation
    provider.seedRow(taggedBlogs, { Title: "B1", TagsId: [2, 1] });
    // Blog 2: tags [1, 99] — 99 is a deleted/missing target; should be dropped
    provider.seedRow(taggedBlogs, { Title: "B2", TagsId: [1, 99] });
    // Blog 3: empty array — should produce []
    provider.seedRow(taggedBlogs, { Title: "B3", TagsId: [] });
  });

  function newQuery() {
    const tracker = new ChangeTracker(model, provider);
    const executor = new QueryExecutor<TaggedBlog>(provider, tracker);
    return {
      tracker,
      q: Query.empty<TaggedBlog>(model.findEntityType(TaggedBlog)!, executor),
    };
  }

  it("populates Tags array preserving FK order", async () => {
    const { q } = newQuery();
    const r = await q.include((b) => b.Tags).toArrayAsync();
    const b1 = r.find((x) => x.Title === "B1")!;
    expect(b1.Tags?.length).toBe(2);
    expect(b1.Tags![0]!.Name).toBe("Green"); // TagsId[0] = 2 = Green
    expect(b1.Tags![1]!.Name).toBe("Red"); // TagsId[1] = 1 = Red
  });

  it("drops missing target entries silently", async () => {
    const { q } = newQuery();
    const r = await q.include((b) => b.Tags).toArrayAsync();
    const b2 = r.find((x) => x.Title === "B2")!;
    expect(b2.Tags?.length).toBe(1);
    expect(b2.Tags![0]!.Name).toBe("Red");
  });

  it("produces [] for empty FK array", async () => {
    const { q } = newQuery();
    const r = await q.include((b) => b.Tags).toArrayAsync();
    const b3 = r.find((x) => x.Title === "B3")!;
    expect(b3.Tags).toEqual([]);
  });

  it("identity-map: same Tag instance referenced by two blogs", async () => {
    const { q } = newQuery();
    const r = await q.include((b) => b.Tags).toArrayAsync();
    const b1 = r.find((x) => x.Title === "B1")!;
    const b2 = r.find((x) => x.Title === "B2")!;
    // Both b1 and b2 reference Tag Id=1 (Red).
    const red1 = b1.Tags!.find((t) => t.Name === "Red")!;
    const red2 = b2.Tags!.find((t) => t.Name === "Red")!;
    expect(red1).toBe(red2);
  });
});
