// src/SharePointFileSystem.ts
//
// The IFileSystem half of the PnPjs provider: list folders and document-library
// files. SharePointProvider delegates every IFileSystem member here and hands
// over an ISharePointHost for the SPFI, list resolution, the shared root-URL
// cache and claims resolution. The selector imports register the invokable
// behaviours (`.rootFolder`, `.files`, `getFolderByServerRelativePath`, ...)
// the method bodies compile against.
import type { IFolder } from "@pnp/sp/folders/index.js";
import "@pnp/sp/webs/index.js";
import "@pnp/sp/lists/index.js";
import "@pnp/sp/items/index.js";
import "@pnp/sp/folders/index.js";
import "@pnp/sp/files/index.js";
// Value import (not just the selector side effect): checkin takes the enum.
import { CheckinType } from "@pnp/sp/files/index.js";
import type {
  IFileSystem,
  IFileUploadRequest,
  IFileUploadResult,
  IListHandle,
  IRenameResult,
} from "@speel/core";
import { toFormValues, type IFormValue } from "./formValues.js";
import type { ISharePointHost } from "./ISharePointHost.js";

// SharePoint signals "folder already exists" via an error (typically a 500)
// whose message contains this phrase; treat it as success so ensureFoldersAsync
// stays idempotent. Matched on message content, not status (PnPjs wraps it loosely).
// NOTE: best-effort — this string match has not yet been confirmed against a live
// tenant. If addUsingPath(url, false) turns out to be idempotent (returns the
// existing folder instead of throwing), this branch never fires and behavior is
// unchanged. Unrelated errors are rethrown by the caller.
function isFolderExistsError(err: unknown): boolean {
  if (typeof err !== "object" || err === null) return false;
  const e = err as { message?: string; data?: { message?: string } };
  const msg = `${e.message ?? ""} ${e.data?.message ?? ""}`.toLowerCase();
  return msg.includes("already exists");
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
  ): Promise<Map<string, string>> {
    if (listRelativePaths.length === 0) return new Map();
    const rootUrl = await this.host.resolveListRootUrl(list);

    // Create each path as proper LIST folders, segment by segment, from the list's
    // rootFolder via addSubFolderUsingPath. This is essential: a list folder created
    // this way is backed by a list item, so the list view renders it and
    // addValidateUpdateItemUsingPath can place items inside it. (web.folders.addUsingPath
    // yields a bare file-system folder the list can't render and won't accept items in.)
    for (const path of new Set(listRelativePaths)) {
      let folder: IFolder = this.host.list(list).rootFolder;
      for (const seg of path.split("/")) {
        if (seg === "") continue; // defensive: skip stray '' / '//' segments
        try {
          folder = await folder.addSubFolderUsingPath(seg);
        } catch (err: unknown) {
          if (!isFolderExistsError(err)) throw err;
          folder = folder.folders.getByUrl(seg); // already exists — descend into it
        }
      }
    }

    const out = new Map<string, string>();
    for (const path of listRelativePaths) out.set(path, `${rootUrl}/${path}`);
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
