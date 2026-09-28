import { describe, it, expect } from "vitest";
import { ModelBuilder, SpeelDocument } from "@speel/core";
import { projectModel } from "../src/snapshot.js";

class Program {
  Id?: number;
  Title?: string;
}
class Project {
  Id?: number;
  Title?: string;
  Created?: Date;
  Program?: Program;
  ProgramId?: number;
}

function model() {
  const mb = new ModelBuilder();
  mb.entity(Program, (b) => {
    b.toList("Programs", { template: "genericList" });
    b.property((e) => e.Title)
      .isText()
      .isRequired()
      .hasMaxLength(80);
  });
  mb.entity(Project, (b) => {
    b.toList("Projects");
    b.property((e) => e.Title)
      .isText()
      .isRequired();
    // a SharePoint built-in surfaced for reading — read-only, so never provisioned
    b.property((e) => e.Created)
      .isDateTime()
      .isReadOnly();
    b.hasOne(Program, (e) => e.Program)
      .withMany()
      .hasForeignKey((e) => e.ProgramId);
  });
  return mb.build();
}

describe("projectModel", () => {
  it("projects list-backed entities to ListSpec + FieldSpec[], excluding system columns", () => {
    const snap = projectModel(model());
    expect(snap.version).toBe(1);
    const projects = snap.entities.find((e) => e.list.title === "Projects")!;
    expect(projects.list).toEqual({
      title: "Projects",
      template: "genericList",
    });
    const names = projects.fields.map((f) => f.internalName);
    expect(names).toContain("Title"); // user field kept
    expect(names).toContain("Program"); // relationship field, named by the nav
    expect(names).not.toContain("ProgramId"); // FK-id companion is SharePoint-generated, not provisioned
    expect(names).not.toContain("Created"); // read-only → server-managed, excluded
    expect(names).not.toContain("ID"); // key excluded
    // entities sorted by title, fields sorted by internalName (stable diffs)
    expect(snap.entities.map((e) => e.list.title)).toEqual([
      "Programs",
      "Projects",
    ]);
    expect(projects.fields.map((f) => f.internalName)).toEqual(
      [...names].sort(),
    );
  });

  it("maps a required single-line text with maxLength", () => {
    const programs = projectModel(model()).entities.find(
      (e) => e.list.title === "Programs",
    )!;
    expect(programs.fields.find((f) => f.internalName === "Title")).toEqual({
      kind: "Text",
      internalName: "Title",
      multiline: false,
      displayName: "Title",
      required: true,
      maxLength: 80,
    });
  });

  it("projects a relationship as a Lookup field named by the navigation (not the FK id)", () => {
    const projects = projectModel(model()).entities.find(
      (e) => e.list.title === "Projects",
    )!;
    expect(
      projects.fields.find((f) => f.internalName === "Program"),
    ).toMatchObject({
      kind: "Lookup",
      internalName: "Program",
      list: "Programs",
      showField: "Title",
      multi: false,
    });
    expect(
      projects.fields.find((f) => f.internalName === "ProgramId"),
    ).toBeUndefined();
  });
});

class Contract extends SpeelDocument {
  Title?: string;
  Summary?: string;
  FileType?: string;
}
class Owner {
  Id?: number;
  Title?: string;
}
/** A principal entity, as a core-only app or @speel/identity declares one: a provider source. */
class Person {
  Id?: number;
  Title?: string;
  LoginName?: string;
}
class Asset {
  Id?: number;
  Title?: string;
  Owner?: Owner;
  OwnerId?: number;
}

function documentModel() {
  const mb = new ModelBuilder();
  // With a principal entity registered, SpeelEntity's Author/Editor/CheckedOutBy are
  // navigations — the case where a snapshot has the most to exclude.
  mb.entity(Person, (b) => {
    b.toProviderSource({ kind: "provider", key: "principals" });
    b.property((p) => p.Title).isText();
    b.property((p) => p.LoginName).isText();
  });
  mb.entity(Contract, (b) => {
    b.toList("Contracts", { template: "documentLibrary" });
    b.property((e) => e.Title).isText();
    b.property((e) => e.Summary).isText();
    // a SharePoint built-in the model reads but must never create
    b.property((e) => e.FileType)
      .isText()
      .hasColumnName("File_x0020_Type")
      .isReadOnly();
  });
  return mb.build();
}

describe("projectModel person columns", () => {
  it("provisions a lookup to a provider-source entity as a User field, and never the entity itself", () => {
    class Doc {
      Id?: number;
      Title?: string;
      OwnerId?: number;
      Owner?: Person;
      ReviewersId?: number[];
      Reviewers?: Person[];
    }
    const mb = new ModelBuilder();
    mb.entity(Person, (b) => {
      b.toProviderSource({ kind: "provider", key: "principals" });
      b.property((p) => p.Title).isText();
    });
    mb.entity(Doc, (b) => {
      b.toList("Docs");
      b.property((d) => d.Title).isText();
      b.hasOne(Person, (d) => d.Owner)
        .withMany()
        .hasForeignKey((d) => d.OwnerId);
      b.hasMany(Person, (d) => d.Reviewers)
        .withMany()
        .hasForeignKey((d) => d.ReviewersId);
    });
    const snap = projectModel(mb.build());
    expect(snap.entities.map((e) => e.list.title)).toEqual(["Docs"]);
    const docs = snap.entities[0]!;
    expect(docs.fields.find((f) => f.internalName === "Owner")).toEqual({
      internalName: "Owner",
      displayName: "Owner",
      kind: "User",
      showField: "Title",
      multi: false,
    });
    expect(docs.fields.find((f) => f.internalName === "Reviewers")).toEqual({
      internalName: "Reviewers",
      displayName: "Reviewers",
      kind: "User",
      showField: "Title",
      multi: true,
    });
  });
});

class Ticket {
  Id?: number;
  Title?: string;
  Status?: string;
}

describe("projectModel Choice fields", () => {
  it("a literal Choice snapshots its list and its format", () => {
    const mb = new ModelBuilder();
    mb.entity(Ticket, (b) => {
      b.toList("Tickets");
      b.property((e) => e.Title).isText();
      b.property((e) => e.Status).isChoice({
        options: ["A", "B"],
        radioButtons: true,
      });
    });
    const tickets = projectModel(mb.build()).entities.find(
      (e) => e.list.title === "Tickets",
    )!;
    expect(tickets.fields.find((f) => f.internalName === "Status")).toEqual({
      internalName: "Status",
      displayName: "Status",
      kind: "Choice",
      multi: false,
      choices: ["A", "B"],
      fillIn: false,
      displayAs: "RadioButtons",
    });
  });

  it("a Choice whose list is not literal snapshots as an open column", () => {
    const mb = new ModelBuilder();
    mb.entity(Ticket, (b) => {
      b.toList("Tickets");
      b.property((e) => e.Title).isText();
      b.property((e) => e.Status).isChoice({
        options: () => ["A"],
      });
    });
    const tickets = projectModel(mb.build()).entities.find(
      (e) => e.list.title === "Tickets",
    )!;
    expect(tickets.fields.find((f) => f.internalName === "Status")).toEqual({
      internalName: "Status",
      displayName: "Status",
      kind: "Choice",
      multi: false,
      choices: [],
      fillIn: true,
      displayAs: "Dropdown",
    });
  });

  it("a Choice declaring a literal list AND a query snapshots as an open column", () => {
    const mb = new ModelBuilder();
    mb.entity(Ticket, (b) => {
      b.toList("Tickets");
      b.property((e) => e.Title).isText();
      b.property((e) => e.Status).isChoice({
        options: ["A", "B"],
        optionsQueryAsync: async () => ["Z"],
      });
    });
    const tickets = projectModel(mb.build()).entities.find(
      (e) => e.list.title === "Tickets",
    )!;
    // The query offers values outside ["A", "B"]; the column must accept them.
    expect(tickets.fields.find((f) => f.internalName === "Status")).toEqual({
      internalName: "Status",
      displayName: "Status",
      kind: "Choice",
      multi: false,
      choices: [],
      fillIn: true,
      displayAs: "Dropdown",
    });
  });
});

describe("projectModel Json fields", () => {
  it("projects a Json property to a multiline Text (Note) column", () => {
    class PayloadShape {
      Title?: string;
    }
    class Ticket2 {
      Id?: number;
      Title?: string;
      Payload?: unknown;
    }
    const mb = new ModelBuilder();
    // The shape a Json field's column holds — an embedded entity type, same as
    // `@JsonShape` declares, built fluently here (mb.shape shipped with the
    // embedded source kind, ahead of this task).
    mb.shape(PayloadShape, (b) => {
      b.property((p) => p.Title).isText();
    });
    mb.entity(Ticket2, (b) => {
      b.toList("Tickets2");
      b.property((e) => e.Title).isText();
      // Task 5's `.isJson()` verb doesn't exist yet — declare the property with
      // the fluent builder, then overwrite its config by hand. The point here is
      // the projection (fieldConfigToSpec), not the authoring surface.
      b.property((e) => e.Payload).isText();
    });
    const model = mb.build();
    const shape = model.findEntityType(PayloadShape as never)!;
    const et = model.findEntityType(Ticket2 as never)!;
    const payload = et.properties.find((p) => p.propertyName === "Payload")!;
    payload.config = { kind: "Json", shape, multi: false };
    const tickets2 = projectModel(model).entities.find(
      (e) => e.list.title === "Tickets2",
    )!;
    expect(
      tickets2.fields.find((f) => f.internalName === "Payload"),
    ).toMatchObject({
      kind: "Text",
      multiline: true,
    });
  });
});

describe("projectModel read-only exclusion", () => {
  it("never provisions SpeelEntity's system columns or the Author/Editor navs", () => {
    const snap = projectModel(documentModel());
    const contracts = snap.entities.find((e) => e.list.title === "Contracts")!;
    const names = contracts.fields.map((f) => f.internalName);
    for (const sys of [
      "FSObjType",
      "FileDirRef",
      "FileLeafRef",
      "FileRef",
      "File/Length",
      "Created",
      "Modified",
      "Author",
      "AuthorId",
      "Editor",
      "EditorId",
      // Checked-out-to: a library built-in, never ours to create.
      "CheckoutUser",
      "CheckoutUserId",
      "CheckedOutBy",
      "CheckedOutById",
    ]) {
      expect(names).not.toContain(sys);
    }
    expect(names).toContain("Title");
  });

  it("excludes a read-only column and keeps the writable ones", () => {
    const contracts = projectModel(documentModel()).entities.find(
      (e) => e.list.title === "Contracts",
    )!;
    const names = contracts.fields.map((f) => f.internalName);
    expect(names).not.toContain("File_x0020_Type");
    expect(names).toEqual(["Summary", "Title"]);
  });

  it("carries a navigation's index onto its provisioned lookup column", () => {
    const mb = new ModelBuilder();
    mb.entity(Owner, (b) => {
      b.toList("Owners");
      b.property((e) => e.Title).isText();
    });
    mb.entity(Asset, (b) => {
      b.toList("Assets");
      b.property((e) => e.Title).isText();
      b.hasOne(Owner, (e) => e.Owner)
        .withMany()
        .hasForeignKey((e) => e.OwnerId)
        .isIndexed();
    });
    const assets = projectModel(mb.build()).entities.find(
      (e) => e.list.title === "Assets",
    )!;
    // The nav's isIndexed() lands on the FK property; the provisioned column is the
    // lookup itself, so that is where the index belongs.
    expect(assets.fields.find((f) => f.internalName === "Owner")).toMatchObject(
      {
        kind: "Lookup",
        indexed: true,
      },
    );
  });

  it("omits indexed entirely for an unindexed navigation", () => {
    const mb = new ModelBuilder();
    mb.entity(Owner, (b) => {
      b.toList("Owners");
      b.property((e) => e.Title).isText();
    });
    mb.entity(Asset, (b) => {
      b.toList("Assets");
      b.hasOne(Owner, (e) => e.Owner)
        .withMany()
        .hasForeignKey((e) => e.OwnerId);
    });
    const assets = projectModel(mb.build()).entities.find(
      (e) => e.list.title === "Assets",
    )!;
    // Absent, not `indexed: false` — the snapshot is JSON-compared, so a defaulted
    // key would alter every existing baseline.
    expect(
      assets.fields.find((f) => f.internalName === "Owner"),
    ).not.toHaveProperty("indexed");
  });

  it("excludes a read-only navigation", () => {
    const mb = new ModelBuilder();
    mb.entity(Owner, (b) => {
      b.toList("Owners");
      b.property((e) => e.Title).isText();
    });
    mb.entity(Asset, (b) => {
      b.toList("Assets");
      b.property((e) => e.Title).isText();
      b.hasOne(Owner, (e) => e.Owner)
        .withMany()
        .hasForeignKey((e) => e.OwnerId)
        .isReadOnly();
    });
    const assets = projectModel(mb.build()).entities.find(
      (e) => e.list.title === "Assets",
    )!;
    expect(assets.fields.map((f) => f.internalName)).toEqual(["Title"]);
  });
});
