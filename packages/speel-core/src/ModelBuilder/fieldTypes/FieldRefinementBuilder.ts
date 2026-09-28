import type { IValueCodec } from "../../Metadata/Property.js";
import { FieldStateBuilder } from "./FieldStateBuilder.js";

/**
 * Column/schema refinements shared by the scalar field builders (FieldBuilderBase)
 * and the relationship builder (RelationshipBuilder). Writes into the subclass-owned
 * IFieldStateDraft via state(), so a navigation gets the full field surface without
 * inheriting FieldBuilderBase's single-Property emission contract.
 */
export abstract class FieldRefinementBuilder<
  TSelf extends FieldRefinementBuilder<TSelf>,
> extends FieldStateBuilder<TSelf> {
  isReadOnly(value = true): TSelf {
    this.state().readOnly = value;
    return this.self();
  }
  isIndexed(value = true): TSelf {
    this.state().indexed = value;
    return this.self();
  }
  hasColumnName(internalName: string): TSelf {
    this.state().columnName = internalName;
    return this.self();
  }
  hasDescription(text: string): TSelf {
    this.state().description = text;
    return this.self();
  }
  hasDefaultValue(value: unknown): TSelf {
    this.state().hasDefault = true;
    this.state().defaultValue = value;
    return this.self();
  }

  /**
   * The model ↔ field-value converter, and optionally how the value looks inside a
   * Json column. Generic so the callbacks' bodies are checked: `Property` stores
   * the erased `IValueCodec`, and the cast happens here, once. Slots the caller
   * omits stay unset on this property and fall through to the field kind's
   * default, if any.
   */
  hasCodec<M, P>(codec: {
    toProvider?(model: M): P;
    fromProvider?(provider: P): M;
    toWire?(value: P): unknown;
    fromWire?(raw: unknown): P;
  }): TSelf {
    this.state().codec = codec as IValueCodec;
    return this.self();
  }
}
