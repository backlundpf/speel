import { describe, it, expect } from "vitest";
import { createFilterBuilder } from "../../../src/Query/FilterBuilder.js";
import { ModelBuilder } from "../../../src/ModelBuilder/ModelBuilder.js";

class User {
  Id?: number;
  Title?: string;
}
class Blog {
  Id?: number;
  Title?: string;
  AuthorId?: number;
  Author?: User;
  Comments?: object[];
}

function makeBlogEt() {
  const mb = new ModelBuilder();
  mb.entity(User, (b) => {
    b.toList("UserInfo");
    b.property((e) => e.Title).isText();
  });
  mb.entity(Blog, (b) => {
    b.toList("Blogs");
    b.property((e) => e.Title).isText();
    b.hasOne(User, (e) => e.Author)
      .withMany()
      .hasForeignKey((e) => e.AuthorId);
  });
  return mb.build().findEntityType(Blog)!;
}

describe("FilterBuilder nav-traversal", () => {
  it("b.Author.Title.eq builds compare with slash-path column", () => {
    const b = createFilterBuilder(makeBlogEt());
    const node = (b.Author as any).Title.eq("Jane");
    expect(node).toEqual({
      kind: "compare",
      column: "Author/Title",
      op: "eq",
      value: "Jane",
    });
  });
  it("b.Author.Title.startsWith builds string node with slash-path", () => {
    const b = createFilterBuilder(makeBlogEt());
    const node = (b.Author as any).Title.startsWith("Ja");
    expect(node).toEqual({
      kind: "string",
      column: "Author/Title",
      op: "startsWith",
      value: "Ja",
    });
  });
  it("accessing an unmapped nav property throws ModelConfigurationException", () => {
    const b = createFilterBuilder(makeBlogEt());
    expect(() => (b as any).Bogus.Title).toThrow();
  });
  it("accessing an unmapped nested property under a valid nav also throws", () => {
    const b = createFilterBuilder(makeBlogEt());
    expect(() => (b as any).Author.NotAField).toThrow();
  });
});
