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
 * Every field initializes to `undefined` (not `null`): DbSet.add() rejects a
 * new entity if any read-only property holds a non-undefined value.
 */
export abstract class SpeelEntity {
  Id?: number = undefined;

  @DateTimeField({ readOnly: true }) readonly Created?: Date = undefined;
  @DateTimeField({ readOnly: true }) readonly Modified?: Date = undefined;

  /** Created By — a site user by definition, so the navigation targets SiteUser. */
  @ManyToOne(() => SiteUser, { readOnly: true, foreignKey: "AuthorId" })
  readonly Author?: SiteUser = undefined;
  readonly AuthorId?: number = undefined;

  /** Modified By. */
  @ManyToOne(() => SiteUser, { readOnly: true, foreignKey: "EditorId" })
  readonly Editor?: SiteUser = undefined;
  readonly EditorId?: number = undefined;

  /** 0 item, 1 folder. */
  @NumberField({ readOnly: true, visible: false }) readonly FSObjType?: number =
    undefined;
  /** Server-relative parent folder URL. */
  @TextField({ readOnly: true, visible: false }) readonly FileDirRef?: string =
    undefined;
  /**
   * Row leaf name (a folder row's is the folder name). Writable like any text
   * column: a changed value saves through the normal update, which renames.
   */
  @TextField({ visible: false }) FileLeafRef?: string = undefined;
  /** Server-relative URL of the row. */
  @TextField({ readOnly: true, visible: false }) readonly FileRef?: string =
    undefined;
  // Item-level permission members are @speel/identity's (module augmentation).
}
