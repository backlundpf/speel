// src/SharePointFileSystem.ts
//
// The IFileSystem half of the PnPjs provider: list folders and document-library
// files. SharePointProvider delegates every IFileSystem member here and hands
// over an ISharePointHost for the SPFI, list resolution, the shared root-URL
// cache and claims resolution. The selector imports register the invokable
// behaviours (`.rootFolder`, `.files`, `getFolderByServerRelativePath`, ...)
// the method bodies compile against.
import "@pnp/sp/webs/index.js";
import "@pnp/sp/lists/index.js";
import "@pnp/sp/items/index.js";
import "@pnp/sp/folders/index.js";
import "@pnp/sp/files/index.js";
// Value import (not just the selector side effect): checkin takes the enum.
import { CheckinType } from "@pnp/sp/files/index.js";
import type {
  FolderErrorCode,
  IError,
  IFileSystem,
  IFileUploadRequest,
  IFileUploadResult,
  IListHandle,
  IRenameResult,
} from "@speel/core";
import { Result } from "@speel/core";
import { BATCH_REQUEST_LIMIT } from "./batchLimits.js";
import { httpErrorFacts } from "./httpError.js";
import { toFormValues, type IFormValue } from "./formValues.js";
import type { ISharePointHost } from "./ISharePointHost.js";

// SharePoint signals "folder already exists" via an error (typically a 500)
// whose message contains this phrase; treat it as success so ensureFoldersAsync
// stays idempotent. Matched per $batch sub-response, on message content, not
// status (PnPjs wraps it loosely). Any other error is that folder's requestFailed.
// Verified live 2026-11-12 (samples/spfx-sample/tests/ensureFolders.spec.ts): a
// batch mixing an existing folder with new ones reports the existing one as ok.
// Caveats: the match is on English text (SharePoint localizes the message), and a
// FILE of the same name ("A file or folder with the name … already exists") would
// match too.
function isFolderExistsError(err: unknown): boolean {
  if (typeof err !== "object" || err === null) return false;
  const e = err as { message?: string; data?: { message?: string } };
  const msg = `${e.message ?? ""} ${e.data?.message ?? ""}`.toLowerCase();
  return msg.includes("already exists");
}

/** The list-relative parent of a list-relative folder path; "" at the list root. */
function parentOf(prefix: string): string {
  const i = prefix.lastIndexOf("/");
  return i < 0 ? "" : prefix.slice(0, i);
}

/** The last segment of a list-relative folder path. */
function leafOf(prefix: string): string {
  return prefix.slice(prefix.lastIndexOf("/") + 1);
}

/** A `requestFailed` error for `target`, from a rejected PnPjs request. */
function requestFailed(target: string, err: unknown): IError {
  const { status, message } = httpErrorFacts(err);
  return {
    code: "requestFailed" satisfies FolderErrorCode,
    message,
    ...(status !== undefined ? { status } : {}),
    target,
    cause: err,
  };
}

/** The parent-folder URL of a server-relative file/folder URL. */
function parentUrlOf(url: string): string {
  return url.slice(0, url.lastIndexOf("/"));
}

/** Content at/above this byte size uploads via addChunked (PnPjs chunked session). */
export const SINGLE_SHOT_MAX_BYTES = 10 * 1024 * 1024;

function contentByteSize(content: Blob | ArrayBuffer | string): number {
  if (typeof content === "string") return new Blob([content]).size; // UTF-8 byte length
  if (content instanceof ArrayBuffer) return content.byteLength;
  return content.size;
}

function abortError(): Error {
  const e = new Error("File upload aborted.");
  e.name = "AbortError";
  return e;
}

export class SharePointFileSystem implements IFileSystem {
  constructor(private readonly host: ISharePointHost) {}

  async ensureFoldersAsync(
    list: IListHandle,
    listRelativePaths: readonly string[],
  ): Promise<ReadonlyMap<string, Result<string>>> {
    const out = new Map<string, Result<string>>();
    if (listRelativePaths.length === 0) return out;
    const rootUrl = await this.host.resolveListRootUrl(list);

    // Every distinct path expands into its prefixes ("a", "a/b", "a/b/c"); a prefix
    // shared between paths is one node, created once. Stray '' / '//' segments are
    // skipped, defensively — core hands over normalized paths.
    const prefixesByPath = new Map<string, string[]>();
    const depthOf = new Map<string, number>();
    for (const path of new Set(listRelativePaths)) {
      const segs = path.split("/").filter((s) => s !== "");
      const prefixes = segs.map((_, i) => segs.slice(0, i + 1).join("/"));
      prefixesByPath.set(path, prefixes);
      prefixes.forEach((p, i) => depthOf.set(p, i + 1));
    }
    const maxDepth = Math.max(0, ...depthOf.values());

    // One depth at a time, shallowest first; each depth's ready nodes go out in
    // $batch chunks. Folders are created with AddSubFolderUsingPath on their PARENT
    // folder, which makes proper LIST folders (backed by a list item, so the list
    // view renders them and addValidateUpdateItemUsingPath can place items inside).
    // (web.folders.addUsingPath yields a bare file-system folder the list can't
    // render and won't accept items in.) null outcome = created or already there.
    const outcome = new Map<string, IError | null>();
    for (let depth = 1; depth <= maxDepth; depth++) {
      // A node is sent only once its parent exists; under a failed (or never
      // attempted) parent it is skipped, and its paths fail as parentFailed below.
      const ready = [...depthOf]
        .filter(([, d]) => d === depth)
        .map(([p]) => p)
        .filter((p) => {
          const parent = parentOf(p);
          return parent === "" || outcome.get(parent) === null;
        });
      for (let i = 0; i < ready.length; i += BATCH_REQUEST_LIMIT) {
        const chunk = ready.slice(i, i + BATCH_REQUEST_LIMIT);
        const [sp2, execute] = this.host.sp.batched({
          maxRequests: BATCH_REQUEST_LIMIT,
        });
        // Enrol every request synchronously — PnPjs binds a request to the batch
        // when it is invoked, so nothing may be awaited before the last call.
        // Each promise carries its own rejection handler: none can go unhandled,
        // even when abandoned after a batch failure.
        const settled = chunk.map((p) => {
          const parent = parentOf(p);
          return sp2.web
            .getFolderByServerRelativePath(
              parent === "" ? rootUrl : `${rootUrl}/${parent}`,
            )
            .addSubFolderUsingPath(leafOf(p))
            .then(
              () => null,
              (err: unknown) =>
                isFolderExistsError(err) ? null : requestFailed(p, err),
            );
        });
        // If the batch POST itself fails, PnPjs 4.20 never settles the queued
        // promises — awaiting them would hang. Every node in the chunk fails.
        const batchErr = await execute().then(
          () => null,
          (err: unknown) => err ?? new Error("The batch request failed."),
        );
        if (batchErr !== null) {
          for (const p of chunk) outcome.set(p, requestFailed(p, batchErr));
        } else {
          const results = await Promise.all(settled);
          results.forEach((e, k) => outcome.set(chunk[k]!, e));
        }
      }
    }

    // A path is decided by its shallowest failed prefix: its own node fails it as
    // requestFailed; a failed ancestor fails it as parentFailed.
    for (const [path, prefixes] of prefixesByPath) {
      const failedAt = prefixes.find((p) => outcome.get(p) != null);
      if (failedAt === undefined) {
        out.set(path, Result.ok(`${rootUrl}/${path}`));
        continue;
      }
      const own = outcome.get(failedAt)!;
      out.set(
        path,
        failedAt === prefixes[prefixes.length - 1]
          ? Result.fail({ ...own, target: path })
          : Result.fail({
              code: "parentFailed",
              message: `could not create parent folder '${failedAt}': ${own.message}`,
              target: path,
              cause: own,
            }),
      );
    }
    return out;
  }

  async uploadFileAsync(
    list: IListHandle,
    folderServerRelativeUrl: string | null,
    request: IFileUploadRequest,
  ): Promise<IFileUploadResult> {
    const { fileName, content, overwrite, fields, onProgress, signal } =
      request;
    if (signal?.aborted) throw abortError();
    // Resolve before a byte moves: an unresolvable principal must not leave a file
    // behind with half its metadata. No `fields` → no metadata call after the upload.
    const metadata: IFormValue[] = fields
      ? toFormValues(fields, await this.host.loginsFor(fields))
      : [];

    const folderUrl =
      folderServerRelativeUrl ?? (await this.host.resolveListRootUrl(list));
    const folder = this.host.sp.web.getFolderByServerRelativePath(folderUrl);
    const bytesTotal = contentByteSize(content);

    let info: { Name: string; ServerRelativeUrl: string };
    if (bytesTotal < SINGLE_SHOT_MAX_BYTES) {
      info = await folder.files.addUsingPath(fileName, content, {
        Overwrite: overwrite,
      });
    } else {
      // addChunked first creates an empty stub via addUsingPath (so an
      // Overwrite=false collision fails before any bytes move), then streams
      // chunks. Its progress callback runs synchronously before each chunk
      // POST — throwing from it aborts the loop between chunks.
      const chunkSource =
        typeof content === "string" ? new Blob([content]) : content;
      try {
        info = await folder.files.addChunked(fileName, chunkSource, {
          Overwrite: overwrite,
          progress: (data) => {
            if (signal?.aborted) throw abortError();
            onProgress?.({ bytesUploaded: data.offset, bytesTotal });
          },
        });
      } catch (err: unknown) {
        if ((err as Error | null)?.name === "AbortError") {
          // Best-effort: remove the stub addChunked created before the abort.
          try {
            await this.host.sp.web
              .getFileByServerRelativePath(`${folderUrl}/${fileName}`)
              .delete();
          } catch {
            /* cleanup is best-effort */
          }
        }
        throw err;
      }
    }
    onProgress?.({ bytesUploaded: bytesTotal, bytesTotal });

    // The upload implicitly created the list item; resolve it for the id + metadata.
    const file = this.host.sp.web.getFileByServerRelativePath(
      info.ServerRelativeUrl,
    );
    const item = await file.getItem("Id");
    const id = (item as unknown as { Id?: number }).Id;
    if (typeof id !== "number" || !Number.isFinite(id)) {
      throw new Error(
        `uploadFileAsync: file was uploaded to '${info.ServerRelativeUrl}' but the new item id could not be resolved.`,
      );
    }
    if (metadata.length > 0) {
      const rows = await item.validateUpdateListItem(metadata);
      const failed = rows.find((r) => r.HasException);
      if (failed) {
        // The file EXISTS at its URL — surface that explicitly; no rollback (spec §6).
        throw new Error(
          `uploadFileAsync: file was uploaded to '${info.ServerRelativeUrl}' but applying metadata failed: ` +
            `${failed.ErrorMessage ?? `field '${failed.FieldName}' failed`}. No rollback was attempted.`,
        );
      }
    }
    return {
      id,
      fileName: info.Name,
      serverRelativeUrl: info.ServerRelativeUrl,
    };
  }

  async renameFileAsync(
    list: IListHandle,
    itemId: number,
    newLeafName: string,
  ): Promise<IRenameResult> {
    // The item knows where its file lives; ask it rather than reconstructing the
    // URL from the list root (a document can sit in any folder of the library).
    const row = await this.host
      .list(list)
      .items.getById(itemId)
      .select("FileRef")();
    const currentUrl = (row as { FileRef?: string }).FileRef;
    if (!currentUrl) {
      throw new Error(
        `renameFileAsync: list item ${itemId} has no FileRef — it is not a document-library file.`,
      );
    }
    const destUrl = `${parentUrlOf(currentUrl)}/${newLeafName}`;
    // SP.MoveCopyUtil.MoveFileByPath with overwrite=false. Same-library moves keep
    // the item id and version history; an occupied destination fails the call.
    await this.host.sp.web
      .getFileByServerRelativePath(currentUrl)
      .moveByPath(destUrl, false);
    return { name: newLeafName, serverRelativeUrl: destUrl };
  }

  async copyFileAsync(
    sourceList: IListHandle,
    itemId: number,
    destList: IListHandle,
    destListRelativePath: string,
    newLeafName: string,
  ): Promise<IRenameResult> {
    const row = await this.host
      .list(sourceList)
      .items.getById(itemId)
      .select("FileRef")();
    const sourceUrl = (row as { FileRef?: string }).FileRef;
    if (!sourceUrl) {
      throw new Error(
        `copyFileAsync: list item ${itemId} has no FileRef — it is not a document-library file.`,
      );
    }
    const rootUrl = await this.host.resolveListRootUrl(destList);
    const destUrl = destListRelativePath
      ? `${rootUrl}/${destListRelativePath}/${newLeafName}`
      : `${rootUrl}/${newLeafName}`;
    // SP.MoveCopyUtil.CopyFileByPath with overwrite=false: an occupied
    // destination fails rather than being replaced.
    await this.host.sp.web
      .getFileByServerRelativePath(sourceUrl)
      .copyByPath(destUrl, false);
    return { name: newLeafName, serverRelativeUrl: destUrl };
  }

  async renameFolderAsync(
    list: IListHandle,
    listRelativePath: string,
    newName: string,
  ): Promise<IRenameResult> {
    const rootUrl = await this.host.resolveListRootUrl(list);
    const currentUrl = `${rootUrl}/${listRelativePath}`;
    const destUrl = `${parentUrlOf(currentUrl)}/${newName}`;
    // SP.MoveCopyUtil.MoveFolderByPath. Unlike the file verb it takes no
    // overwrite flag at all, so an occupied destination always fails — which is
    // the behavior the contract wants anyway.
    await this.host.sp.web
      .getFolderByServerRelativePath(currentUrl)
      .moveByPath(destUrl);
    return { name: newName, serverRelativeUrl: destUrl };
  }

  async deleteFolderAsync(
    list: IListHandle,
    listRelativePath: string,
  ): Promise<void> {
    const rootUrl = await this.host.resolveListRootUrl(list);
    // SP.Folder.Recycle — the folder and its whole subtree become one recycle-bin
    // entry, recoverable together. recycle() takes no options: the emptiness
    // guard (DeleteIfEmpty) lives on deleteWithParams, a hard delete, which is
    // not what a recycling contract should reach for.
    await this.host.sp.web
      .getFolderByServerRelativePath(`${rootUrl}/${listRelativePath}`)
      .recycle();
  }

  async checkinFileAsync(
    list: IListHandle,
    itemId: number,
    comment: string,
  ): Promise<void> {
    // Same shape as renameFileAsync: the item knows where its file lives.
    const row = await this.host
      .list(list)
      .items.getById(itemId)
      .select("FileRef")();
    const fileUrl = (row as { FileRef?: string }).FileRef;
    if (!fileUrl) {
      throw new Error(
        `checkinFileAsync: list item ${itemId} has no FileRef — it is not a document-library file.`,
      );
    }
    // CheckinType.Minor, passed explicitly because PnPjs defaults to Major.
    await this.host.sp.web
      .getFileByServerRelativePath(fileUrl)
      .checkin(comment, CheckinType.Minor);
  }
}
