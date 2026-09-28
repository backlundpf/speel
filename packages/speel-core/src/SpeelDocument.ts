import { NumberField } from "./ModelBuilder/fieldTypes/NumberFieldBuilder.js";
import { ManyToOne } from "./ModelBuilder/navigations/relationshipDecorators.js";
import { DOCUMENT_BRAND, FILE_LENGTH_PATH } from "./documentColumns.js";
import { SiteUser } from "./SiteUser.js";
import { SpeelEntity } from "./SpeelEntity.js";
export {
  FILE_LENGTH_PATH,
  COMPUTED_FILE_SIZE_COLUMN,
} from "./documentColumns.js";

/**
 * Base class for document-library entities: SpeelEntity's system members plus the
 * file identity members, declared with the same decorators and inherited the same
 * way. Extending this class is the entire opt-in — provisioning infers the
 * documentLibrary template from the brand, and no per-entity registration is required.
 */
export abstract class SpeelDocument extends SpeelEntity {
  static readonly [DOCUMENT_BRAND] = true;

  /** Size in bytes: SharePoint's computed File Size column is unselectable, so this reads the file object's Length through an expand. */
  @NumberField({
    columnName: FILE_LENGTH_PATH,
    displayName: "File Size",
    readOnly: true,
    visible: false,
  })
  readonly FileSize?: number = undefined;

  /** Checked out to; undefined/null means checked in. Read with .include(), not an inline $expand. */
  @ManyToOne(() => SiteUser, {
    readOnly: true,
    visible: false,
    columnName: "CheckoutUser",
    foreignKey: "CheckedOutById",
  })
  readonly CheckedOutBy?: SiteUser = undefined;
  readonly CheckedOutById?: number = undefined;
}
