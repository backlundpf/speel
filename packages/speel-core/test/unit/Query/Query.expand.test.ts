import { describe, it, expect, beforeEach } from "vitest";
import { ModelBuilder } from "../../../src/ModelBuilder/ModelBuilder.js";
import { Query } from "../../../src/Query/Query.js";
import { QueryExecutor } from "../../../src/Query/QueryExecutor.js";
import { ChangeTracker } from "../../../src/ChangeTracker/ChangeTracker.js";
import { FakeStorageProvider } from "../fakes/FakeStorageProvider.js";

class Tag {
  Id?: number;
  Name?: string;
}
class User {
  Id?: number;
  Title?: string;
}
class Blog {
  Id?: number;
  Title?: string;
  AuthorId?: number;
  Author?: User;
  TagsId?: number[];
  Tags?: Tag[];
}

function buildModel() {
  const mb = new ModelBuilder();
  mb.entity(User, (b) => {
    b.toList("UserInfo");
    b.property((e) => e.Title).isText();
  });
  mb.entity(Tag, (b) => {
    b.toList("Tags");
    b.property((e) => e.Name).isText();
  });
  mb.entity(Blog, (b) => {
    b.toList("Blogs");
    b.property((e) => e.Title).isText();
    b.hasOne(User, (e) => e.Author)
      .withMany()
      .hasForeignKey((e) => e.AuthorId);
    b.hasMany(Tag, (e) => e.Tags)
      .withMany()
      .hasForeignKey((e) => e.TagsId);
  });
  return mb.build();
}

describe("Query.expand", () => {
  let provider: FakeStorageProvider;
  let model: ReturnType<typeof buildModel>;
  let executor: QueryExecutor<Blog>;
  let q: Query<Blog>;

  beforeEach(() => {
    provider = new FakeStorageProvider();
    model = buildModel();
    const tracker = new ChangeTracker(model, provider);
    executor = new QueryExecutor<Blog>(provider, tracker);
    q = Query.empty<Blog>(model.findEntityType(Blog)!, executor);
  });

  it("expand(nav) records IExpandSpec with the default key and display field", () => {
    const q2 = q.expand((b) => b.Author);
    expect(q2.state.expands).toEqual([
      { navName: "Author", fields: ["ID", "Title"] },
    ]);
  });

  it("expand(nav, fields) records explicit fields", () => {
    const q2 = q.expand((b) => b.Author, ["Title", "Email"]);
    expect(q2.state.expands).toEqual([
      { navName: "Author", fields: ["Title", "Email"] },
    ]);
  });

  it("repeated expand on same nav merges fields (union)", () => {
    const q2 = q
      .expand((b) => b.Author, ["Title"])
      .expand((b) => b.Author, ["Email"]);
    expect(q2.state.expands).toEqual([
      { navName: "Author", fields: ["Title", "Email"] },
    ]);
  });

  it("multiple expand on different navs records separate specs", () => {
    const q2 = q.expand((b) => b.Author).expand((b) => b.Tags, ["Name"]);
    expect(q2.state.expands).toEqual([
      { navName: "Author", fields: ["ID", "Title"] },
      { navName: "Tags", fields: ["Name"] },
    ]);
  });
});
