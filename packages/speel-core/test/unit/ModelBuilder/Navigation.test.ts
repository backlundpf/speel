import { describe, it, expect } from "vitest";
import { ReferenceNavigationBuilder } from "../../../src/ModelBuilder/navigations/ReferenceNavigationBuilder.js";
import { CollectionNavigationBuilder } from "../../../src/ModelBuilder/navigations/CollectionNavigationBuilder.js";
import { EntityTypeBuilder } from "../../../src/ModelBuilder/EntityTypeBuilder.js";

class User {
  Id?: number;
  Blogs?: Blog[];
}
class Tag {
  Id?: number;
}
class Comment {
  Id?: number;
  BlogId?: number;
  Blog?: Blog;
}
class Blog {
  Id?: number;
  AuthorId?: number;
  Author?: User;
  TagsId?: number[];
  Comments?: Comment[];
}

describe("ReferenceNavigationBuilder", () => {
  it("withMany() → self-FK reference config", () => {
    const b = new ReferenceNavigationBuilder<Blog, User>("Author", User);
    b.withMany().hasForeignKey((e) => e.AuthorId);
    expect(b.getConfig()).toMatchObject({
      name: "Author",
      kind: "reference",
      targetCtor: User,
      foreignKeySide: "self",
      isMultiValue: false,
      foreignKeyName: "AuthorId",
    });
  });
  it("captures the inverse nav name when supplied", () => {
    const b = new ReferenceNavigationBuilder<Blog, User>("Author", User);
    b.withMany((u) => u.Blogs).hasForeignKey((e) => e.AuthorId);
    expect(b.getConfig().inverseNavName).toBe("Blogs");
  });
  it("withOne() → child-FK (one-to-one) config", () => {
    class Profile {
      Id?: number;
      User?: User;
    }
    const b = new ReferenceNavigationBuilder<Profile, User>("User", User);
    b.withOne();
    expect(b.getConfig()).toMatchObject({
      foreignKeySide: "child",
      isMultiValue: false,
    });
  });
});

describe("CollectionNavigationBuilder", () => {
  it("withMany() → self-FK multi-value config", () => {
    const b = new CollectionNavigationBuilder<Blog, Tag>("Tags", Tag);
    b.withMany().hasForeignKey((e) => e.TagsId); // FK selector typing covered in types.test-d.ts
    expect(b.getConfig()).toMatchObject({
      name: "Tags",
      kind: "collection",
      targetCtor: Tag,
      foreignKeySide: "self",
      isMultiValue: true,
    });
  });
  it("withOne() → child-FK inverse-collection config", () => {
    const b = new CollectionNavigationBuilder<Blog, Comment>(
      "Comments",
      Comment,
    );
    b.withOne((c) => c.Blog).hasForeignKey((c) => c.BlogId);
    expect(b.getConfig()).toMatchObject({
      name: "Comments",
      inverseNavName: "Blog",
      foreignKeyName: "BlogId",
      foreignKeySide: "child",
      isMultiValue: false,
    });
  });
});

describe("EntityTypeBuilder hasOne/hasMany", () => {
  it("hasOne captures a reference config with the target ctor", () => {
    const etb = new EntityTypeBuilder<Blog>(Blog);
    etb.toList("Blogs");
    etb
      .hasOne(User, (e) => e.Author)
      .withMany()
      .hasForeignKey((e) => e.AuthorId);
    const cfgs = etb.getNavConfigs();
    expect(cfgs.length).toBe(1);
    expect(cfgs[0]!).toMatchObject({
      name: "Author",
      kind: "reference",
      targetCtor: User,
    });
  });
  it("hasMany captures a collection config", () => {
    const etb = new EntityTypeBuilder<Blog>(Blog);
    etb.toList("Blogs");
    etb
      .hasMany(Comment, (e) => e.Comments)
      .withOne((c) => c.Blog)
      .hasForeignKey((c) => c.BlogId);
    expect(etb.getNavConfigs()[0]!).toMatchObject({
      name: "Comments",
      kind: "collection",
    });
  });
});
