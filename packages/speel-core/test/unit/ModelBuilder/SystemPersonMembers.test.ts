import { describe, it, expect } from "vitest";
import { ModelBuilder } from "../../../src/ModelBuilder/ModelBuilder.js";
import { DbContext } from "../../../src/DbContext.js";
import { SpeelEntity } from "../../../src/SpeelEntity.js";
import { SpeelDocument } from "../../../src/SpeelDocument.js";
import { SiteUser } from "../../../src/SiteUser.js";
import { Principal } from "../../../src/Principal.js";
import { Entity, Key, ManyToOne, TextField } from "../../../src/index.js";
import { FakeStorageProvider } from "../fakes/FakeStorageProvider.js";
import { planIncludeLevel } from "../../../src/Query/IncludeResolver.js";

class Item extends SpeelEntity {
  Title?: string;
  Owner?: SiteUser;
  OwnerId?: number;
}
class File extends SpeelDocument {}

describe("SpeelEntity's person members target SiteUser", () => {
  it("a fluent entity gets Author/Editor navs to SiteUser with read-only synthesized FKs — and SiteUser joins the model by reference", () => {
    const mb = new ModelBuilder();
    mb.entity(Item, (b) => {
      b.toList("Items");
      b.property((i) => i.Title).isText();
      b.hasOne(SiteUser, (i) => i.Owner)
        .withMany()
        .hasForeignKey((i) => i.OwnerId);
    });
    mb.entity(File, (b) => {
      b.toList("Files");
    });
    const m = mb.build();
    expect(m.findEntityType(SiteUser)).toBeDefined();
    expect(m.findEntityType(Principal)).toBeUndefined(); // referenced by nothing
    const item = m.findEntityType(Item)!;
    for (const nav of ["Author", "Editor"]) {
      const n = item.findNavigation(nav)!;
      expect(n.target).toBe(m.findEntityType(SiteUser));
      expect(n.foreignKey.propertyName).toBe(`${nav}Id`);
      expect(n.foreignKey.config.kind).toBe("Lookup");
      expect(n.foreignKey.readOnly).toBe(true);
    }
    for (const col of ["Created", "Modified"])
      expect(item.findProperty(col)!.readOnly).toBe(true);
    for (const col of ["FSObjType", "FileDirRef", "FileLeafRef", "FileRef"])
      expect(item.findProperty(col)!.visible).toBe(false);
    const file = m.findEntityType(File)!;
    expect(file.findNavigation("CheckedOutBy")!.target).toBe(
      m.findEntityType(SiteUser),
    );
    expect(file.findProperty("CheckedOutById")!.columnName).toBe(
      "CheckoutUserId",
    );
    expect(file.findProperty("FileSize")!.columnName).toBe("File/Length");
    expect(file.source).toMatchObject({
      kind: "list",
      provisioning: { template: "documentLibrary" },
    });
    // Inheritance-depth order: the entity's own members first, inherited system
    // members last — for properties and navigations alike.
    const itemOrder = item.properties.map((p) => p.propertyName);
    expect(itemOrder.indexOf("Title")).toBeLessThan(
      itemOrder.indexOf("Created"),
    );
    const itemNavs = item.navigations().map((n) => n.name);
    expect(itemNavs.indexOf("Owner")).toBeLessThan(itemNavs.indexOf("Author"));
    const fileOrder = file.properties.map((p) => p.propertyName);
    expect(fileOrder.indexOf("FileSize")).toBeLessThan(
      fileOrder.indexOf("Created"),
    ); // SpeelDocument's (depth 1) before SpeelEntity's (depth 2)
  });

  it("a decorated entity gets the same", () => {
    @Entity({ list: "Notes" })
    class Note extends SpeelEntity {
      @Key override Id?: number = undefined;
      @TextField() Title?: string = undefined;
    }
    class Ctx extends DbContext {
      notes = this.set(Note);
    }
    const ctx = new Ctx({ provider: new FakeStorageProvider() });
    const et = ctx.model.findEntityType(Note)!;
    expect(et.findNavigation("Author")!.target.ctor).toBe(SiteUser);
    const order = et.properties.map((p) => p.propertyName);
    expect(order.indexOf("Title")).toBeLessThan(order.indexOf("Created"));
  });

  it("an app re-points Author at its own SiteUser subclass, and the include reads the siteUsers source", () => {
    @Entity({ source: { kind: "provider", key: "siteUsers" } })
    class Employee extends SiteUser {
      @TextField() Department?: string = undefined;
    }
    abstract class OurEntity extends SpeelEntity {}
    class Ticket extends OurEntity {
      Title?: string;
    }
    class Ctx extends DbContext {
      tickets = this.set(Ticket);
      protected onModelCreating(mb: ModelBuilder): void {
        mb.entity(Ticket, (b) => {
          b.toList("Tickets");
          b.property((t) => t.Title).isText();
          // String selectors: the inherited `Author` is typed SiteUser, and Employee narrows it.
          b.hasOne(Employee, "Author")
            .withMany()
            .hasForeignKey("AuthorId")
            .isReadOnly();
        });
      }
    }
    const fake = new FakeStorageProvider();
    const ctx = new Ctx({ provider: fake });
    const nav = ctx.model.findEntityType(Ticket)!.findNavigation("Author")!;
    expect(nav.target.ctor).toBe(Employee);
    expect(ctx.model.findEntityType(Employee)!.columnNames).toContain(
      "Department",
    );
    const [op] = planIncludeLevel(
      [{ Id: 1, AuthorId: 7 }],
      nav,
      fake,
      () => "t0",
    );
    expect(op).toMatchObject({
      kind: "itemsByIds",
      source: { kind: "provider", key: "siteUsers" },
      ids: [7],
    });
  });

  it("an abstract base re-points Author once, and every leaf — fluent or decorated, in any model — inherits the re-point", () => {
    @Entity({ source: { kind: "provider", key: "siteUsers" } })
    class Employee extends SiteUser {
      @TextField() Department?: string = undefined;
    }
    abstract class AppEntity extends SpeelEntity {
      @ManyToOne(() => Employee, { readOnly: true, foreignKey: "AuthorId" })
      override readonly Author?: Employee = undefined;
    }
    class Ticket extends AppEntity {
      Title?: string;
    }
    @Entity({ list: "Memos" })
    class Memo extends AppEntity {
      @Key override Id?: number = undefined;
      @TextField() Title?: string = undefined;
    }
    class Ctx extends DbContext {
      tickets = this.set(Ticket);
      memos = this.set(Memo);
      protected onModelCreating(mb: ModelBuilder): void {
        mb.entity(Ticket, (b) => {
          b.toList("Tickets");
          b.property((t) => t.Title).isText(); // no Author re-point on the leaf
        });
      }
    }
    class MemoOnlyCtx extends DbContext {
      memos = this.set(Memo);
    }
    const expectRePointed = (ctx: DbContext, leaf: Function): void => {
      const et = ctx.model.findEntityType(leaf)!;
      const author = et.findNavigation("Author")!;
      expect(author.target.ctor).toBe(Employee);
      expect(author.readOnly).toBe(true);
      expect(author.foreignKey.propertyName).toBe("AuthorId");
      expect(et.findNavigation("Editor")!.target.ctor).toBe(SiteUser);
      expect(ctx.model.findEntityType(Employee)).toBeDefined();
      expect(ctx.model.findEntityType(SiteUser)).toBeDefined();
      expect(ctx.model.findEntityType(Principal)).toBeUndefined();
    };
    const ctx = new Ctx({ provider: new FakeStorageProvider() });
    expectRePointed(ctx, Ticket);
    expectRePointed(ctx, Memo);
    // A second model over the same (shared, registry-held) builders answers the same.
    expectRePointed(
      new MemoOnlyCtx({ provider: new FakeStorageProvider() }),
      Memo,
    );
  });

  it("no principal entity is registered for an entity that does not extend SpeelEntity", () => {
    class Bare {
      Id?: number;
      Title?: string;
    }
    const mb = new ModelBuilder();
    mb.entity(Bare, (b) => {
      b.toList("Bare");
      b.property((x) => x.Title).isText();
    });
    const m = mb.build();
    expect(m.findEntityType(SiteUser)).toBeUndefined();
  });
});
