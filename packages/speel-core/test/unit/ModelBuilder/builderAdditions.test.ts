import { describe, it, expect } from "vitest";
import { ModelBuilder, SpeelEntity } from "../../../src/index.js";
import { TestPrincipal as Principal } from "../fakes/testPrincipals.js";

class Author extends SpeelEntity {}
class Book extends SpeelEntity {
  public Author: Author | null = null;
  public AuthorId: number | null = null;
}
class Late extends SpeelEntity {}
class Early extends SpeelEntity {
  public Late: Late | null = null;
  public LateId: number | null = null;
}

describe("builder additions", () => {
  it("hasOne/hasForeignKey/hasKey accept a string name", () => {
    const mb = new ModelBuilder();
    mb.entity(Principal, (b) =>
      b.toProviderSource({ kind: "provider", key: "principals" }),
    );
    mb.entity(Author, (b) => {
      b.toList("Authors");
      b.hasKey("Id");
    });
    mb.entity(Book, (b) => {
      b.toList("Books");
      b.hasOne(Author, "Author").withMany().hasForeignKey("AuthorId");
    });
    const book = mb.build().findEntityType(Book)!;
    expect(book.navigations().map((n) => n.name)).toContain("Author");
    expect(
      book.properties.find((p) => p.propertyName === "AuthorId"),
    ).toBeDefined();
  });

  it("hasOne accepts a thunk target, resolved at build (not eagerly)", () => {
    const mb = new ModelBuilder();
    mb.entity(Principal, (b) =>
      b.toProviderSource({ kind: "provider", key: "principals" }),
    );
    mb.entity(Early, (b) => {
      b.toList("Earlys");
      b.hasOne(() => Late, "Late")
        .withMany()
        .hasForeignKey("LateId");
    });
    mb.entity(Late, (b) => {
      b.toList("Lates");
    });
    const early = mb.build().findEntityType(Early)!;
    expect(
      early.navigations().find((n) => n.name === "Late")?.target.ctor,
    ).toBe(Late);
  });
});
