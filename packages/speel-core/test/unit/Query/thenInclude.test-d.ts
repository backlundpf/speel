// thenInclude's selector must operate on the type the preceding include selected —
// the element type for a collection navigation, the target itself for a reference —
// with `| null | undefined` stripped. Historically TPrev was erased to IEntity and
// every thenInclude selector needed an `as any` cast; these assertions pin the
// inference (via the selector's parameter type, the surface users actually touch)
// so that never regresses.
import { describe, it, expectTypeOf } from "vitest";
import type { Query } from "../../../src/Query/Query.js";
import type { DbSet } from "../../../src/DbSet.js";

class Author {
  Id?: number;
  Name?: string;
}
class Doc {
  Id?: number;
  FileName?: string;
}
class Comment {
  Id?: number;
  Body?: string;
  Docs?: Doc[];
}
class Blog {
  Id?: number;
  Title?: string;
  Comments?: Comment[] | null;
  Author?: Author | null;
}

declare const q: Query<Blog>;
declare const set: DbSet<Blog>;

describe("include/thenInclude selector typing", () => {
  it("a collection include types thenInclude's selector to the element type", () => {
    q.include((b) => b.Comments).thenInclude((c) => {
      expectTypeOf(c).toEqualTypeOf<Comment>();
      return c.Docs;
    });
  });

  it("a reference include types thenInclude's selector to the target type", () => {
    q.include((b) => b.Author).thenInclude((a) => {
      expectTypeOf(a).toEqualTypeOf<Author>();
      return a.Name;
    });
  });

  it("thenInclude itself re-types the chain for deeper levels", () => {
    q.include((b) => b.Comments)
      .thenInclude((c) => c.Docs)
      .thenInclude((d) => {
        expectTypeOf(d).toEqualTypeOf<Doc>();
        return d.FileName;
      });
  });

  it("DbSet.include infers the same way as Query.include", () => {
    set
      .include((b) => b.Comments)
      .thenInclude((c) => {
        expectTypeOf(c).toEqualTypeOf<Comment>();
        return c.Docs;
      });
  });

  it("a non-entity selection falls back to IEntity instead of never", () => {
    q.include((b) => b.Title).thenInclude((e) => {
      expectTypeOf(e).toHaveProperty("Id");
      return e.Id;
    });
  });
});
