import { describe, it, expect, beforeEach } from "vitest";
import { ModelBuilder } from "../../../src/ModelBuilder/ModelBuilder.js";
import { Query, IncludableQuery } from "../../../src/Query/Query.js";
import { QueryExecutor } from "../../../src/Query/QueryExecutor.js";
import { ChangeTracker } from "../../../src/ChangeTracker/ChangeTracker.js";
import { FakeStorageProvider } from "../fakes/FakeStorageProvider.js";

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

describe("Query.include / thenInclude", () => {
  let q: Query<Blog>;
  beforeEach(() => {
    const provider = new FakeStorageProvider();
    const model = buildModel();
    const tracker = new ChangeTracker(model, provider);
    const executor = new QueryExecutor<Blog>(provider, tracker);
    q = Query.empty<Blog>(model.findEntityType(Blog)!, executor);
  });

  it("include appends top-level IIncludeNode", () => {
    const q2 = q.include((b) => b.Author);
    expect(q2).toBeInstanceOf(IncludableQuery);
    expect(q2.state.includes).toEqual([{ navName: "Author", children: [] }]);
  });

  it("sibling includes append separate top-level nodes", () => {
    const q2 = q.include((b) => b.Author).include((b) => b.Comments);
    expect(q2.state.includes).toEqual([
      { navName: "Author", children: [] },
      { navName: "Comments", children: [] },
    ]);
  });

  it("thenInclude appends to the previous include node", () => {
    const q2 = q.include((b) => b.Comments).thenInclude((c) => c.Author);
    expect(q2.state.includes).toEqual([
      { navName: "Comments", children: [{ navName: "Author", children: [] }] },
    ]);
  });

  it("thenInclude chains further", () => {
    const q2 = q
      .include((b) => b.Comments)
      .thenInclude((c) => c.Author)
      .thenInclude((u) => u.Title);
    expect(q2.state.includes[0]!.children[0]!.children).toEqual([
      { navName: "Title", children: [] },
    ]);
  });

  it("state is immutable across chain", () => {
    const q1 = q.include((b) => b.Author);
    const q2 = q1.include((b) => b.Comments);
    expect(q1.state.includes.length).toBe(1);
    expect(q2.state.includes.length).toBe(2);
  });
});
