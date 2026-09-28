// Regression: a decorator-registered entity must NOT leak into a DbContext that
// doesn't declare it. Before the fix, ModelBuilder merged the module-global
// ENTITY_REGISTRY into every context, so a context that never `set()`s `ScPost`
// still built it — and its `@ManyToOne(() => ScBlog)` nav threw when that context
// didn't register ScBlog. See AdminDashboard / MigrationHistoryContext crash.
import { describe, it, expect } from "vitest";
import { DbContext } from "../../src/DbContext.js";
import { DbSet } from "../../src/DbSet.js";
import { ModelBuilder } from "../../src/ModelBuilder/ModelBuilder.js";
import {
  Entity,
  Key,
  TextField,
  ManyToOne,
  SpeelEntity,
} from "../../src/index.js";
import { FakeStorageProvider } from "./fakes/FakeStorageProvider.js";

@Entity({ list: "Sc_Blogs" })
class ScBlog extends SpeelEntity {
  @Key public Id?: number = undefined;
  @TextField({ required: true }) public Title: string | null = null;
}

@Entity({ list: "Sc_Posts" })
class ScPost extends SpeelEntity {
  @Key public Id?: number = undefined;
  @ManyToOne(() => ScBlog) public Blog: ScBlog | null = null;
  public BlogId: number | null = null;
}

@Entity({ list: "Sc_Widgets" })
class ScWidget extends SpeelEntity {
  @Key public Id?: number = undefined;
  @TextField() public Name: string | null = null;
}

/** Uses Post + Blog (the related pair). */
class PostCtx extends DbContext {
  public posts = this.set(ScPost);
  public blogs = this.set(ScBlog);
}

/** Unrelated context: declares only ScWidget. Must NOT build ScPost (which targets ScBlog). */
class WidgetCtx extends DbContext {
  public widgets = this.set(ScWidget);
}

const provider = (): FakeStorageProvider => new FakeStorageProvider();

describe("DbContext decorator-entity scoping", () => {
  it("an unrelated context does not build a decorator entity it never set()", () => {
    const ctx = new WidgetCtx({ provider: provider() });
    expect(ctx.model.findEntityType(ScWidget)).toBeDefined();
    expect(ctx.model.findEntityType(ScPost)).toBeUndefined(); // leaked before the fix → build threw
    expect(ctx.model.findEntityType(ScBlog)).toBeUndefined();
  });

  it("a context that set()s the related pair builds both, nav resolves", () => {
    const ctx = new PostCtx({ provider: provider() });
    expect(ctx.model.findEntityType(ScPost)).toBeDefined();
    expect(ctx.model.findEntityType(ScBlog)).toBeDefined();
    expect(ctx.posts).toBeInstanceOf(DbSet); // set() returns a real DbSet, not a proxy
    // FK synthesized from the @ManyToOne nav:
    expect(
      ctx.model
        .findEntityType(ScPost)!
        .properties.find((p) => p.propertyName === "BlogId"),
    ).toBeDefined();
  });

  it("a context that set()s only the child pulls the decorator-registered target in, transitively", () => {
    @Entity({ list: "Sc_Authors" })
    class ScAuthor extends SpeelEntity {
      @Key public override Id?: number = undefined;
      @TextField() public Name: string | null = null;
    }
    @Entity({ list: "Sc_Books" })
    class ScBook extends SpeelEntity {
      @Key public override Id?: number = undefined;
      @ManyToOne(() => ScAuthor) public Author2: ScAuthor | null = null;
      public Author2Id: number | null = null;
    }
    @Entity({ list: "Sc_Reviews" })
    class ScReview extends SpeelEntity {
      @Key public override Id?: number = undefined;
      @ManyToOne(() => ScBook) public Book: ScBook | null = null;
      public BookId: number | null = null;
    }
    class ReviewCtx extends DbContext {
      public reviews = this.set(ScReview);
    }
    const ctx = new ReviewCtx({ provider: provider() });
    expect(ctx.model.findEntityType(ScBook)).toBeDefined();
    expect(ctx.model.findEntityType(ScAuthor)).toBeDefined(); // two hops
    expect(ctx.model.findEntityType(ScWidget)).toBeUndefined(); // still no leak of the unreferenced
    expect(
      ctx.model.findEntityType(ScReview)!.findNavigation("Book")!.target.ctor,
    ).toBe(ScBook);
  });

  it("an unregistered, undecorated target still throws", () => {
    class Loose {
      Id?: number;
    }
    class Holder {
      Id?: number;
      LooseId?: number;
      L?: Loose;
    }
    class HCtx extends DbContext {
      protected onModelCreating(mb: ModelBuilder): void {
        mb.entity(Holder, (b) => {
          b.toList("Holders");
          b.hasOne(Loose, (h) => h.L)
            .withMany()
            .hasForeignKey((h) => h.LooseId);
        });
      }
    }
    expect(() => new HCtx({ provider: provider() }).model).toThrow(
      /targets unregistered entity Loose/,
    );
  });

  it("a shared registry builder does not carry one model's entities into another: the reference pull reads declared navigations only", () => {
    @Entity({ source: { kind: "provider", key: "principals" } })
    class ScPrincipal {
      @Key Id?: number = undefined;
      @TextField() Title?: string = undefined;
    }
    @Entity({ list: "Sc_Docs" })
    class ScDoc extends SpeelEntity {
      @Key public override Id?: number = undefined;
    }
    class ACtx extends DbContext {
      public principals = this.set(ScPrincipal);
      public docs = this.set(ScDoc);
    }
    class BCtx extends DbContext {
      public docs = this.set(ScDoc);
    }
    // ScDoc's registry builder is shared by both models. B's reference pull reads
    // ScDoc's DECLARED navigations only — Author/Editor target SiteUser — so
    // nothing about A's build (ScPrincipal included) reaches B's model.
    const ctxA = new ACtx({ provider: provider() });
    expect(ctxA.model.findEntityType(ScPrincipal)).toBeDefined();
    const ctxB = new BCtx({ provider: provider() });
    expect(ctxB.model.findEntityType(ScPrincipal)).toBeUndefined();
  });
});
