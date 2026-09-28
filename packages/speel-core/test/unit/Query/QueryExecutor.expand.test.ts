import { describe, it, expect, beforeEach } from "vitest";
import { ModelBuilder } from "../../../src/ModelBuilder/ModelBuilder.js";
import { Query } from "../../../src/Query/Query.js";
import { QueryExecutor } from "../../../src/Query/QueryExecutor.js";
import { ChangeTracker } from "../../../src/ChangeTracker/ChangeTracker.js";
import { FakeStorageProvider } from "../fakes/FakeStorageProvider.js";
import type { IListHandle } from "../../../src/types.js";

class User {
  Id?: number;
  Title?: string;
}
class Blog {
  Id?: number;
  Title?: string;
  AuthorId?: number;
  Author?: User;
}

const usersList: IListHandle = { kind: "title", value: "Users" };
const blogsList: IListHandle = { kind: "title", value: "Blogs" };

function buildModel() {
  const mb = new ModelBuilder();
  mb.entity(User, (b) => {
    b.toList("Users");
    b.property((e) => e.Title).isText();
  });
  mb.entity(Blog, (b) => {
    b.toList("Blogs");
    b.property((e) => e.Title).isText();
    b.hasOne(User, (e) => e.Author)
      .withMany()
      .hasForeignKey((e) => e.AuthorId);
  });
  return mb.build();
}

describe("QueryExecutor — expand materializes the nav object", () => {
  let provider: FakeStorageProvider;
  let model: ReturnType<typeof buildModel>;
  let tracker: ChangeTracker;
  let exec: QueryExecutor<Blog>;
  let expandQuery: () => Query<Blog>;

  beforeEach(async () => {
    provider = new FakeStorageProvider();
    provider.seedRow(usersList, { Title: "Jane" });
    provider.seedRow(blogsList, { Title: "Post", AuthorId: 1 });
    provider.registerJoin(blogsList, "Author", {
      foreignKey: "AuthorId",
      targetList: usersList,
    });
    model = buildModel();
    tracker = new ChangeTracker(model, provider);
    exec = new QueryExecutor<Blog>(provider, tracker);
    expandQuery = () =>
      Query.empty<Blog>(model.findEntityType(Blog)!, exec).expand(
        (b) => b.Author,
      );
  });

  it("attaches a materialized target instance for a fresh entity", async () => {
    const rows = await expandQuery().toArrayAsync();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.Author).toBeInstanceOf(User);
    expect(rows[0]!.Author!.Title).toBe("Jane");
  });

  it("attaches the expand even when the parent is already tracked without it", async () => {
    // Track Blog#1 first via a plain (no-expand) query → no Author attached.
    await Query.empty<Blog>(model.findEntityType(Blog)!, exec).toArrayAsync();
    // Re-query the same (tracked) Blog with expand.
    const rows = await expandQuery().toArrayAsync();
    expect(rows[0]!.Author).toBeInstanceOf(User);
    expect(rows[0]!.Author!.Title).toBe("Jane");
  });

  // REGRESSION: what a read attaches is the nav's ORIGINAL state, not a pending edit. The
  // attach used to leave the tracked entry's baseline saying "no Author", so pass-1 fixup
  // ("nav wins") read the freshly-read Author as a change and rewrote AuthorId from it —
  // reverting a direct FK edit made before the re-query. Same missing baseline as the
  // include path, reached through expand instead.
  it("a re-query with expand does not revert a direct FK edit on the tracked parent", async () => {
    provider.seedRow(usersList, { Title: "Ada" });
    const [blog] = await Query.empty<Blog>(
      model.findEntityType(Blog)!,
      exec,
    ).toArrayAsync();

    blog!.AuthorId = 2; // FK-only edit: fixup must leave it alone
    await expandQuery().toArrayAsync(); // identity-map hit, attaches Author #1

    tracker.fixupRelationships();
    expect(blog!.AuthorId).toBe(2);
  });
});
