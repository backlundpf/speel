// test/SharePointProvider.checkin.test.ts
import { describe, it, expect } from "vitest";
import { SharePointProvider } from "../src/SharePointProvider.js";

const list = { kind: "title" as const, value: "Docs" };

/** Fake spfi recording the item read and the checkin call it produced. */
function fakeSp(opts?: {
  fileRef?: string | undefined;
  checkinError?: unknown;
}) {
  const calls: {
    itemSelects: { id: number; fields: string[] }[];
    fileRequests: string[];
    checkins: { comment: string | undefined; type: number | undefined }[];
  } = { itemSelects: [], fileRequests: [], checkins: [] };

  const makeList = () => ({
    items: {
      getById: (id: number) => ({
        select: (...fields: string[]) => {
          calls.itemSelects.push({ id, fields });
          return async () =>
            "fileRef" in (opts ?? {})
              ? { FileRef: opts?.fileRef }
              : { FileRef: "/sites/dev/Docs/a/q2.pdf" };
        },
      }),
    },
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sp2: any = {
    web: {
      lists: { getByTitle: makeList, getById: makeList },
      getFileByServerRelativePath: (src: string) => {
        calls.fileRequests.push(src);
        return {
          checkin: (comment?: string, type?: number) => {
            calls.checkins.push({ comment, type });
            if (opts?.checkinError) return Promise.reject(opts.checkinError);
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

describe("SharePointProvider.checkinFileAsync", () => {
  it("resolves the item's FileRef and checks it in as a MINOR version", async () => {
    const { sp2, calls } = fakeSp();
    const provider = new SharePointProvider(sp2 as never);
    await provider.checkinFileAsync(list, 7, "done");
    expect(calls.itemSelects).toEqual([{ id: 7, fields: ["FileRef"] }]);
    expect(calls.fileRequests).toEqual(["/sites/dev/Docs/a/q2.pdf"]);
    // CheckinType.Minor === 0. Passed explicitly: PnPjs defaults to Major.
    expect(calls.checkins).toEqual([{ comment: "done", type: 0 }]);
  });

  it("sends an empty comment rather than omitting it", async () => {
    const { sp2, calls } = fakeSp();
    const provider = new SharePointProvider(sp2 as never);
    await provider.checkinFileAsync(list, 7, "");
    expect(calls.checkins).toEqual([{ comment: "", type: 0 }]);
  });

  it("throws — without checking anything in — when the item has no FileRef", async () => {
    const { sp2, calls } = fakeSp({ fileRef: undefined });
    const provider = new SharePointProvider(sp2 as never);
    await expect(provider.checkinFileAsync(list, 7, "")).rejects.toThrow(
      /FileRef/,
    );
    expect(calls.checkins).toHaveLength(0);
  });

  it("propagates a checkin failure (e.g. the file is not checked out)", async () => {
    const { sp2 } = fakeSp({
      checkinError: { status: 400, message: "The file is not checked out." },
    });
    const provider = new SharePointProvider(sp2 as never);
    await expect(provider.checkinFileAsync(list, 7, "")).rejects.toMatchObject({
      message: "The file is not checked out.",
    });
  });
});
