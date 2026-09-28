import type { FieldStateFn, FieldContext } from "../../types.js";
import type { IFieldState } from "../../Metadata/IFieldState.js";
import type {
  ValidationRule,
  FieldRenderFn,
} from "../../Metadata/Validation.js";
import type { TableFilterConfig } from "../../Metadata/TableFilterConfig.js";
import type { IValueCodec } from "../../Metadata/Property.js";

/** The mutable field-state slice each builder owns; FieldStateBuilder writes into it. */
export interface IFieldStateDraft {
  displayName?: string;
  required: boolean | FieldStateFn<unknown>;
  visible: boolean | FieldStateFn<unknown>;
  enabled: boolean | FieldStateFn<unknown>;
  render?: FieldRenderFn;
  tableFilter?: TableFilterConfig;
  customValidations: ValidationRule[];
  // column / schema refinements (shared by FieldBuilderBase and RelationshipBuilder)
  columnName?: string;
  description?: string;
  readOnly: boolean;
  indexed: boolean;
  hasDefault: boolean;
  defaultValue?: unknown;
  codec?: IValueCodec;
}

/** A fresh draft with the same defaults the old loose fields had. */
export function newFieldStateDraft(): IFieldStateDraft {
  return {
    required: false,
    visible: true,
    enabled: true,
    customValidations: [],
    readOnly: false,
    indexed: false,
    hasDefault: false,
  };
}

/**
 * The option keys that are field-state refinements (everything else routed by a field
 * builder is type config). Standalone so navigation decorators can reuse it without
 * inheriting FieldBuilderBase.
 */
export const REFINEMENT_KEYS = new Set<string>([
  "displayName",
  "required",
  "visible",
  "enabled",
  "readOnly",
  "indexed",
  "columnName",
  "description",
  "defaultValue",
  "render",
  "tableFilter",
  "validations",
  "codec",
]);

/** Apply one refinement option onto a draft. Standalone for nav-builder reuse. */
export function applyRefinement(
  state: IFieldStateDraft,
  key: string,
  value: unknown,
): void {
  if (key === "validations") {
    for (const r of value as ValidationRule[]) state.customValidations.push(r);
    return;
  }
  if (key === "defaultValue") {
    state.hasDefault = true;
    state.defaultValue = value;
    return;
  }
  (state as unknown as Record<string, unknown>)[key] = value;
}

/** Shared presentation surface for column field builders and relationship builders. */
export abstract class FieldStateBuilder<
  TSelf extends FieldStateBuilder<TSelf>,
> {
  protected abstract self(): TSelf;
  /** The mutable draft this builder writes into (owned by the subclass). */
  protected abstract state(): IFieldStateDraft;

  hasDisplayName(title: string): TSelf {
    this.state().displayName = title;
    return this.self();
  }

  isRequired(value?: boolean): TSelf;
  isRequired<E = Record<string, unknown>>(predicate: FieldStateFn<E>): TSelf;
  isRequired(arg: boolean | FieldStateFn<unknown> = true): TSelf {
    this.state().required = arg;
    return this.self();
  }

  isVisible(value?: boolean): TSelf;
  isVisible<E = Record<string, unknown>>(predicate: FieldStateFn<E>): TSelf;
  isVisible(arg: boolean | FieldStateFn<unknown> = true): TSelf {
    this.state().visible = arg;
    return this.self();
  }

  isEnabled(value?: boolean): TSelf;
  isEnabled<E = Record<string, unknown>>(predicate: FieldStateFn<E>): TSelf;
  isEnabled(arg: boolean | FieldStateFn<unknown> = true): TSelf {
    this.state().enabled = arg;
    return this.self();
  }

  hasRender<R, E = unknown>(render: (ctx: FieldContext<E>) => R): TSelf {
    this.state().render = render as FieldRenderFn;
    return this.self();
  }

  useTableFilter(config: TableFilterConfig): TSelf {
    this.state().tableFilter = config;
    return this.self();
  }

  hasValidation<E = Record<string, unknown>>(
    predicate: (ctx: FieldContext<E>) => boolean,
    message: string,
  ): TSelf {
    this.state().customValidations.push({
      validate: predicate as ValidationRule["validate"],
      message,
    });
    return this.self();
  }

  /** @internal — the IFieldState slice; required/refinement rules are derived later by buildValidations. */
  protected buildFieldState(
    displayName: string,
    readOnly: boolean,
  ): IFieldState {
    const s = this.state();
    return {
      displayName,
      required: s.required,
      visible: s.visible,
      enabled: s.enabled,
      readOnly,
      ...(s.render ? { render: s.render } : {}),
      ...(s.tableFilter ? { tableFilter: s.tableFilter } : {}),
      customValidations: s.customValidations,
    };
  }
}
