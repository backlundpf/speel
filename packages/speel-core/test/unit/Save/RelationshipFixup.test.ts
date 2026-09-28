import { describe, it, expect } from "vitest";
import { ModelBuilder } from "../../../src/ModelBuilder/ModelBuilder.js";
import { ChangeTracker } from "../../../src/ChangeTracker/ChangeTracker.js";
import { EntityState } from "../../../src/ChangeTracker/EntityEntry.js";
import { Snapshot } from "../../../src/ChangeTracker/Snapshot.js";

class Program {
  Id?: number;
  Title?: string;
}
class Tag {
  Id?: number;
  Title?: string;
}
class Project {
  Id?: number;
  Title?: string;
  Program?: Program;
  ProgramId?: number;
  Tags?: Tag[];
  TagsId?: number[];
}

function model() {
  const mb = new ModelBuilder();
  mb.entity(Program, (b) => {
    b.toList("Programs");
    b.property((e) => e.Title).isText();
  });
  mb.entity(Tag, (b) => {
    b.toList("Tags");
    b.property((e) => e.Title).isText();
  });
  mb.entity(Project, (b) => {
    b.toList("Projects");
    b.property((e) => e.Title).isText();
    b.hasOne(Program, (e) => e.Program).withMany();
    b.hasMany(Tag, (e) => e.Tags).withMany();
  });
  return mb.build();
}

describe("fixupRelationships (self-fk)", () => {
  it("derives the FK from a set nav on an Added entity", () => {
    const t = new ChangeTracker(model());
    const p = Object.assign(new Project(), {
      Title: "New",
      Program: { Id: 5 },
      Tags: [{ Id: 1 }, { Id: 2 }],
    });
    t.track(p, EntityState.Added);
    t.fixupRelationships();
    expect(p.ProgramId).toBe(5);
    expect(p.TagsId).toEqual([1, 2]);
  });
  it("derives the FK only when the nav changed (Modified)", () => {
    const m = model();
    const t = new ChangeTracker(m);
    const p = Object.assign(new Project(), {
      Id: 9,
      Program: { Id: 5 },
      ProgramId: 5,
    });
    t.track(
      p,
      EntityState.Unchanged,
      Snapshot.take(p, m.findEntityType(Project)!),
    );
    p.Program = { Id: 6 };
    t.fixupRelationships();
    expect(p.ProgramId).toBe(6);
  });
  it("clears the FK when the nav is cleared", () => {
    const m = model();
    const t = new ChangeTracker(m);
    const p = Object.assign(new Project(), {
      Id: 9,
      Program: { Id: 5 },
      ProgramId: 5,
    });
    t.track(
      p,
      EntityState.Unchanged,
      Snapshot.take(p, m.findEntityType(Project)!),
    );
    p.Program = null as never;
    t.fixupRelationships();
    expect(p.ProgramId).toBeNull();
  });
  it("leaves a directly-edited FK alone when the nav did not change", () => {
    const m = model();
    const t = new ChangeTracker(m);
    const p = Object.assign(new Project(), {
      Id: 9,
      Program: { Id: 5 },
      ProgramId: 5,
    });
    t.track(
      p,
      EntityState.Unchanged,
      Snapshot.take(p, m.findEntityType(Project)!),
    );
    p.ProgramId = 6;
    t.fixupRelationships();
    expect(p.ProgramId).toBe(6);
  });
});
