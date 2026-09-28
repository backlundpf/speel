import { describe, it, expect } from "vitest";
import {
  DbContext,
  ModelBuilder,
  initSpeelDbContext,
} from "../../../src/index.js";
import { FakeStorageProvider } from "../fakes/FakeStorageProvider.js";
import type { IListHandle } from "../../../src/types.js";

class Program {
  Id?: number;
  Title: string | null = null;
}
class Project {
  Id?: number;
  Title: string | null = null;
  Program: Program | null = null;
  ProgramId: number | null = null;
}

class Ctx extends DbContext {
  public projects = this.set(Project);
  public programs = this.set(Program);
  protected onModelCreating(b: ModelBuilder): void {
    b.entity(Program, (e) => {
      e.toList("Programs");
      e.property((x) => x.Title).isText();
    });
    b.entity(Project, (e) => {
      e.toList("Projects");
      e.property((x) => x.Title).isText();
      e.hasOne(Program, (x) => x.Program).withMany();
    });
  }
}

const projectsHandle: IListHandle = { kind: "title", value: "Projects" };

describe("self-fk persistence e2e", () => {
  it("saves ProgramId derived from the picked Program object", async () => {
    const provider = new FakeStorageProvider();
    const ctx = initSpeelDbContext(Ctx, (b) => b.useProvider(provider));
    const p = new Project();
    p.Title = "New";
    p.Program = Object.assign(new Program(), { Id: 5, Title: "Alpha" }); // set the NAV, not the FK
    ctx.projects.add(p);
    await ctx.saveChangesAsync();
    // read ProgramId back from the provider and assert it is 5
    const saved = await provider.getItemsByIdsAsync(
      projectsHandle,
      [p.Id!],
      ["ProgramId"],
    );
    expect((saved[0] as { ProgramId?: number }).ProgramId).toBe(5);
  });
});
