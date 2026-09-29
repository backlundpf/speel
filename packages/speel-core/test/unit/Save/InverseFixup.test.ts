import { describe, it, expect } from "vitest";
import { ModelBuilder } from "../../../src/ModelBuilder/ModelBuilder.js";
import { ChangeTracker } from "../../../src/ChangeTracker/ChangeTracker.js";
import { EntityState } from "../../../src/ChangeTracker/EntityEntry.js";
import { Snapshot } from "../../../src/ChangeTracker/Snapshot.js";
import { FakeStorageProvider } from "../fakes/FakeStorageProvider.js";

class Program {
  Id?: number;
  Title?: string;
  OwnedProjects?: Project[];
}
class Project {
  Id?: number;
  Title?: string;
  Program?: Program;
  ProgramId?: number;
}

function model() {
  const mb = new ModelBuilder();
  mb.entity(Program, (b) => {
    b.toList("Programs");
    b.property((e) => e.Title).isText();
    b.hasMany(Project, (e) => e.OwnedProjects).withOne((p) => p.Program);
  });
  mb.entity(Project, (b) => {
    b.toList("Projects");
    b.property((e) => e.Title).isText();
    b.hasOne(Program, (e) => e.Program).withMany((p) => p.OwnedProjects);
  });
  return mb.build();
}

describe("fixupInverseAsync", () => {
  it("sets the added child FK to the parent id and nulls the removed child", async () => {
    const m = model();
    const t = new ChangeTracker(m, new FakeStorageProvider());
    const a = Object.assign(new Project(), { Id: 1, ProgramId: 10 });
    const b = Object.assign(new Project(), { Id: 2 });
    const prog = Object.assign(new Program(), {
      Id: 10,
      OwnedProjects: [a] as Project[],
    });
    t.track(
      prog,
      EntityState.Unchanged,
      Snapshot.take(prog, m.findEntityType(Program)!),
    );
    t.track(
      a,
      EntityState.Unchanged,
      Snapshot.take(a, m.findEntityType(Project)!),
    );
    t.track(
      b,
      EntityState.Unchanged,
      Snapshot.take(b, m.findEntityType(Project)!),
    );
    prog.OwnedProjects = [b]; // remove a, add b
    const originals = t.captureInverseOriginals();
    await t.fixupInverseAsync(originals);
    expect(b.ProgramId).toBe(10); // added → parent id
    expect(a.ProgramId).toBeNull(); // removed → null (optional FK)
  });
});
