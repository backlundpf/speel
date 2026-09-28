import { Entity, Key } from "./ModelBuilder/EntityTypeBuilder.js";
import { NumberField } from "./ModelBuilder/fieldTypes/NumberFieldBuilder.js";
import { TextField } from "./ModelBuilder/fieldTypes/TextFieldBuilder.js";

/**
 * A SharePoint security principal — a user or a group — as the User Information List
 * knows it: the value type of a person column that may hold either. `PrincipalType`
 * discriminates (1 = user, 4 = security group, 8 = SharePoint group; the UIL cannot
 * tell 4 from 8 and reports 8). Columns are in model spelling; the provider translates
 * per source. A canonical shape core ships: `@speel/identity` re-exports it and
 * declares the sets over it.
 */
@Entity({ source: { kind: "provider", key: "principals" } })
export class Principal {
  @Key public Id?: number = undefined;
  @TextField() public Title?: string = undefined;
  @TextField() public LoginName?: string = undefined;
  @TextField() public Email?: string = undefined;
  @NumberField() public PrincipalType?: number = undefined;
}
