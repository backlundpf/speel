import { describe, it, expect, beforeEach } from "vitest";
import { ModelBuilder } from "../../../src/ModelBuilder/ModelBuilder.js";
import { QueryExecutor } from "../../../src/Query/QueryExecutor.js";
import { Query } from "../../../src/Query/Query.js";
import { ChangeTracker } from "../../../src/ChangeTracker/ChangeTracker.js";
import { FakeStorageProvider } from "../fakes/FakeStorageProvider.js";
import type { IListHandle } from "../../../src/types.js";

class Mgr {
  Id?: number;
  Title?: string;
}
class Doc {
  Id?: number;
  Title?: string;
  OwnerId?: number;
  Manager?: Mgr;
}

const mgrs: IListHandle = { kind: "title", value: "Mgrs" };
const docs: IListHandle = { kind: "title", value: "Docs" };

function buildModel() {
  const mb = new ModelBuilder();
  mb.entity(Mgr, (b) => {
    b.toList("Mgrs");
    b.property((e) => e.Title).isText();
  });
  mb.entity(Doc, (b) => {
    b.toList("Docs");
    b.property((e) => e.Title).isText();
    // SP lookup column 'Owner' (FK 'OwnerId'), surfaced on the TS entity as `Manager`.
    b.hasOne(Mgr, (e) => e.Manager)
      .withMany()
      .hasColumnName("Owner");
  });
  return mb.build();
}

describe("QueryExecutor — $expand keys off the lookup column name", () => {
  let provider: FakeStorageProvider;
  let model: ReturnType<typeof buildModel>;

  beforeEach(async () => {
    provider = new FakeStorageProvider();
    model = buildModel();
    provider.seedRow(mgrs, { Title: "Boss" });
    provider.seedRow(docs, { Title: "Doc 1", OwnerId: 1 });
    // Join registered under the SP column name 'Owner' (not the TS property 'Manager').
    provider.registerJoin(docs, "Owner", {
      foreignKey: "OwnerId",
      targetList: mgrs,
    });
  });

  it("expands under the SP column name and materializes under the nav property name", async () => {
    const tracker = new ChangeTracker(model, provider);
    const executor = new QueryExecutor<Doc>(provider, tracker);
    const q = Query.empty<Doc>(model.findEntityType(Doc)!, executor);
    const r = await q.expand((e) => e.Manager).toArrayAsync();
    expect(r[0]!.Manager?.Title).toBe("Boss");
  });
});
