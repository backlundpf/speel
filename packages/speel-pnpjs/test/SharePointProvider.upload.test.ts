// test/SharePointProvider.upload.test.ts
import { describe, it, expect, vi } from "vitest";
import { textProperty } from "@speel/core/testing";
import {
  SharePointProvider,
  SINGLE_SHOT_MAX_BYTES,
} from "../src/SharePointProvider.js";

const list = { kind: "title" as const, value: "Docs" };
const TITLE = textProperty("Title");

interface FakeCalls {
  addUsingPath: {
    url: string;
    content: unknown;
    params: { Overwrite?: boolean };
  }[];
  addChunked: { url: string; params: Record<string, unknown> }[];
  validate: { FieldName: string; FieldValue: string }[][];
  folderRequests: string[];
  fileRequests: string[];
  deleted: string[];
}

/**
 * Fake spfi for uploadFileAsync. `chunkOffsets` drives addChunked's progress
 * callbacks (one call per offset, stage cycling starting→continue) before it
 * resolves. `validateRows` (if set) is returned by validateUpdateListItem
 * instead of the echo-success default.
 */
function fakeSp(opts?: {
  chunkOffsets?: number[];
  validateRows?: {
    FieldName: string;
    FieldValue: string;
    HasException?: boolean;
    ErrorMessage?: string;
  }[];
  addUsingPathError?: unknown;
}) {
  const calls: FakeCalls = {
    addUsingPath: [],
    addChunked: [],
    validate: [],
    folderRequests: [],
    fileRequests: [],
    deleted: [],
  };
  let nextId = 300;

  const makeInfo = (url: string, name: string) => ({
    Name: name,
    ServerRelativeUrl: `${url}/${name}`,
  });

  const makeItem = (id: number) => ({
    Id: id,
    validateUpdateListItem: (
      fv: { FieldName: string; FieldValue: string }[],
    ) => {
      calls.validate.push(fv);
      return Promise.resolve(
        opts?.validateRows ?? fv.map((f) => ({ ...f, HasException: false })),
      );
    },
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sp2: any = {
    web: {
      lists: {
        getByTitle: () => ({
          rootFolder: {
            select: (_f: string) => async () => ({
              ServerRelativeUrl: "/sites/dev/Docs",
            }),
          },
        }),
        getById: () => ({
          rootFolder: {
            select: (_f: string) => async () => ({
              ServerRelativeUrl: "/sites/dev/Docs",
            }),
          },
        }),
      },
      getFolderByServerRelativePath: (url: string) => {
        calls.folderRequests.push(url);
        return {
          files: {
            addUsingPath: (
              name: string,
              content: unknown,
              params: { Overwrite?: boolean },
            ) => {
              calls.addUsingPath.push({ url, content, params });
              if (opts?.addUsingPathError)
                return Promise.reject(opts.addUsingPathError);
              return Promise.resolve(makeInfo(url, name));
            },
            addChunked: async (
              name: string,
              _content: unknown,
              params: Record<string, unknown>,
            ) => {
              calls.addChunked.push({ url, params });
              const progress = params.progress as (d: {
                uploadId: string;
                stage: string;
                offset: number;
              }) => void;
              for (const [i, offset] of (opts?.chunkOffsets ?? [0]).entries()) {
                progress({
                  uploadId: "u1",
                  stage: i === 0 ? "starting" : "continue",
                  offset,
                });
              }
              return makeInfo(url, name);
            },
          },
        };
      },
      getFileByServerRelativePath: (url: string) => {
        calls.fileRequests.push(url);
        return {
          getItem: (..._selects: string[]) =>
            Promise.resolve(makeItem(nextId++)),
          delete: () => {
            calls.deleted.push(url);
            return Promise.resolve();
          },
        };
      },
    },
    batched() {
      return [sp2, async () => undefined];
    },
  };

  return { sp2, calls };
}

describe("SharePointProvider.uploadFileAsync", () => {
  it("single-shot uploads small content with Overwrite, applies metadata, returns id/name/url", async () => {
    const { sp2, calls } = fakeSp();
    const provider = new SharePointProvider(sp2 as never);
    const onProgress = vi.fn();
    const res = await provider.uploadFileAsync(list, "/sites/dev/Docs/a", {
      fileName: "q2.pdf",
      content: "small",
      overwrite: false,
      fields: [{ property: TITLE, value: "Hi" }],
      onProgress,
    });
    expect(calls.addUsingPath).toHaveLength(1);
    expect(calls.addUsingPath[0]).toMatchObject({
      url: "/sites/dev/Docs/a",
      content: "small",
      params: { Overwrite: false },
    });
    expect(calls.addChunked).toHaveLength(0);
    expect(onProgress).toHaveBeenCalledTimes(1);
    expect(onProgress).toHaveBeenCalledWith({
      bytesUploaded: 5,
      bytesTotal: 5,
    });
    expect(calls.validate).toEqual([
      [{ FieldName: "Title", FieldValue: "Hi" }],
    ]);
    expect(res).toEqual({
      id: 300,
      fileName: "q2.pdf",
      serverRelativeUrl: "/sites/dev/Docs/a/q2.pdf",
    });
  });

  it("resolves the library root when folderServerRelativeUrl is null", async () => {
    const { sp2, calls } = fakeSp();
    const provider = new SharePointProvider(sp2 as never);
    await provider.uploadFileAsync(list, null, {
      fileName: "a.txt",
      content: "x",
      overwrite: false,
      fields: [],
    });
    expect(calls.folderRequests).toEqual(["/sites/dev/Docs"]);
  });

  it("skips validateUpdateListItem when fields is empty", async () => {
    const { sp2, calls } = fakeSp();
    const provider = new SharePointProvider(sp2 as never);
    await provider.uploadFileAsync(list, "/sites/dev/Docs", {
      fileName: "a.txt",
      content: "x",
      overwrite: false,
      fields: [],
    });
    expect(calls.validate).toHaveLength(0);
  });

  it("routes content at/above the threshold through addChunked and maps progress offsets", async () => {
    const { sp2, calls } = fakeSp({ chunkOffsets: [0, SINGLE_SHOT_MAX_BYTES] });
    const provider = new SharePointProvider(sp2 as never);
    const onProgress = vi.fn();
    const big = new ArrayBuffer(SINGLE_SHOT_MAX_BYTES);
    await provider.uploadFileAsync(list, "/sites/dev/Docs", {
      fileName: "big.bin",
      content: big,
      overwrite: true,
      fields: [],
      onProgress,
    });
    expect(calls.addUsingPath).toHaveLength(0);
    expect(calls.addChunked).toHaveLength(1);
    expect(calls.addChunked[0]?.params).toMatchObject({ Overwrite: true });
    expect(onProgress.mock.calls.map((c) => c[0])).toEqual([
      { bytesUploaded: 0, bytesTotal: SINGLE_SHOT_MAX_BYTES },
      {
        bytesUploaded: SINGLE_SHOT_MAX_BYTES,
        bytesTotal: SINGLE_SHOT_MAX_BYTES,
      },
      {
        bytesUploaded: SINGLE_SHOT_MAX_BYTES,
        bytesTotal: SINGLE_SHOT_MAX_BYTES,
      },
    ]);
  });

  it("rejects immediately when the signal is already aborted", async () => {
    const { sp2, calls } = fakeSp();
    const provider = new SharePointProvider(sp2 as never);
    const ac = new AbortController();
    ac.abort();
    await expect(
      provider.uploadFileAsync(list, "/sites/dev/Docs", {
        fileName: "a.txt",
        content: "x",
        overwrite: false,
        fields: [],
        signal: ac.signal,
      }),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(calls.addUsingPath).toHaveLength(0);
  });

  it("aborts a chunked upload between chunks and best-effort deletes the stub", async () => {
    const ac = new AbortController();
    const { sp2, calls } = fakeSp({ chunkOffsets: [0, 1024, 2048] });
    // Abort after the first chunk's progress fires.
    const origGetFolder = sp2.web.getFolderByServerRelativePath;
    sp2.web.getFolderByServerRelativePath = (url: string) => {
      const folder = origGetFolder(url);
      const origChunked = folder.files.addChunked;
      folder.files.addChunked = (
        name: string,
        content: unknown,
        params: Record<string, unknown>,
      ) => {
        const userProgress = params.progress as (d: {
          uploadId: string;
          stage: string;
          offset: number;
        }) => void;
        return origChunked(name, content, {
          ...params,
          progress: (d: {
            uploadId: string;
            stage: string;
            offset: number;
          }) => {
            userProgress(d);
            ac.abort(); // abort after each progress tick — the next tick throws
          },
        });
      };
      return folder;
    };
    const provider = new SharePointProvider(sp2 as never);
    const big = new ArrayBuffer(SINGLE_SHOT_MAX_BYTES);
    await expect(
      provider.uploadFileAsync(list, "/sites/dev/Docs", {
        fileName: "big.bin",
        content: big,
        overwrite: false,
        fields: [],
        signal: ac.signal,
      }),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(calls.deleted).toEqual(["/sites/dev/Docs/big.bin"]);
  });

  it("propagates an already-exists collision from addUsingPath (overwrite=false)", async () => {
    const { sp2 } = fakeSp({
      addUsingPathError: { status: 500, message: "The file already exists." },
    });
    const provider = new SharePointProvider(sp2 as never);
    await expect(
      provider.uploadFileAsync(list, "/sites/dev/Docs", {
        fileName: "a.txt",
        content: "x",
        overwrite: false,
        fields: [],
      }),
    ).rejects.toMatchObject({ message: "The file already exists." });
  });

  it("throws a file-was-uploaded error when metadata carries HasException", async () => {
    const { sp2 } = fakeSp({
      validateRows: [
        {
          FieldName: "Title",
          FieldValue: "x",
          HasException: true,
          ErrorMessage: "bad value",
        },
      ],
    });
    const provider = new SharePointProvider(sp2 as never);
    await expect(
      provider.uploadFileAsync(list, "/sites/dev/Docs", {
        fileName: "a.txt",
        content: "x",
        overwrite: false,
        fields: [{ property: TITLE, value: "x" }],
      }),
    ).rejects.toThrow(/uploaded to '\/sites\/dev\/Docs\/a\.txt'.*bad value/s);
  });
});
