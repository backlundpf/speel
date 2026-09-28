/**
 * The OData path FileSize maps to. SharePoint's "File Size" list column
 * (`File_x0020_Size`) is computed and REST refuses to $select it — the supported
 * route to a document's size is the file object's Length, which is reachable only
 * as `$expand=File&$select=File/Length`. Length is an Int64, which SharePoint's
 * JSON serializes as a *string*; the provider types it as a number via the
 * property core passes with the read (core never sees the wire string).
 * @internal
 */
export const FILE_LENGTH_PATH = "File/Length";

/**
 * The column name a model author naturally reaches for when they want the file
 * size — and the one SharePoint rejects at query time. EntityTypeBuilder.build()
 * refuses it so the failure lands at model construction, not on a live tenant.
 * @internal
 */
export const COMPUTED_FILE_SIZE_COLUMN = "File_x0020_Size";

/**
 * The static brand EntityTypeBuilder tests for the documentLibrary inference. It
 * cannot import SpeelDocument itself — the decorators SpeelDocument declares its
 * members with lead back to EntityTypeBuilder, a module cycle — so the class carries
 * this brand and the builder reads it. This module imports nothing, so both sides
 * can import it.
 * @internal
 */
export const DOCUMENT_BRAND = Symbol.for("speel.document");
