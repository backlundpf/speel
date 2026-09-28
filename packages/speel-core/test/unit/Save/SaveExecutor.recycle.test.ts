// test/unit/Save/SaveExecutor.recycle.test.ts
import { it, expect } from "vitest";
import {
  DbContext,
  ModelBuilder,
  initSpeelDbContext,
} from "../../../src/index.js";
import { FakeStorageProvider } from "../fakes/FakeStorageProvider.js";
import type { IListHandle } from "../../../src/types.js";

class Widget {
  Id?: number;
  Title: string | null = null;
}
class Ctx extends DbContext {
  public widgets = this.set(Widget);
  protected onModelCreating(b: ModelBuilder): void {
    b.entity(Widget, (e) => {
      e.toList("Widgets");
      e.property((x) => x.Title).isText();
    });
  }
}
const widgets: IListHandle = { kind: "title", value: "Widgets" };

async function seeded() {
  const provider = new FakeStorageProvider();
  provider.seedRow(widgets, { Title: "W" });
  return provider;
}

it("remove() recycles by default", async () => {
  const provider = await seeded();
  const ctx = initSpeelDbContext(Ctx, (b) => b.useProvider(provider));
  const w = await ctx.widgets.findAsync(1);
  ctx.widgets.remove(w!);
  await ctx.saveChangesAsync();

  expect(provider.recycledIds(widgets)).toEqual([1]);
  expect(provider.hardDeletedIds(widgets)).toEqual([]);
});

it("remove(e, { permanent: true }) hard-deletes", async () => {
  const provider = await seeded();
  const ctx = initSpeelDbContext(Ctx, (b) => b.useProvider(provider));
  const w = await ctx.widgets.findAsync(1);
  ctx.widgets.remove(w!, { permanent: true });
  await ctx.saveChangesAsync();

  expect(provider.hardDeletedIds(widgets)).toEqual([1]);
  expect(provider.recycledIds(widgets)).toEqual([]);
});
