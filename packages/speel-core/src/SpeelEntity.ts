import { DateTimeField } from "./ModelBuilder/fieldTypes/DateTimeFieldBuilder.js";
import { NumberField } from "./ModelBuilder/fieldTypes/NumberFieldBuilder.js";
import { TextField } from "./ModelBuilder/fieldTypes/TextFieldBuilder.js";
import { ManyToOne } from "./ModelBuilder/navigations/relationshipDecorators.js";
import { SiteUser } from "./SiteUser.js";

/**
 * Base class for list-backed entities: the system members every row carries,
 * declared with the same decorators any entity uses and inherited by every
 * subclass — fluent or decorated — through the builder's walk up the constructor
 * chain. Extending this class is the entire opt-in.
 *
 * The column names are the contract's vocabulary: SharePoint answers them
 * verbatim; another provider translates on its side of the boundary.
 *
 * Every member is SharePoint's own column, so each is `systemGenerated`: never
 * provisioned, and (implied) read-only — never sent on save.
 *
 * Every field initializes to `undefined` (not `null`): DbSet.add() rejects a
 * new entity if any read-only property holds a non-undefined value.
 */
export abstract class SpeelEntity {
  Id?: number = undefined;

  @DateTimeField({ systemGenerated: true }) readonly Created?: Date = undefined;
  @DateTimeField({ systemGenerated: true }) readonly Modified?: Date =
    undefined;

  /** Created By — a site user by definition, so the navigation targets SiteUser. */
  @ManyToOne(() => SiteUser, { systemGenerated: true, foreignKey: "AuthorId" })
  readonly Author?: SiteUser = undefined;
  readonly AuthorId?: number = undefined;

  /** Modified By. */
  @ManyToOne(() => SiteUser, { systemGenerated: true, foreignKey: "EditorId" })
  readonly Editor?: SiteUser = undefined;
  readonly EditorId?: number = undefined;

  /** 0 item, 1 folder. */
  @NumberField({ systemGenerated: true, visible: false })
  readonly FSObjType?: number = undefined;
  /** Server-relative parent folder URL. */
  @TextField({ systemGenerated: true, visible: false })
  readonly FileDirRef?: string = undefined;
  /**
   * Row leaf name (a folder row's is the folder name). On a list item it is
   * SharePoint's `{ID}_.000` placeholder, so it is read-only here;
   * SpeelDocument redeclares it writable (there it is the file name).
   */
  @TextField({ systemGenerated: true, visible: false })
  readonly FileLeafRef?: string = undefined;
  /** Server-relative URL of the row. */
  @TextField({ systemGenerated: true, visible: false })
  readonly FileRef?: string = undefined;
  // Item-level permission members are @speel/identity's (module augmentation).
}
