import { describe, it, expect, beforeEach } from "vitest";
import { Entity, SpeelEntity, Key, ModelBuilder } from "../../../src/index.js";
import { ENTITY_REGISTRY } from "../../../src/ModelBuilder/EntityTypeBuilder.js";
import {
  ManyToOne,
  OneToOne,
  OneToMany,
  ManyToMany,
} from "../../../src/index.js";
import { SiteUser } from "../../../src/SiteUser.js";

function navOf(ctor: any, name: string) {
  return ENTITY_REGISTRY.get(ctor)!
    .getNavConfigs()
    .find((c) => c.name === name)!;
}

beforeEach(() => ENTITY_REGISTRY.clear()); // isolate: decorators register globally

describe("@Key", () => {
  it("drives key resolution (overriding the Id convention)", () => {
    @Entity({ list: "Widgets" })
    class Widget extends SpeelEntity {
      @Key public Sku: number | null = null;
    }
    const et = ENTITY_REGISTRY.get(Widget)!.build();
    const key = et.properties.find((p) => p.key);
    expect(key?.propertyName).toBe("Sku");
  });
});

describe("relationship decorators (replay → INavConfig)", () => {
  it("@ManyToOne / @ManyToMany put the FK on self; @OneToMany / @OneToOne on the child", () => {
    class Tag extends SpeelEntity {}
    @Entity({ list: "Posts" })
    class Post extends SpeelEntity {
      @ManyToOne(() => Blog, {
        inverse: (b: any) => b.Posts,
        required: true,
        displayName: "Blog",
        foreignKey: "BlogId",
      })
      public Blog: Blog | null = null;
      @ManyToMany(() => Tag, { foreignKey: "TagsId" })
      public Tags: Tag[] | null = null;
    }
    @Entity({ list: "Blogs" })
    class Blog extends SpeelEntity {
      @OneToMany(() => Post, { inverse: (p: any) => p.Blog })
      public Posts: Post[] | null = null;
      @OneToOne(() => Tag, { inverse: (t: any) => t.Banner })
      public Banner: Tag | null = null;
    }

    const blogNav = navOf(Post, "Blog");
    expect(blogNav).toMatchObject({
      kind: "reference",
      foreignKeySide: "self",
      isMultiValue: false,
      inverseNavName: "Posts",
      foreignKeyName: "BlogId",
    });
    expect(blogNav.fieldState.required).toBe(true);
    expect(blogNav.fieldState.displayName).toBe("Blog");

    expect(navOf(Post, "Tags")).toMatchObject({
      kind: "collection",
      foreignKeySide: "self",
      isMultiValue: true,
      foreignKeyName: "TagsId",
    });
    expect(navOf(Blog, "Posts")).toMatchObject({
      kind: "collection",
      foreignKeySide: "child",
      isMultiValue: false,
      inverseNavName: "Blog",
    });
    expect(navOf(Blog, "Banner")).toMatchObject({
      kind: "reference",
      foreignKeySide: "child",
      isMultiValue: false,
    });
  });
});

describe("inverse pairing (decorator ↔ decorator, resolved)", () => {
  it("@OneToMany ↔ @ManyToOne pair and synthesize the child FK", () => {
    @Entity({ list: "Blogs" })
    class Blog extends SpeelEntity {
      @Key public override Id?: number = undefined;
      @OneToMany(() => Comment, { inverse: (c: any) => c.Blog })
      public Comments: Comment[] | null = null;
    }
    @Entity({ list: "Comments" })
    class Comment extends SpeelEntity {
      @Key public override Id?: number = undefined;
      @ManyToOne(() => Blog, { inverse: (b: any) => b.Comments })
      public Blog: Blog | null = null;
      public BlogId: number | null = null;
    }
    const mb = new ModelBuilder();
    // The registry was cleared above, so SpeelEntity's Author/Editor target — core's
    // SiteUser — cannot be pulled by reference and is registered here with its source.
    mb.entity(SiteUser, (b) =>
      b.toProviderSource({ kind: "provider", key: "siteUsers" }),
    );
    mb.entity(Blog); // explicit registration: pulls the @Entity-built builder from the registry
    mb.entity(Comment);
    const model = mb.build();
    const comment = model.findEntityType(Comment)!;
    const blog = model.findEntityType(Blog)!;
    // child FK synthesized on Comment from the inverse name:
    expect(
      comment.properties.find((p) => p.propertyName === "BlogId"),
    ).toBeDefined();
    // both navs present and paired:
    expect(
      comment.navigations().find((n) => n.name === "Blog")?.inverse?.name,
    ).toBe("Comments");
    expect(
      blog.navigations().find((n) => n.name === "Comments")?.inverse?.name,
    ).toBe("Blog");
  });
});
