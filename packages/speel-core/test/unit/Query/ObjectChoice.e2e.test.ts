import { describe, it, expect, beforeEach } from "vitest";
import {
  DbContext,
  DbSet,
  ModelBuilder,
  initSpeelDbContext,
} from "../../../src/index.js";
import { FakeStorageProvider } from "../fakes/FakeStorageProvider.js";
import type { IListHandle } from "../../../src/types.js";

interface Status {
  id: string;
  label: string;
}
const STATUSES: Status[] = [
  { id: "draft", label: "Draft" },
  { id: "pub", label: "Published" },
];

class Post {
  Id?: number;
  Title?: string;
  Status?: Status;
}

class PostCtx extends DbContext {
  public posts: DbSet<Post> = this.set(Post);
  protected override onModelCreating(mb: ModelBuilder): void {
    mb.entity(Post, (b) => {
      b.toList("Posts");
      b.property((e) => e.Title).isText();
      b.property((e) => e.Status)
        .isChoice()
        .hasOptions(STATUSES)
        .hasOptionsValue((o) => o.id)
        .hasOptionsRender((o) => o.label)
        .hasCodec<Status, string>({
          toProvider: (o) => o.id,
          fromProvider: (s) => STATUSES.find((o) => o.id === s)!,
        });
    });
  }
}

const posts: IListHandle = { kind: "title", value: "Posts" };

describe("object choice end-to-end", () => {
  let provider: FakeStorageProvider;
  let ctx: PostCtx;

  beforeEach(() => {
    provider = new FakeStorageProvider();
    ctx = initSpeelDbContext(PostCtx, (b) => b.useProvider(provider));
  });

  it("writes the option scalar and reads back the option object", async () => {
    const p = new Post();
    p.Title = "Hello";
    p.Status = { id: "pub", label: "Published" };
    ctx.posts.add(p);
    await ctx.saveChangesAsync();

    // The stored wire value is the scalar 'pub'.
    const stored = await provider.getItemsByIdsAsync(
      posts,
      [p.Id!],
      ["ID", "Status"],
    );
    expect(stored[0]!.Status).toBe("pub");

    // Reading back through a fresh context materializes the option object.
    const fresh = initSpeelDbContext(PostCtx, (b) => b.useProvider(provider));
    const rows = await fresh.posts.toArrayAsync();
    expect(rows[0]!.Status).toEqual({ id: "pub", label: "Published" });
  });
});
