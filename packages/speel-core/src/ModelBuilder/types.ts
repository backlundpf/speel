import type { Property } from "../Metadata/Property.js";
import type { PropertyBuilder } from "./PropertyBuilder.js";

/** Opaque storage shape for any field-type builder — only build is consumed downstream. */
export interface IFieldBuilder {
  build(propertyName: string, key: boolean): Property;
}

/** Type-erased PropertyBuilder, used for the builder's internal collections. */
export type AnyPB = PropertyBuilder<unknown>;
