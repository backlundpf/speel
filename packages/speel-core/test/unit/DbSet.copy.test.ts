import { describe, it, expect, beforeEach } from "vitest";
import { ModelBuilder } from "../../src/ModelBuilder/ModelBuilder.js";
import { ChangeTracker } from "../../src/ChangeTracker/ChangeTracker.js";
import { DbSet } from "../../src/DbSet.js";
import { SpeelDocument } from "../../src/SpeelDocument.js";
import { FakeStorageProvider } from "./fakes/FakeStorageProvider.js";
import type { IListHandle } from "../../src/types.js";
import { TestPrincipal as Principal } from "./fakes/testPrincipals.js";

class Report extends SpeelDocument {
  Title: string | null = null;
}
class Delivery extends SpeelDocument {
  Title: string | null = null;
}

const reports: IListHandle = { kind: "title", value: "Reports" };
const deliveries: IListHandle = { kind: "title", value: "Deliveries" };

function buildModel() {
  const mb = new ModelBuilder();
  mb.entity(Principal, (b) =>
    b.toProviderSource({ kind: "provider", key: "principals" }),
  );
  mb.entity(Report, (b) => {
    b.toList("Reports");
    b.property((e) => e.Title).isText();
  });
  mb.entity(Delivery, (b) => {
    b.toList("Deliveries");
    b.property((e) => e.Title).isText();
  });
  return mb.build();
}

describe("DbSet.copyFileToAsync", () => {
  let provider: FakeStorageProvider;
  let reportSet: DbSet<Report>;
  let deliverySet: DbSet<Delivery>;

  beforeEach(() => {
    provider = new FakeStorageProvider();
    const model = buildModel();
    const tracker = new ChangeTracker(model, provider);
    reportSet = new DbSet<Report>(Report, model, provider, tracker);
    deliverySet = new DbSet<Delivery>(Delivery, model, provider, tracker);
  });

  async function seedReport(name = "q2.pdf"): Promise<Report> {
    const urls = await provider.ensureFoldersAsync(reports, ["archive"]);
    await provider.uploadFileAsync(reports, urls.get("archive")!, {
      fileName: name,
      content: new Blob(["x"]),
      overwrite: false,
      fields: [],
    });
    const [report] = await reportSet.toArrayAsync();
    return report!;
  }

  it("copies the file into the destination library and returns its new URL", async () => {
    const report = await seedReport();
    await provider.ensureFoldersAsync(deliveries, ["FY26-1"]);

    const result = await reportSet.copyFileToAsync(
      report,
      deliverySet,
      "FY26-1",
      "copy.pdf",
    );

    expect(result.serverRelativeUrl).toBe(
      "/sites/dev/Deliveries/FY26-1/copy.pdf",
    );
    const copies = await deliverySet.toArrayAsync();
    expect(copies.map((c) => c.FileLeafRef)).toContain("copy.pdf");
    // The source is untouched.
    const [source] = await reportSet.toArrayAsync();
    expect(source!.FileLeafRef).toBe("q2.pdf");
  });

  it("fails on an occupied destination rather than overwriting", async () => {
    const report = await seedReport();
    await provider.ensureFoldersAsync(deliveries, ["FY26-1"]);
    await reportSet.copyFileToAsync(report, deliverySet, "FY26-1", "copy.pdf");

    await expect(
      reportSet.copyFileToAsync(report, deliverySet, "FY26-1", "copy.pdf"),
    ).rejects.toThrow(/already exists/);
  });

  it("fails when the destination folder does not exist", async () => {
    const report = await seedReport();
    await expect(
      reportSet.copyFileToAsync(report, deliverySet, "FY26-1", "copy.pdf"),
    ).rejects.toThrow(/not found/i);
  });
});
