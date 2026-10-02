import type { EntityType } from "./EntityType.js";
import type { Property } from "./Property.js";
import type { IFieldState } from "./IFieldState.js";
import type { FieldConfig } from "./FieldConfig.js";

export type NavigationKind = "reference" | "collection";

export type NavigationStorage =
  | "self-fk-scalar" // FK column lives on this entity, scalar (Blog.Author, Comment.Blog)
  | "self-fk-array" // FK column lives on this entity, array (Blog.Tags — multi-value Lookup)
  | "inverse-fk"; // FK column lives on the target entity (Blog.Comments — inverse collection)

export interface INavigation extends IFieldState {
  readonly name: string;
  /** SharePoint internal name of the lookup column (the $expand target). Defaults to `name`. */
  readonly columnName: string;
  /** Optional help text (presentation). */
  readonly description?: string;
  readonly kind: NavigationKind;
  readonly storage: NavigationStorage;
  readonly target: EntityType;
  readonly foreignKey: Property;
  /** The provider owns this column (a built-in): migrations never provision it. */
  readonly systemGenerated: boolean;
  config: FieldConfig;
  inverse?: INavigation; // populated when both sides declared (not readonly: resolved at finalize)
}
