import { Entity } from "./ModelBuilder/EntityTypeBuilder.js";
import { Principal } from "./Principal.js";

/**
 * A site user (`web/siteusers`) — same columns as `Principal`, a distinct type so a
 * set and `instanceof` can tell it apart. Not users-only on the wire: SharePoint
 * returns claims security groups from the same collection, with `PrincipalType` 4.
 * `SpeelEntity`'s `Author`/`Editor` (and `SpeelDocument.CheckedOutBy`) target it.
 */
@Entity({ source: { kind: "provider", key: "siteUsers" } })
export class SiteUser extends Principal {}
