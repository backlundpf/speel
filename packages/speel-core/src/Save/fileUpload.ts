// src/Save/fileUpload.ts
import { InvalidOperationException } from "../errors.js";
import type { IFileUploadProgress } from "../providers/ISharePointProvider.js";
import type { EntityType } from "../Metadata/EntityType.js";

/**
 * Patch mapping the server's file facts onto the model-mapped properties
 * (FileLeafRef → stored name, FileRef → server-relative URL). One definition of
 * which properties mirror the server's file identity, shared by the upload
 * reconcile (SaveExecutor) and renameFileAsync (DbSet).
 */
export function fileFactsPatch(
  et: EntityType,
  name: string,
  serverRelativeUrl: string,
): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  const leaf = et.findByColumnName("FileLeafRef");
  if (leaf) patch[leaf.propertyName] = name;
  const ref = et.findByColumnName("FileRef");
  if (ref) patch[ref.propertyName] = serverRelativeUrl;
  return patch;
}

/** File content passed to {@link DbSet.add} via `IAddOptions.file`. */
export interface IFileContent {
  /** File name incl. extension. Optional when content is a File (defaults to File.name). */
  name?: string;
  content: File | Blob | ArrayBuffer | string;
  /** Replace an existing file at the path. Default false → the save fails if it exists. */
  overwrite?: boolean;
  /** Fired per uploaded chunk (once, on completion, for single-shot uploads). */
  onProgress?: (p: IFileUploadProgress) => void;
  /** Cancels an in-flight upload; the save fails that entry. */
  signal?: AbortSignal;
}

/** Resolved form of {@link IFileContent}, staged on the EntityEntry at add() time. */
export interface IStagedFile {
  fileName: string;
  content: File | Blob | ArrayBuffer | string;
  overwrite: boolean;
  onProgress?: ((p: IFileUploadProgress) => void) | undefined;
  signal?: AbortSignal | undefined;
}

/**
 * Resolve and validate `IAddOptions.file` synchronously at add() time (like
 * normalizeFolderPath for the folder option): explicit name wins, else File.name,
 * else throw; reject empty names and path separators — the directory part
 * belongs in the `folder` option.
 */
export function resolveStagedFile(file: IFileContent): IStagedFile {
  const raw =
    file.name ??
    (typeof File !== "undefined" && file.content instanceof File
      ? file.content.name
      : undefined);
  if (raw === undefined) {
    throw new InvalidOperationException(
      `add(): file.name is required unless file.content is a File.`,
    );
  }
  const fileName = raw.trim();
  if (fileName === "") {
    throw new InvalidOperationException(`add(): file name must not be empty.`);
  }
  if (fileName.includes("/") || fileName.includes("\\")) {
    throw new InvalidOperationException(
      `add(): file name '${fileName}' must not contain path separators — pass the directory in the 'folder' option.`,
    );
  }
  return {
    fileName,
    content: file.content,
    overwrite: file.overwrite ?? false,
    onProgress: file.onProgress,
    signal: file.signal,
  };
}
