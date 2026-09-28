import { describe, it, expect } from "vitest";
import { ModelBuilder } from "../../../src/ModelBuilder/ModelBuilder.js";
import { NavigationConfigurationException } from "../../../src/errors.js";

describe("ModelBuilder finalize — navigation resolution", () => {
  class User {
    Id?: number;
    Title?: string;
  }
  class Tag {
    Id?: number;
    Name?: string;
  }
  class Comment {
    Id?: number;
    BlogId?: number;
    Blog?: Blog;
  }
  class Blog {
    Id?: number;
    Title?: string;
    AuthorId?: number;
    Author?: User;
    TagsId?: number[];
    Tags?: Tag[];
    Comments?: Comment[];
  }

  function buildModel() {
    const mb = new ModelBuilder();
    mb.entity(User, (b) => {
      b.toList("UserInfo");
      b.property((e) => e.Title).isText();
    });
    mb.entity(Tag, (b) => {
      b.toList("Tags");
      b.property((e) => e.Name).isText();
    });
    mb.entity(Comment, (b) => {
      b.toList("Comments");
      b.hasOne(Blog, (e) => e.Blog)
        .withMany((b2) => b2.Comments)
        .hasForeignKey((e) => e.BlogId);
    });
    mb.entity(Blog, (b) => {
      b.toList("Blogs");
      b.property((e) => e.Title).isText();
      b.hasOne(User, (e) => e.Author)
        .withMany()
        .hasForeignKey((e) => e.AuthorId);
      b.hasMany(Tag, (e) => e.Tags)
        .withMany()
        .hasForeignKey((e) => e.TagsId);
      b.hasMany(Comment, (e) => e.Comments)
        .withOne((c) => c.Blog)
        .hasForeignKey((c) => c.BlogId);
    });
    return mb.build();
  }

  it("builds without errors", () => {
    expect(() => buildModel()).not.toThrow();
  });

  it("Blog.Author nav has kind=reference, storage=self-fk-scalar, target=User", () => {
    const m = buildModel();
    const blog = m.findEntityType(Blog)!;
    const nav = blog.findNavigation("Author");
    expect(nav).toBeDefined();
    expect(nav!.kind).toBe("reference");
    expect(nav!.storage).toBe("self-fk-scalar");
    expect(nav!.target.ctor).toBe(User);
    expect(nav!.foreignKey.propertyName).toBe("AuthorId");
  });

  it("Blog.Tags nav has kind=collection, storage=self-fk-array; FK is multi-value", () => {
    const m = buildModel();
    const blog = m.findEntityType(Blog)!;
    const nav = blog.findNavigation("Tags");
    expect(nav!.kind).toBe("collection");
    expect(nav!.storage).toBe("self-fk-array");
    const fkConfig = nav!.foreignKey.config;
    if (fkConfig.kind === "Lookup") expect(fkConfig.multi).toBe(true);
    else throw new Error("expected Lookup/User config");
  });

  it("Blog.Comments nav has kind=collection, storage=inverse-fk; FK is Comment.BlogId", () => {
    const m = buildModel();
    const blog = m.findEntityType(Blog)!;
    const comment = m.findEntityType(Comment)!;
    const nav = blog.findNavigation("Comments");
    expect(nav!.kind).toBe("collection");
    expect(nav!.storage).toBe("inverse-fk");
    expect(nav!.foreignKey).toBe(comment.findProperty("BlogId"));
    expect(nav!.target.ctor).toBe(Comment);
  });

  it("Blog.Comments and Comment.Blog are inverses of each other", () => {
    const m = buildModel();
    const blog = m.findEntityType(Blog)!;
    const comment = m.findEntityType(Comment)!;
    const collectionNav = blog.findNavigation("Comments")!;
    const refNav = comment.findNavigation("Blog")!;
    expect(collectionNav.inverse).toBe(refNav);
    expect(refNav.inverse).toBe(collectionNav);
  });

  it("Property config.target is resolved to the target EntityType", () => {
    const m = buildModel();
    const blog = m.findEntityType(Blog)!;
    const authorIdProp = blog.findProperty("AuthorId")!;
    const config = authorIdProp.config;
    expect(config.kind === "Lookup").toBe(true);
    if (config.kind === "Lookup") {
      expect(config.target).toBe(m.findEntityType(User));
    }
  });

  it("throws NavigationConfigurationException for unregistered target", () => {
    class Stray {
      Id?: number;
    }
    class B {
      Id?: number;
      AuthorId?: number;
      Author?: Stray;
    }
    const mb = new ModelBuilder();
    mb.entity(B, (b) => {
      b.toList("Bs");
      b.hasOne(Stray, (e) => e.Author)
        .withMany()
        .hasForeignKey((e) => e.AuthorId);
    });
    expect(() => mb.build()).toThrow(NavigationConfigurationException);
  });

  it("throws when the FK name collides with a declared scalar property", () => {
    class U2 {
      Id?: number;
      Title?: string;
    }
    class B2 {
      Id?: number;
      AuthorId?: number;
      Author?: U2;
    }
    const mb = new ModelBuilder();
    mb.entity(U2, (b) => {
      b.toList("UserInfo");
      b.property((e) => e.Title).isText();
    });
    mb.entity(B2, (b) => {
      b.toList("Bs");
      b.property((e) => e.AuthorId).isNumber(); // declares AuthorId as a scalar...
      b.hasOne(U2, (e) => e.Author)
        .withMany()
        .hasForeignKey((e) => e.AuthorId); // ...then claims it as an FK
    });
    expect(() => mb.build()).toThrow(NavigationConfigurationException);
  });

  it("every nav carries a columnName defaulting to the nav name", () => {
    const m = buildModel();
    const blog = m.findEntityType(Blog)!;
    expect(blog.findNavigation("Author")!.columnName).toBe("Author");
    expect(blog.findNavigation("Tags")!.columnName).toBe("Tags");
  });
});
