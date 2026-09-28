// planIncludeLevel decides the reads one navigation needs, as plain data and with
// no I/O. Planning zero operations is a real answer, not an error — applyIncludeLevel
// still owes those parents an empty navigation and a snapshot baseline.
import { describe, it, expect } from "vitest";
import { ModelBuilder } from "../../../src/ModelBuilder/ModelBuilder.js";
import { planIncludeLevel } from "../../../src/Query/IncludeResolver.js";
import { FakeStorageProvider } from "../fakes/FakeStorageProvider.js";

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
}
class Author {
  Id?: number;
  Name?: string;
}

class BudgetedProvider extends FakeStorageProvider {
  constructor(private readonly budget: number) {
    super();
  }
  override maxInFilterValues(): number {
    return this.budget;
  }
}

function buildModel() {
  const mb = new ModelBuilder();
  mb.entity(Author, (b) => {
    b.toList("Authors");
    b.property((e) => e.Name).isText();
  });
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
    b.hasOne(Author, (e) => e.Author)
      .withMany()
      .hasForeignKey((e) => e.AuthorId);
  });
  return mb.build();
}

function tokens(): () => string {
  let n = 0;
  return () => `r${n++}`;
}

describe("planIncludeLevel", () => {
  const model = buildModel();
  const blogType = model.findEntityType(Blog)!;
  const provider = new FakeStorageProvider();

  it("plans one itemsByIds read for a self-FK scalar navigation", () => {
    const nav = blogType.findNavigation("Author")!;

    const ops = planIncludeLevel(
      [
        { Id: 1, AuthorId: 5 },
        { Id: 2, AuthorId: 5 },
      ],
      nav,
      provider,
      tokens(),
    );

    expect(ops.length).toBe(1);
    const op = ops[0]!;
    expect(op.kind).toBe("itemsByIds");
    // Deduplicated — two parents, one distinct author.
    expect(op.kind === "itemsByIds" && op.ids).toEqual([5]);
    expect(op.kind === "itemsByIds" && op.source).toEqual({
      kind: "title",
      value: "Authors",
    });
  });

  it("plans nothing when no parent carries a foreign key", () => {
    const nav = blogType.findNavigation("Author")!;

    expect(
      planIncludeLevel([{ Id: 1 }, { Id: 2 }], nav, provider, tokens()),
    ).toEqual([]);
  });

  it("plans one filtered read per URL-budget chunk for an inverse-FK navigation", () => {
    const nav = blogType.findNavigation("Comments")!;
    const parents = Array.from({ length: 7 }, (_, i) => ({ Id: i + 1 }));

    const ops = planIncludeLevel(
      parents,
      nav,
      new BudgetedProvider(3),
      tokens(),
    );

    expect(ops.length).toBe(3);
    expect(ops.map((o) => o.clientToken)).toEqual(["r0", "r1", "r2"]);
    const chunks = ops.map((o) =>
      o.kind === "items" && o.options?.filter?.kind === "in"
        ? o.options.filter.values
        : [],
    );
    expect(chunks).toEqual([[1, 2, 3], [4, 5, 6], [7]]);
    expect(ops.every((o) => o.kind === "items" && o.pageSize === 1000)).toBe(
      true,
    );
    expect(
      ops.every(
        (o) =>
          o.kind === "items" &&
          o.options?.filter?.kind === "in" &&
          o.options.filter.column === "BlogId",
      ),
    ).toBe(true);
  });

  it("plans nothing for an inverse-FK navigation when no parent has an Id", () => {
    const nav = blogType.findNavigation("Comments")!;

    expect(
      planIncludeLevel([{ Title: "unsaved" }], nav, provider, tokens()),
    ).toEqual([]);
  });
});
