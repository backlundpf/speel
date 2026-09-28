import { describe, it, expect } from "vitest";
import { FakeStorageProvider } from "./FakeStorageProvider.js";
import type { FilterNode } from "../../../src/Query/FilterNode.js";
import { textProperty } from "../../../src/testing/properties.js";

const list = { kind: "title" as const, value: "Docs" };
const TITLE = textProperty("Title");

/** The typed write op that places an item in a folder. */
function insertInFolder(folder: string, title: string, clientToken: string) {
  return {
    kind: "insert" as const,
    list,
    fields: [{ property: TITLE, value: title }],
    folderServerRelativeUrl: folder,
    clientToken,
  };
}

function scope(path: string, recursive = false): FilterNode {
  return { kind: "container-scope", path, recursive };
}

async function ids(
  p: FakeStorageProvider,
  options?: Parameters<FakeStorageProvider["getItemsPagedAsync"]>[4],
): Promise<number[]> {
  const page = await p.getItemsPagedAsync(
    list,
    ["Title"],
    100,
    undefined,
    options,
  );
  return page.items.map((i) => i.ID as number);
}

describe("FakeStorageProvider container scoping", () => {
  it("materializes folder rows on ensureFoldersAsync and hides them by default", async () => {
    const p = new FakeStorageProvider();
    await p.ensureFoldersAsync(list, ["a/b"]);
    const visible = await ids(p);
    expect(visible).toEqual([]); // folder rows excluded
    const all = await ids(p, { includeContainers: true });
    expect(all).toHaveLength(2); // 'a' and 'a/b' rows
    expect(await p.countAsync(list)).toBe(0);
    expect(await p.countAsync(list, { includeContainers: true })).toBe(2);
  });

  it("materializing is idempotent across ensure calls", async () => {
    const p = new FakeStorageProvider();
    await p.ensureFoldersAsync(list, ["x/y"]);
    await p.ensureFoldersAsync(list, ["x/y", "x"]);
    expect(await p.countAsync(list, { includeContainers: true })).toBe(2);
  });

  it("scopes exactly by container, treating no-__folder rows as root", async () => {
    const p = new FakeStorageProvider();
    const urls = await p.ensureFoldersAsync(list, ["a/b"]);
    p.seedRow(list, { Title: "root item" });
    await p.executeBatchAsync([
      insertInFolder(urls.get("a/b")!, "nested", "n"),
    ]);
    const inAB = await p.getItemsPagedAsync(list, ["Title"], 100, undefined, {
      filter: scope("a/b"),
    });
    expect(inAB.items.map((i) => i.Title)).toEqual(["nested"]);
    const inA = await p.getItemsPagedAsync(list, ["Title"], 100, undefined, {
      filter: scope("a"),
    });
    expect(inA.items).toEqual([]); // exact: child folder content not included
  });

  it("recursive scope matches the subtree but not prefix-sibling folders", async () => {
    const p = new FakeStorageProvider();
    const urls = await p.ensureFoldersAsync(list, [
      "reports/2026",
      "reports-archive",
    ]);
    await p.executeBatchAsync([
      insertInFolder(urls.get("reports/2026")!, "deep", "a"),
      insertInFolder(urls.get("reports-archive")!, "trap", "b"),
    ]);
    const r = await p.getItemsPagedAsync(list, ["Title"], 100, undefined, {
      filter: scope("reports", true),
    });
    expect(r.items.map((i) => i.Title)).toEqual(["deep"]);
  });

  it("write-then-read-back: an uploaded file is found by inFolder of its path", async () => {
    const p = new FakeStorageProvider();
    const urls = await p.ensureFoldersAsync(list, ["inbox"]);
    await p.uploadFileAsync(list, urls.get("inbox")!, {
      fileName: "q2.pdf",
      content: "x",
      overwrite: false,
      fields: [{ property: TITLE, value: "Q2" }],
    });
    const r = await p.getItemsPagedAsync(list, ["Title"], 100, undefined, {
      filter: scope("inbox"),
    });
    expect(r.items.map((i) => i.Title)).toEqual(["Q2"]);
  });
});
