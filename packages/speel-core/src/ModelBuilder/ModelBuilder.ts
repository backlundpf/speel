// src/ModelBuilder/ModelBuilder.ts
import type { IEntity, EntityCtor } from "../types.js";
import { ENTITY_REGISTRY, EntityTypeBuilder } from "./EntityTypeBuilder.js";
import { decoratorAppliersOf } from "./decorators.js";
import { Model } from "../Metadata/Model.js";
import {
  ModelConfigurationException,
  NavigationConfigurationException,
} from "../errors.js";
import { EntityType } from "../Metadata/EntityType.js";
import { Property } from "../Metadata/Property.js";
import type { JsonFieldConfig } from "../Metadata/FieldConfig.js";
import type { INavigation, NavigationStorage } from "../Metadata/Navigation.js";
import type { SpecialExpand } from "../Query/SpecialExpand.js";

export class ModelBuilder {
  private readonly entityBuilders: EntityTypeBuilder<IEntity>[] = [];
  private readonly specialExpands = new Map<string, SpecialExpand>();

  /**
   * Register a special expandable (see SpecialExpand): `.expand()` selectors naming it get
   * the handler's wire clause and materializer instead of the navigation machinery.
   */
  addSpecialExpand(handler: SpecialExpand): void {
    if (this.specialExpands.has(handler.navName)) {
      throw new ModelConfigurationException(
        `Special expand '${handler.navName}' registered more than once.`,
      );
    }
    this.specialExpands.set(handler.navName, handler);
  }

  /** @internal — the builder for ctor, idempotent by ctor; pulls the decorator-registered one if present. */
  getOrCreateEntityBuilder<T extends IEntity>(
    ctor: EntityCtor<T>,
  ): EntityTypeBuilder<T> {
    const existing = this.entityBuilders.find((eb) => eb.ctor === ctor);
    if (existing) return existing as unknown as EntityTypeBuilder<T>;
    // A registry builder was replayed once at @Entity time; a fresh one gets the
    // same replay here so fluent configuration runs on top of decorator intent.
    let eb = ENTITY_REGISTRY.get(ctor) as EntityTypeBuilder<T> | undefined;
    if (!eb) {
      eb = new EntityTypeBuilder<T>(ctor);
      eb.replay(decoratorAppliersOf(ctor));
    }
    this.entityBuilders.push(eb as unknown as EntityTypeBuilder<IEntity>);
    return eb;
  }

  entity<T extends IEntity>(
    ctor: EntityCtor<T>,
    configure?: (b: EntityTypeBuilder<T>) => void,
  ): EntityTypeBuilder<T> {
    const eb = this.getOrCreateEntityBuilder(ctor);
    if (configure) configure(eb);
    return eb;
  }

  /**
   * Register a shape — an embedded type used by a `Json` field. Same builder as an
   * entity's, minus rows: `toEmbedded()` is applied for a ctor that arrives without
   * a `@JsonShape` decorator.
   */
  shape<T extends IEntity>(
    ctor: EntityCtor<T>,
    configure?: (b: EntityTypeBuilder<T>) => void,
  ): EntityTypeBuilder<T> {
    const eb = this.getOrCreateEntityBuilder(ctor);
    // A class is an entity or a shape, never both — and overwriting the source
    // here would not stay local to this model: a decorated class's builder is
    // the one in the shared registry, so every later model in the process would
    // build it as embedded too.
    const existing = eb.getSource();
    if (existing && existing.kind !== "embedded") {
      throw new ModelConfigurationException(
        `${ctor.name} is already declared as an entity (source: ${existing.kind}) and cannot also be a shape.`,
      );
    }
    if (!eb.isEmbedded) eb.toEmbedded();
    if (configure) configure(eb);
    return eb;
  }

  /** @internal */
  build(): Model {
    if (this.entityBuilders.length === 0) {
      throw new ModelConfigurationException(
        "Model has no entities. Register at least one with entity(...).",
      );
    }

    // A navigation target the consumer never registered but a decorator did is
    // part of this model by reference — pulled in transitively, so `set(Review)`
    // brings Book and Author along. Decorator entities nobody references stay out.
    // A Json field's shape is pulled in the same way: referenced, therefore present.
    // Iterating by index over the growing list is the transitive closure.
    for (let i = 0; i < this.entityBuilders.length; i++) {
      for (const cfg of this.entityBuilders[i]!.getNavConfigs()) {
        const target = cfg.targetCtor;
        if (this.entityBuilders.some((eb) => eb.ctor === target)) continue;
        if (ENTITY_REGISTRY.has(target)) this.getOrCreateEntityBuilder(target);
      }
      for (const { thunk } of this.entityBuilders[i]!.getJsonShapeRefs()) {
        const target = thunk();
        if (this.entityBuilders.some((eb) => eb.ctor === target)) continue;
        // Not a registered shape/entity at all — reported below, once every
        // EntityType exists, so the error can point at the property that named it.
        if (!ENTITY_REGISTRY.has(target)) continue;
        this.getOrCreateEntityBuilder(target);
      }
    }

    for (const eb of this.entityBuilders) eb.resetSynthesizedFks();

    const builderByCtor = new Map<EntityCtor, EntityTypeBuilder<IEntity>>();
    for (const eb of this.entityBuilders) builderByCtor.set(eb.ctor, eb);

    // FK columns to resolve config.target once all EntityTypes exist.
    const pendingFks: {
      ownerCtor: EntityCtor;
      propertyName: string;
      targetCtor: EntityCtor;
    }[] = [];

    // Json properties to resolve config.shape once all EntityTypes exist — the
    // same late-resolution shape as pendingFks, gathered up front so it survives
    // entityBuilders growing while stage 1/2 synthesize FK columns.
    const pendingShapes: {
      ownerCtor: EntityCtor;
      propertyName: string;
      thunk: () => EntityCtor<IEntity>;
    }[] = [];
    for (const eb of this.entityBuilders) {
      for (const ref of eb.getJsonShapeRefs()) {
        pendingShapes.push({
          ownerCtor: eb.ctor,
          propertyName: ref.propertyName,
          thunk: ref.thunk,
        });
      }
    }

    // Stage 1 — self-FK columns (withMany): FK lives on the declaring entity.
    for (const eb of this.entityBuilders) {
      for (const cfg of eb.getNavConfigs()) {
        if (cfg.foreignKeySide !== "self") continue;
        const lookupColumn = cfg.fieldState.columnName ?? cfg.name;
        const fkColumn = `${lookupColumn}Id`;
        const fkProperty = cfg.foreignKeyName ?? fkColumn;
        if (eb.hasProperty(fkProperty)) {
          if (!eb.findSynthesizedFk(fkProperty)) {
            throw new NavigationConfigurationException(
              `Navigation '${cfg.name}' on ${eb.ctor.name}: FK column '${fkProperty}' conflicts with a declared property.`,
            );
          }
          continue; // already synthesized (idempotent)
        }
        eb.addForeignKeyProperty(
          new Property({
            propertyName: fkProperty,
            columnName: fkColumn,
            displayName: fkColumn,
            config: {
              kind: "Lookup",
              target: undefined as unknown as EntityType, // resolved in the pending-FK loop below
              displayField: cfg.displayField ?? "Title",
              multi: cfg.isMultiValue,
            },
            required:
              cfg.fieldState.required === true ||
              typeof cfg.fieldState.required === "function",
            readOnly: cfg.fieldState.readOnly || (cfg.readOnly ?? false),
            indexed: cfg.fieldState.indexed,
            key: false,
            ...(cfg.fieldState.hasDefault
              ? { defaultValue: cfg.fieldState.defaultValue }
              : {}),
            ...(cfg.fieldState.codec ? { codec: cfg.fieldState.codec } : {}),
          }),
        );
        pendingFks.push({
          ownerCtor: eb.ctor,
          propertyName: fkProperty,
          targetCtor: cfg.targetCtor,
        });
      }
    }

    // Stage 2 — child-FK columns (withOne): FK lives on the target (child) entity.
    for (const eb of this.entityBuilders) {
      for (const cfg of eb.getNavConfigs()) {
        if (cfg.foreignKeySide !== "child") continue;
        const s = cfg.fieldState;
        if (
          s.columnName !== undefined ||
          s.hasDefault ||
          s.indexed ||
          s.codec !== undefined
        ) {
          throw new NavigationConfigurationException(
            `Navigation '${cfg.name}' on ${eb.ctor.name}: column-level refinements (hasColumnName/hasDefaultValue/isIndexed/hasCodec) are only valid on the FK-owning side, not an inverse (withOne) navigation.`,
          );
        }
        if (cfg.optionsCreateAsync) {
          throw new NavigationConfigurationException(
            `Navigation '${cfg.name}' on ${eb.ctor.name}: hasOptionsCreateAsync() is only valid on the FK-owning side — an inverse (withOne) navigation has no foreign key of its own to create against.`,
          );
        }
        const fkProperty =
          cfg.foreignKeyName ??
          (cfg.inverseNavName ? `${cfg.inverseNavName}Id` : undefined);
        if (!fkProperty) {
          throw new NavigationConfigurationException(
            `Navigation '${cfg.name}' on ${eb.ctor.name}: cannot infer the foreign key — supply withOne(inverse) or hasForeignKey().`,
          );
        }
        const childBuilder = builderByCtor.get(cfg.targetCtor);
        if (!childBuilder) {
          throw new NavigationConfigurationException(
            `Navigation '${cfg.name}' on ${eb.ctor.name}: target entity ${cfg.targetCtor.name} is not registered.`,
          );
        }
        if (childBuilder.hasProperty(fkProperty)) continue; // reuse (bidirectional)
        childBuilder.addForeignKeyProperty(
          new Property({
            propertyName: fkProperty,
            columnName: fkProperty,
            displayName: fkProperty,
            config: {
              kind: "Lookup",
              target: undefined as unknown as EntityType,
              displayField: cfg.displayField ?? "Title",
              multi: false,
            },
            required: false,
            readOnly: cfg.readOnly ?? false,
            key: false,
          }),
        );
        pendingFks.push({
          ownerCtor: cfg.targetCtor,
          propertyName: fkProperty,
          targetCtor: eb.ctor,
        });
      }
    }

    // Build EntityTypes (now including synthesized FK columns).
    const ets = this.entityBuilders.map((eb) => eb.build());

    // Special expands are live-read only: their payloads (e.g. permission state) must be
    // fresh, and the cache pipeline has no way to delta-sync a computed clause.
    for (const et of ets) {
      for (const ex of et.cache?.expands ?? []) {
        if (this.specialExpands.has(ex.navName)) {
          throw new ModelConfigurationException(
            `Cache expand '${ex.navName}' on ${et.ctor.name} names a special expand — special expands are live-read only.`,
          );
        }
      }
    }

    const model = new Model(ets, this.specialExpands);

    // Resolve config.target for every synthesized FK.
    for (const pf of pendingFks) {
      const ownerEt = model.findEntityType(pf.ownerCtor)!;
      const prop = ownerEt.findProperty(pf.propertyName)!;
      const target = model.findEntityType(pf.targetCtor);
      if (!target) {
        throw new NavigationConfigurationException(
          `FK column '${pf.propertyName}' on ${pf.ownerCtor.name} targets unregistered entity ${pf.targetCtor.name}.`,
        );
      }
      if (prop.config.kind === "Lookup") {
        prop.config.target = target;
      }
    }

    // Resolve config.shape for every Json property, in the same late pass:
    // every EntityType now exists, including any shape pulled in above only
    // because a Json field named it.
    for (const ps of pendingShapes) {
      const ownerEt = model.findEntityType(ps.ownerCtor)!;
      const prop = ownerEt.findProperty(ps.propertyName)!;
      const ctor = ps.thunk();
      const shape = model.findEntityType(ctor);
      if (!shape || !shape.isEmbedded) {
        throw new ModelConfigurationException(
          `${ownerEt.ctor.name}.${ps.propertyName}: ${ctor.name} is not a shape — declare it with @JsonShape() (or mb.shape(...)).`,
        );
      }
      if (prop.config.kind === "Json") {
        (prop.config as JsonFieldConfig).shape = shape;
      }
    }

    // Build navigations and pair inverses.
    interface IPendingNav {
      record: INavigation;
      inverseNavName?: string;
    }
    const pendings: IPendingNav[] = [];

    for (let i = 0; i < this.entityBuilders.length; i++) {
      const eb = this.entityBuilders[i]!;
      const et = ets[i]!;
      for (const cfg of eb.getNavConfigs()) {
        const target = model.findEntityType(cfg.targetCtor);
        if (!target) {
          throw new NavigationConfigurationException(
            `Navigation '${cfg.name}' on ${et.ctor.name}: target entity ${cfg.targetCtor.name} is not registered.`,
          );
        }
        // A shape lives inside a column: no rows, no key, nothing to expand
        // against. Caught here rather than left to the query layer, which would
        // only fail later, on the first load, with "Shape X has no key".
        if (target.isEmbedded) {
          throw new NavigationConfigurationException(
            `Navigation '${cfg.name}' on ${et.ctor.name}: ${target.ctor.name} is a shape, embedded in a column — a navigation needs rows with keys to point at. Store it as a Json field (@JsonField/@MultiJsonField) instead.`,
          );
        }
        let storage: NavigationStorage;
        let fkProp: Property | undefined;
        const navLookupColumn = cfg.fieldState.columnName ?? cfg.name;
        const selfFkName = cfg.foreignKeyName ?? `${navLookupColumn}Id`;
        const childFkName =
          cfg.foreignKeyName ??
          (cfg.inverseNavName ? `${cfg.inverseNavName}Id` : undefined);
        if (cfg.foreignKeySide === "self") {
          fkProp = et.findProperty(selfFkName) as Property | undefined;
          storage = cfg.isMultiValue ? "self-fk-array" : "self-fk-scalar";
        } else {
          fkProp = childFkName
            ? (target.findProperty(childFkName) as Property | undefined)
            : undefined;
          storage = "inverse-fk";
        }
        if (!fkProp) {
          throw new NavigationConfigurationException(
            `Navigation '${cfg.name}' on ${et.ctor.name}: FK column '${cfg.foreignKeySide === "self" ? selfFkName : childFkName}' not found.`,
          );
        }
        const navDisplayName = cfg.fieldState.displayName ?? cfg.name;
        const navRequired = cfg.fieldState.required;
        const record: INavigation = {
          name: cfg.name,
          columnName:
            cfg.fieldState.columnName ??
            (cfg.foreignKeySide === "self"
              ? cfg.name
              : (cfg.inverseNavName ?? cfg.name)),
          ...(cfg.fieldState.description !== undefined
            ? { description: cfg.fieldState.description }
            : {}),
          kind: cfg.kind,
          storage,
          target,
          foreignKey: fkProp,
          config: {
            kind: "Lookup",
            target, // the nav's OWN target (not the FK's)
            displayField: cfg.displayField ?? "Title",
            multi: cfg.isMultiValue,
            ...(cfg.options ? { options: cfg.options } : {}),
            ...(cfg.optionsQuery ? { optionsQuery: cfg.optionsQuery } : {}),
            ...(cfg.optionsValue ? { optionsValue: cfg.optionsValue } : {}),
            ...(cfg.optionsRender ? { optionsRender: cfg.optionsRender } : {}),
            ...(cfg.optionsFilter ? { optionsFilter: cfg.optionsFilter } : {}),
            ...(cfg.optionsQueryAsync
              ? { optionsQueryAsync: cfg.optionsQueryAsync }
              : {}),
            ...(cfg.optionsCreateAsync
              ? { optionsCreateAsync: cfg.optionsCreateAsync }
              : {}),
          },
          displayName: navDisplayName,
          required: navRequired,
          visible: cfg.fieldState.visible,
          enabled: cfg.fieldState.enabled,
          readOnly: cfg.fieldState.readOnly || (cfg.readOnly ?? false),
          customValidations: cfg.fieldState.customValidations,
          // `render` is a refinement key, so both `.hasRender()` and a decorator's
          // `{ render }` option write the shared field-state draft — read it there.
          ...(cfg.fieldState.render ? { render: cfg.fieldState.render } : {}),
        };
        et.addNavigation(record);
        pendings.push({
          record,
          ...(cfg.inverseNavName !== undefined
            ? { inverseNavName: cfg.inverseNavName }
            : {}),
        });
      }
    }

    for (const p of pendings) {
      if (!p.inverseNavName) continue;
      const otherNav = p.record.target.findNavigation(p.inverseNavName);
      if (otherNav) {
        p.record.inverse = otherNav;
        otherNav.inverse = p.record;
      }
    }

    return model;
  }
}
