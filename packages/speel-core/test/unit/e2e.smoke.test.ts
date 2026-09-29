// test/unit/e2e.smoke.test.ts
import { describe, it, expect } from "vitest";
import {
  DbContext,
  ModelBuilder,
  initSpeelDbContext,
} from "../../src/index.js";
import { FakeStorageProvider } from "./fakes/FakeStorageProvider.js";
import type { IListHandle } from "../../src/types.js";
import {
  TestPrincipal as Principal,
  registerTestPrincipals,
} from "./fakes/testPrincipals.js";

class Blog {
  Id?: number;
  Title?: string;
  Body?: string;
  ViewCount?: number;
  IsPublished?: boolean;
  PublishedAt?: Date;
  Status?: "Draft" | "Published" | "Archived";
  Tags?: string[];
}

class TestCtx extends DbContext {
  public blogs = this.set(Blog);
  protected override onModelCreating(builder: ModelBuilder): void {
    builder.entity(Blog, (b) => {
      b.toList("Blogs");
      b.property((e) => e.Title)
        .isText()
        .isRequired()
        .hasMaxLength(120);
      b.property((e) => e.Body)
        .isNote()
        .asRichText();
      b.property((e) => e.ViewCount)
        .isNumber()
        .hasMin(0)
        .hasDefaultValue(0);
      b.property((e) => e.IsPublished).isBoolean();
      b.property((e) => e.PublishedAt).isDateTime();
      b.property((e) => e.Status)
        .isChoice()
        .hasOptions(["Draft", "Published", "Archived"]);
      b.property((e) => e.Tags)
        .isMultiChoice()
        .hasOptions(["Tech", "News", "Opinion"]);
    });
  }
}

describe("end-to-end smoke", () => {
  it("round-trips every MVP field type via CRUD", async () => {
    const ctx = initSpeelDbContext(TestCtx, (b) =>
      b.useProvider(new FakeStorageProvider()),
    );

    // CREATE
    const b = new Blog();
    b.Title = "Hello";
    b.Body = "<p>hi</p>";
    b.ViewCount = 0;
    b.IsPublished = false;
    b.PublishedAt = new Date("2026-05-12T00:00:00Z");
    b.Status = "Draft";
    b.Tags = ["Tech"];
    ctx.blogs.add(b);
    expect(await ctx.saveChangesAsync()).toBe(1);
    expect(b.Id).toBeGreaterThan(0);

    // READ back through Find — identity map returns the tracked instance
    const same = await ctx.blogs.findAsync(b.Id!);
    expect(same).toBe(b);

    // READ back via ToArray
    const all = await ctx.blogs.toArrayAsync();
    expect(all.length).toBe(1);
    expect(all[0]).toBe(b);

    // UPDATE
    b.Title = "Hello v2";
    b.Tags = ["Tech", "News"];
    expect(await ctx.saveChangesAsync()).toBe(1);

    // DELETE
    ctx.blogs.remove(b);
    expect(await ctx.saveChangesAsync()).toBe(1);
    expect(await ctx.blogs.findAsync(b.Id!)).toBeNull();
  });

  it("auto-splits a 150-item insert into 2 chunks", async () => {
    const provider = new FakeStorageProvider();
    const calls: number[] = [];
    const orig = provider.executeBatchAsync.bind(provider);
    provider.executeBatchAsync = async (ops) => {
      calls.push(ops.length);
      return orig(ops);
    };
    const ctx = initSpeelDbContext(TestCtx, (b) => b.useProvider(provider));

    for (let i = 0; i < 150; i++) {
      const b = new Blog();
      b.Title = `t${i}`;
      ctx.blogs.add(b);
    }
    expect(await ctx.saveChangesAsync()).toBe(150);
    expect(calls).toEqual([100, 50]);
  });

  it("runs a filtered+sorted+taken query end-to-end", async () => {
    const { and } = await import("../../src/index.js");
    const ctx = initSpeelDbContext(TestCtx, (b) =>
      b.useProvider(new FakeStorageProvider()),
    );
    for (let i = 0; i < 30; i++) {
      const b = new Blog();
      b.Title = `Post ${i}`;
      b.Status = i % 2 === 0 ? "Published" : "Draft";
      b.ViewCount = i * 10;
      ctx.blogs.add(b);
    }
    await ctx.saveChangesAsync();

    const top5 = await ctx.blogs
      .where((b) => and(b.Status.eq("Published"), b.ViewCount.gt(50)))
      .orderBy((b) => b.ViewCount, "desc")
      .take(5)
      .toArrayAsync();

    expect(top5.length).toBe(5);
    expect(top5[0]!.ViewCount).toBeGreaterThan(top5[4]!.ViewCount!);
    expect(top5.every((b) => b.Status === "Published")).toBe(true);
    expect(top5.every((b) => b.ViewCount! > 50)).toBe(true);
  });

  it("asNoTracking returns fresh, untracked entities", async () => {
    const ctx = initSpeelDbContext(TestCtx, (b) =>
      b.useProvider(new FakeStorageProvider()),
    );
    const b = new Blog();
    b.Title = "Hi";
    b.Status = "Draft";
    ctx.blogs.add(b);
    await ctx.saveChangesAsync();

    const tracked = await ctx.blogs.findAsync(b.Id!);
    expect(tracked).toBe(b);

    const fresh = await ctx.blogs
      .where((q) => q.Id.eq(b.Id!))
      .asNoTracking()
      .firstOrDefaultAsync();
    expect(fresh).not.toBe(tracked);
    expect(fresh!.Title).toBe("Hi");
  });

  it("countAsync respects filter", async () => {
    const ctx = initSpeelDbContext(TestCtx, (b) =>
      b.useProvider(new FakeStorageProvider()),
    );
    for (let i = 0; i < 5; i++) {
      const b = new Blog();
      b.Title = `T${i}`;
      b.Status = i < 3 ? "Published" : "Draft";
      ctx.blogs.add(b);
    }
    await ctx.saveChangesAsync();
    expect(await ctx.blogs.countAsync()).toBe(5);
    expect(
      await ctx.blogs.where((b) => b.Status.eq("Published")).countAsync(),
    ).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// Navigation e2e scenario
// ---------------------------------------------------------------------------

class Comment {
  Id?: number;
  Body?: string;
  BlogId?: number;
  Blog?: NavBlog;
  AuthorId?: number;
  Author?: Principal;
}
class NavBlog {
  Id?: number;
  Title?: string;
  AuthorId?: number;
  Author?: Principal;
  Comments?: Comment[];
}

class NavCtx extends DbContext {
  public navBlogs = this.set(NavBlog);
  public comments = this.set(Comment);
  protected override onModelCreating(mb: ModelBuilder): void {
    registerTestPrincipals(mb, ["principals"]);
    mb.entity(Comment, (b) => {
      b.toList("Comments");
      b.property((e) => e.Body).isNote();
      b.hasOne(NavBlog, (e) => e.Blog)
        .withMany((b2) => b2.Comments)
        .hasForeignKey((e) => e.BlogId);
      b.hasOne(Principal, (e) => e.Author)
        .withMany()
        .hasForeignKey((e) => e.AuthorId);
    });
    mb.entity(NavBlog, (b) => {
      b.toList("Blogs");
      b.property((e) => e.Title).isText();
      b.hasOne(Principal, (e) => e.Author)
        .withMany()
        .hasForeignKey((e) => e.AuthorId);
      b.hasMany(Comment, (e) => e.Comments)
        .withOne((c) => c.Blog)
        .hasForeignKey((c) => c.BlogId);
    });
  }
}

const blogsHandle: IListHandle = { kind: "title", value: "Blogs" };
const commentsHandle: IListHandle = { kind: "title", value: "Comments" };

describe("e2e navigation", () => {
  it("Blog → Author + Blog → Comments → Author full traversal", async () => {
    const provider = new FakeStorageProvider();
    // Author targets the principals provider source; .include() resolves through it.
    for (const Id of [1, 2, 3]) {
      provider.seedPrincipal({
        Id,
        Title: `User ${Id}`,
        LoginName: `i:0#.f|m|u${Id}`,
        PrincipalType: 1,
      });
    }
    provider.seedRow(blogsHandle, { Title: "Post 1", AuthorId: 1 });
    provider.seedRow(blogsHandle, { Title: "Post 2", AuthorId: 2 });
    provider.seedRow(commentsHandle, { Body: "A", BlogId: 1, AuthorId: 1 });
    provider.seedRow(commentsHandle, { Body: "B", BlogId: 1, AuthorId: 3 });
    provider.seedRow(commentsHandle, { Body: "C", BlogId: 2, AuthorId: 1 });

    const ctx = new NavCtx({ provider });
    const result = await ctx.navBlogs
      .where((b) => b.Title.eq("Post 1"))
      .include((b) => b.Author)
      .include((b) => b.Comments)
      .thenInclude((c) => c.Author)
      .toArrayAsync();

    expect(result.length).toBe(1);
    const b = result[0]!;
    expect(b.Title).toBe("Post 1");
    expect(b.Author?.Title).toBe("User 1");
    expect(b.Comments?.length).toBe(2);
    expect(b.Comments![0]!.Author?.Title).toBe("User 1");
    expect(b.Comments![1]!.Author?.Title).toBe("User 3");
    // Identity-map: Blog.Author and Comment[0].Author both reference User 1 → same instance.
    expect(b.Author).toBe(b.Comments![0]!.Author);
  });
});
