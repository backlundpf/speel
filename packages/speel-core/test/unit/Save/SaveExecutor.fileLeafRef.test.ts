import { describe, it, expect, beforeEach } from "vitest";
import { ModelBuilder } from "../../../src/ModelBuilder/ModelBuilder.js";
import { ChangeTracker } from "../../../src/ChangeTracker/ChangeTracker.js";
import { DbSet } from "../../../src/DbSet.js";
import { SaveExecutor } from "../../../src/Save/SaveExecutor.js";
import { SpeelDocument } from "../../../src/SpeelDocument.js";
import { FakeStorageProvider } from "../fakes/FakeStorageProvider.js";
import { textProperty } from "../../../src/testing/properties.js";
import type {
  IBatchOperation,
  IFileUploadRequest,
} from "../../../src/providers/ISharePointProvider.js";
import type { IListHandle } from "../../../src/types.js";
import { TestPrincipal as Principal } from "../fakes/testPrincipals.js";

class Report extends SpeelDocument {
  Title: string | null = null;
}

const reports: IListHandle = { kind: "title", value: "Reports" };

function buildModel() {
  const mb = new ModelBuilder();
  mb.entity(Principal, (b) =>
    b.toProviderSource({ kind: "provider", key: "principals" }),
  );
  mb.entity(Report, (b) => {
    b.toList("Reports");
    b.property((e) => e.Title).isText();
  });
  return mb.build();
}

describe("FileLeafRef is a writable column", () => {
  let provider: FakeStorageProvider;
  let model: ReturnType<typeof buildModel>;
  let tracker: ChangeTracker;
  let set: DbSet<Report>;
  let save: () => Promise<number>;
  let sentOps: IBatchOperation[];
  let uploads: IFileUploadRequest[];

  beforeEach(() => {
    provider = new FakeStorageProvider();
    model = buildModel();
    tracker = new ChangeTracker(model, provider);
    set = new DbSet<Report>(Report, model, provider, tracker);
    const exe = new SaveExecutor(model, provider, tracker);
    save = () => exe.saveChangesAsync();
    sentOps = [];
    uploads = [];
    const exec = provider.executeBatchAsync.bind(provider);
    provider.executeBatchAsync = async (ops) => {
      sentOps.push(...ops);
      return exec(ops);
    };
    const upload = provider.uploadFileAsync.bind(provider);
    provider.uploadFileAsync = async (list, folder, req) => {
      uploads.push(req);
      return upload(list, folder, req);
    };
  });

  async function seedDoc(name: string): Promise<Report> {
    const url = (await provider.ensureFoldersAsync(reports, ["reports"])).get(
      "reports",
    )!;
    const res = await provider.uploadFileAsync(reports, url, {
      fileName: name,
      content: "bytes",
      overwrite: false,
      fields: [{ property: textProperty("Title"), value: "Q2" }],
    });
    uploads = [];
    return (await set.findAsync(res.id))!;
  }

  it("is assignable and not read-only; FileRef stays read-only", () => {
    const r = new Report();
    r.FileLeafRef = "x.pdf";
    // @ts-expect-error FileRef is server-owned
    r.FileRef = "/x";
    const et = model.findEntityType(Report)!;
    expect(et.findByColumnName("FileLeafRef")!.readOnly).toBe(false);
    expect(et.findByColumnName("FileRef")!.readOnly).toBe(true);
  });

  it("a change rides the staged update with Title, and FileRef follows the rename", async () => {
    const doc = await seedDoc("q2.pdf");
    doc.Title = "New title";
    doc.FileLeafRef = "renamed.pdf";
    await save();

    const op = sentOps[0]!;
    expect(op.kind).toBe("update");
    const cols =
      op.kind === "update" ? op.fields.map((f) => f.property.columnName) : [];
    expect(cols.sort()).toEqual(["FileLeafRef", "Title"]);

    expect(doc.FileRef).toBe("/sites/dev/Reports/reports/renamed.pdf");
    expect(provider.getFiles(reports)).toEqual([
      "/sites/dev/Reports/reports/renamed.pdf",
    ]);
    const fresh = new DbSet<Report>(
      Report,
      model,
      provider,
      new ChangeTracker(model, provider),
    );
    const server = (await fresh.findAsync(doc.Id!))!;
    expect(server.Title).toBe("New title");
    expect(server.FileLeafRef).toBe("renamed.pdf");
    expect(server.FileRef).toBe(doc.FileRef);
  });

  it("is not sent as upload metadata: the file option names the upload", async () => {
    const r = new Report();
    r.FileLeafRef = "ignored.pdf";
    set.add(r, { file: { name: "q3.pdf", content: "x" } });
    await save();
    expect(
      (uploads[0]!.fields ?? []).map((f) => f.property.columnName),
    ).not.toContain("FileLeafRef");
    expect(r.FileLeafRef).toBe("q3.pdf");
    expect(provider.getFiles(reports)).toEqual(["/sites/dev/Reports/q3.pdf"]);
  });
});
