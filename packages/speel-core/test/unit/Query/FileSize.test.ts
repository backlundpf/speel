import { describe, it, expect, beforeEach } from "vitest";
import { ModelBuilder } from "../../../src/ModelBuilder/ModelBuilder.js";
import { Query } from "../../../src/Query/Query.js";
import { QueryExecutor } from "../../../src/Query/QueryExecutor.js";
import { ChangeTracker } from "../../../src/ChangeTracker/ChangeTracker.js";
import { DbSet } from "../../../src/DbSet.js";
import { SaveExecutor } from "../../../src/Save/SaveExecutor.js";
import { SpeelEntity } from "../../../src/SpeelEntity.js";
import { SpeelDocument } from "../../../src/SpeelDocument.js";
import { FakeStorageProvider } from "../fakes/FakeStorageProvider.js";
import type { IListHandle } from "../../../src/types.js";
import { TestPrincipal as Principal } from "../fakes/testPrincipals.js";

class Report extends SpeelDocument {
  Title: string | null = null;
}
class Task extends SpeelEntity {
  Title: string | null = null;
}

const reports: IListHandle = { kind: "title", value: "Reports" };
const tasks: IListHandle = { kind: "title", value: "Tasks" };

function buildModel() {
  const mb = new ModelBuilder();
  mb.entity(Principal, (b) =>
    b.toProviderSource({ kind: "provider", key: "principals" }),
  );
  mb.entity(Report, (b) => {
    b.toList("Reports");
    b.property((e) => e.Title).isText();
  });
  mb.entity(Task, (b) => {
    b.toList("Tasks");
    b.property((e) => e.Title).isText();
  });
  return mb.build();
}

describe("SpeelDocument.FileSize through a query", () => {
  let provider: FakeStorageProvider;
  let model: ReturnType<typeof buildModel>;
  let query: () => Query<Report>;

  beforeEach(() => {
    provider = new FakeStorageProvider();
    model = buildModel();
    const tracker = new ChangeTracker(model, provider);
    const exec = new QueryExecutor<Report>(provider, tracker);
    query = () => Query.empty<Report>(model.findEntityType(Report)!, exec);
  });

  it("reads the size through the File/Length path — typed by the provider (pnpjs turns SharePoint's Int64 string into this number)", async () => {
    provider.seedRow(reports, { Title: "Q2", File: { Length: 204800 } });
    const rows = await query().toArrayAsync();
    expect(rows[0]!.FileSize).toBe(204800);
    expect(typeof rows[0]!.FileSize).toBe("number");
  });

  it("leaves FileSize undefined without throwing when the row has no File", async () => {
    // A folder row, or an item whose file is gone: SharePoint projects no File object.
    provider.seedRow(reports, { Title: "Orphan" });
    provider.seedRow(reports, { Title: "Empty", File: {} });
    const rows = await query().toArrayAsync();
    expect(rows.map((r) => r.FileSize)).toEqual([undefined, undefined]);
  });

  it("survives a folder row pulled in by includeContainers", async () => {
    provider.seedRow(reports, { Title: "Archive", FSObjType: 1 });
    provider.seedRow(reports, { Title: "Q2", File: { Length: 17 } });
    const rows = await query()
      .where((b) => b.includeFolders())
      .toArrayAsync();
    expect(rows.map((r) => r.FileSize)).toEqual([undefined, 17]);
  });

  it("a plain SpeelEntity has no FileSize and asks for no path-shaped column", async () => {
    provider.seedRow(tasks, { Title: "Ship it", File: { Length: 99 } });
    const exec = new QueryExecutor<Task>(
      provider,
      new ChangeTracker(model, provider),
    );
    const rows = await Query.empty<Task>(
      model.findEntityType(Task)!,
      exec,
    ).toArrayAsync();
    expect(rows[0]!.Title).toBe("Ship it");
    expect(
      (rows[0] as unknown as Record<string, unknown>).FileSize,
    ).toBeUndefined();
    expect(model.findEntityType(Task)!.columnNames).not.toContain(
      "File/Length",
    );
  });

  it("populates after an upload — no per-model configuration", async () => {
    const tracker = new ChangeTracker(model, provider);
    const set = new DbSet<Report>(Report, model, provider, tracker);
    const r = new Report();
    r.Title = "Q3";
    set.add(r, { file: { name: "q3.pdf", content: "0123456789" } });
    await new SaveExecutor(model, provider, tracker).saveChangesAsync();

    const rows = await query().toArrayAsync();
    expect(rows[0]!.FileLeafRef).toBe("q3.pdf");
    expect(rows[0]!.FileSize).toBe(10);
  });
});
