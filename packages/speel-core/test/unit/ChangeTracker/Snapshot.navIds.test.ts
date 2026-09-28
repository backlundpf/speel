import { describe, it, expect } from "vitest";
import { ModelBuilder } from "../../../src/ModelBuilder/ModelBuilder.js";
import { Snapshot } from "../../../src/ChangeTracker/Snapshot.js";

class Program {
  Id?: number;
  Title?: string;
}
class Project {
  Id?: number;
  Title?: string;
  Program?: Program;
  ProgramId?: number;
}

function projectEt() {
  const mb = new ModelBuilder();
  mb.entity(Program, (b) => {
    b.toList("Programs");
    b.property((e) => e.Title).isText();
  });
  mb.entity(Project, (b) => {
    b.toList("Projects");
    b.property((e) => e.Title).isText();
    b.hasOne(Program, (e) => e.Program).withMany();
  });
  return mb.build().findEntityType(Project)!;
}

describe("Snapshot nav ids", () => {
  it("captures a reference nav as its target id", () => {
    const et = projectEt();
    const p = Object.assign(new Project(), { Id: 1, Program: { Id: 7 } });
    const snap = Snapshot.take(p, et);
    expect(snap.navIds.Program).toBe(7);
  });
  it("captures null when the nav is unset", () => {
    const et = projectEt();
    const snap = Snapshot.take(new Project(), et);
    expect(snap.navIds.Program).toBeNull();
  });
});
