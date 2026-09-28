import type { Principal, SiteGroup, SiteUser } from "@speel/core";
import type { RoleDefinition } from "./permissionTypes.js";

/**
 * A user by entity, by id, or by login name.
 *
 * `Principal` is included because that is what a Person/Group field materializes into — the
 * value an app already has in hand when it wants to add someone to a group.
 *
 * Every `user` parameter in this package is optional and defaults to the current user, since
 * "am I in this group" is the question that actually gets asked.
 */
export type UserRef = SiteUser | Principal | number | string;

/** A group by entity, by id, or by title. */
export type GroupRef = SiteGroup | number | string;

/**
 * Whoever a permission is granted to — a person or a group.
 *
 * SharePoint draws site users and site groups from one principal id space, so an id or an
 * entity resolves without ambiguity. A bare string is tried as a login name first and a group
 * title second; in practice they cannot collide, since logins are claims strings
 * (`i:0#.f|membership|…`) and group titles are display names.
 */
export type PrincipalRef = UserRef | GroupRef;

/** A role definition by entity, by id, or by name ("Contribute"). */
export type RoleRef = RoleDefinition | number | string;
