import { Entity } from "./ModelBuilder/EntityTypeBuilder.js";
import { TextField } from "./ModelBuilder/fieldTypes/TextFieldBuilder.js";
import { Principal } from "./Principal.js";

/** A SharePoint group (`web/sitegroups`). Everything that source returns is `PrincipalType` 8. */
@Entity({ source: { kind: "provider", key: "siteGroups" } })
export class SiteGroup extends Principal {
  @TextField() public Description?: string = undefined;
  @TextField() public OwnerTitle?: string = undefined;
}
