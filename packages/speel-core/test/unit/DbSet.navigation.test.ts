import { describe, it, expect } from "vitest";
import { DbSet } from "../../src/DbSet.js";
import { Query, IncludableQuery } from "../../src/Query/Query.js";
import { ChangeTracker } from "../../src/ChangeTracker/ChangeTracker.js";
import { Model } from "../../src/Metadata/Model.js";
import { EntityType } from "../../src/Metadata/EntityType.js";
import { Property } from "../../src/Metadata/Property.js";
import type { INavigation } from "../../src/Metadata/Navigation.js";
import { FakeStorageProvider } from "./fakes/FakeStorageProvider.js";

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

function setup() {
  // User properties
  const userId = new Property({
    propertyName: "Id",
    columnName: "ID",
    displayName: "ID",
    config: { kind: "Number" },
    required: true,
    readOnly: true,
    key: true,
  });
  const userTitle = new Property({
    propertyName: "Title",
    columnName: "Title",
    displayName: "Title",
    config: { kind: "Text", multiline: false, maxLength: 255 },
    required: false,
    readOnly: false,
    key: false,
  });
  const userET = new EntityType<User>({
    ctor: User,
    list: { kind: "title", value: "UserInfo" },
    properties: [userId, userTitle],
  });

  // Blog properties
  const blogId = new Property({
    propertyName: "Id",
    columnName: "ID",
    displayName: "ID",
    config: { kind: "Number" },
    required: true,
    readOnly: true,
    key: true,
  });
  const blogTitle = new Property({
    propertyName: "Title",
    columnName: "Title",
    displayName: "Title",
    config: { kind: "Text", multiline: false, maxLength: 255 },
    required: false,
    readOnly: false,
    key: false,
  });
  const blogAuthorId = new Property({
    propertyName: "AuthorId",
    columnName: "AuthorId",
    displayName: "Author ID",
    config: {
      kind: "Lookup",
      target: userET,
      displayField: "Title",
      multi: false,
    },
    required: false,
    readOnly: false,
    key: false,
  });
  const blogET = new EntityType<Blog>({
    ctor: Blog,
    list: { kind: "title", value: "Blogs" },
    properties: [blogId, blogTitle, blogAuthorId],
  });

  // Add navigation: Blog -> Author (User)
  const authorNav: INavigation = {
    name: "Author",
    columnName: "Author",
    displayName: "Author",
    required: false,
    visible: true,
    enabled: true,
    readOnly: false,
    customValidations: [],
    kind: "reference",
    storage: "self-fk-scalar",
    target: userET,
    foreignKey: blogAuthorId,
    config: {
      kind: "Lookup",
      target: userET,
      displayField: "Title",
      multi: false,
    },
  };
  blogET.addNavigation(authorNav);

  const model = new Model([userET, blogET]);
  const provider = new FakeStorageProvider();
  const tracker = new ChangeTracker(model, provider);
  const set = new DbSet<Blog>(Blog, model, provider, tracker);
  return { set, model, provider, tracker };
}

describe("DbSet delegation for include/expand", () => {
  it("dbSet.include returns an IncludableQuery", () => {
    const { set } = setup();
    const q = set.include((b) => b.Author);
    expect(q).toBeInstanceOf(IncludableQuery);
    expect(q.state.includes).toEqual([{ navName: "Author", children: [] }]);
  });

  it("dbSet.expand returns a Query with expands set", () => {
    const { set } = setup();
    const q = set.expand((b) => b.Author);
    expect(q).toBeInstanceOf(Query);
    expect(q.state.expands.length).toBe(1);
    expect(q.state.expands[0]!.navName).toBe("Author");
  });
});
