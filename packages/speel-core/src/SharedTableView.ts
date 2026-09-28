import { Entity, Key } from "./ModelBuilder/EntityTypeBuilder.js";
import {
  NoteField,
  TextField,
} from "./ModelBuilder/fieldTypes/TextFieldBuilder.js";
import { SpeelEntity } from "./SpeelEntity.js";

/** The list title every speel app provisions for published table views. */
export const SHARED_VIEWS_LIST = "Speel Shared Views";

/**
 * A table view published for everyone.
 *
 * Carries **no item-level security**, unlike `UserSetting`: every user must read every row.
 * Restricting *writes* to administrators is a SharePoint list-permissions change — break
 * inheritance, grant Contribute to an owners group — which no migration operation can express,
 * so a freshly provisioned list inherits site permissions and anyone with Contribute can
 * publish. Locking it down is a required setup step, not an optional one.
 *
 * That is the design working as intended rather than a gap: write access to this list *is* the
 * publish permission, so the tenant decides who has it using SharePoint's own tooling and the
 * client only reports what the tenant already decided.
 */
@Entity({ list: SHARED_VIEWS_LIST })
export class SharedTableView extends SpeelEntity {
  @Key public override Id?: number = undefined;

  /** The view's name, in the list's built-in Title column. */
  @TextField()
  public Title: string | null = null;

  /** Which table it belongs to — the `tableId` passed to `useTableViews`. */
  @TextField()
  public TableId: string | null = null;

  /** The arrangement, JSON-encoded. */
  @NoteField()
  public Descriptor: string | null = null;
}
