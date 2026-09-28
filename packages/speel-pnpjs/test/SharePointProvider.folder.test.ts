// test/SharePointProvider.folder.test.ts
import { describe, it, expect } from "vitest";
import { textProperty } from "@speel/core/testing";
import { SharePointProvider } from "../src/SharePointProvider.js";

const TITLE = textProperty("Title");

// A fake list folder: addSubFolderUsingPath creates a child (recording its relative
// path) and returns the child folder; an already-created child rejects (so the
// provider's catch descends via folders.getByUrl). Mirrors a real LIST folder.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeFolder(path: string, created: string[]): any {
  return {
    addSubFolderUsingPath: (leaf: string) => {
      const child = path ? `${path}/${leaf}` : leaf;
      if (created.includes(child))
        return Promise.reject({
          status: 500,
          message: "The folder already exists.",
        });
      created.push(child);
      return Promise.resolve(makeFolder(child, created));
    },
    folders: {
      getByUrl: (leaf: string) =>
        makeFolder(path ? `${path}/${leaf}` : leaf, created),
    },
    select: (_f: string) => async () => ({
      ServerRelativeUrl: "/sites/dev/Docs",
    }),
  };
}

function fakeSp() {
  const created: string[] = [];
  const validateCalls: {
    formValues: { FieldName: string; FieldValue: string }[];
    folder: string;
  }[] = [];
  let nextId = 200;

  const list = {
    // The root URL is read from the list's rootFolder endpoint (see makeFolder's select).
    rootFolder: makeFolder("", created),
    addValidateUpdateItemUsingPath: (
      formValues: { FieldName: string; FieldValue: string }[],
      folder: string,
    ) => {
      validateCalls.push({ formValues, folder });
      return Promise.resolve([
        ...formValues.map((f) => ({ ...f, HasException: false })),
        { FieldName: "Id", FieldValue: String(nextId++), HasException: false },
      ]);
    },
  };

  const sp2: any = {
    web: { lists: { getByTitle: () => list, getById: () => list } },
    batched() {
      return [sp2, async () => undefined];
    },
  };

  return { sp2, created, validateCalls };
}

const list = { kind: "title" as const, value: "Docs" };

describe("SharePointProvider folder placement", () => {
  it("ensureFoldersAsync creates each level as a list folder (dedups shared ancestors) and resolves URLs", async () => {
    const { sp2, created } = fakeSp();
    const provider = new SharePointProvider(sp2 as never);
    const map = await provider.ensureFoldersAsync(list, ["a/b/c", "a/b"]);
    // Each level created once via addSubFolderUsingPath; shared ancestors descended, not re-created.
    expect(created).toEqual(["a", "a/b", "a/b/c"]);
    expect(map.get("a/b/c")).toBe("/sites/dev/Docs/a/b/c");
  });

  it("ensureFoldersAsync rethrows errors that are not folder-already-exists", async () => {
    const rootList = () => ({
      rootFolder: {
        select: (_f: string) => async () => ({
          ServerRelativeUrl: "/sites/dev/Docs",
        }),
        addSubFolderUsingPath: () =>
          Promise.reject({ status: 403, message: "Access denied." }),
        folders: { getByUrl: () => ({}) },
      },
    });
    const sp2: any = {
      web: { lists: { getByTitle: rootList, getById: rootList } },
      batched() {
        return [sp2, async () => undefined];
      },
    };
    const provider = new SharePointProvider(sp2);
    await expect(
      provider.ensureFoldersAsync(list, ["a"]),
    ).rejects.toMatchObject({ message: "Access denied." });
  });

  it("ensureFoldersAsync throws if the list root folder URL cannot be resolved", async () => {
    // Reproduces the real-SharePoint trap: RootFolder/ServerRelativeUrl absent → no
    // silent "undefined" root, a clear error instead.
    const rootList = () => ({
      rootFolder: { select: (_f: string) => async () => ({}) },
    });
    const sp2: any = {
      web: { lists: { getByTitle: rootList, getById: rootList } },
      batched() {
        return [sp2, async () => undefined];
      },
    };
    const provider = new SharePointProvider(sp2);
    await expect(provider.ensureFoldersAsync(list, ["a"])).rejects.toThrow(
      /root folder URL/i,
    );
  });

  it("a folder insert calls addValidateUpdateItemUsingPath and parses the returned Id", async () => {
    const { sp2, validateCalls } = fakeSp();
    const provider = new SharePointProvider(sp2 as never);
    const res = await provider.executeBatchAsync([
      {
        kind: "insert",
        list,
        fields: [{ property: TITLE, value: "Hi" }],
        folderServerRelativeUrl: "/sites/dev/Docs/a",
        clientToken: "t1",
      },
    ]);
    expect(res[0]?.kind).toBe("success");
    if (res[0]?.kind !== "success") throw new Error();
    expect(res[0].serverData?.id).toBe(200);
    expect(validateCalls).toEqual([
      {
        folder: "/sites/dev/Docs/a",
        formValues: [{ FieldName: "Title", FieldValue: "Hi" }],
      },
    ]);
  });

  it("a folder insert fails the op when a returned field carries HasException", async () => {
    const list2 = {
      addValidateUpdateItemUsingPath: () =>
        Promise.resolve([
          {
            FieldName: "Title",
            FieldValue: "x",
            HasException: true,
            ErrorMessage: "bad value",
          },
        ]),
    };
    const sp2: any = {
      web: { lists: { getByTitle: () => list2, getById: () => list2 } },
      batched() {
        return [sp2, async () => undefined];
      },
    };
    const provider = new SharePointProvider(sp2);
    const res = await provider.executeBatchAsync([
      {
        kind: "insert",
        list,
        fields: [{ property: TITLE, value: "x" }],
        folderServerRelativeUrl: "/sites/dev/Docs/a",
        clientToken: "t1",
      },
    ]);
    expect(res[0]?.kind).toBe("failure");
    if (res[0]?.kind !== "failure") throw new Error();
    expect(res[0].body).toBe("bad value");
  });
});
