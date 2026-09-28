import type { IEntity } from "../../types.js";
import { recordField, type DecoratedValue } from "../decorators.js";
import {
  applyNavOptions,
  type NavOptions,
  type OneToManyOptions,
  type TargetThunk,
} from "./NavOptions.js";

export function ManyToOne<T extends IEntity>(
  target: TargetThunk<T>,
  opts: NavOptions<T> = {},
) {
  return (
    _t: unknown,
    ctx: ClassFieldDecoratorContext<unknown, DecoratedValue<T>>,
  ): void =>
    recordField(ctx, (eb) => {
      const rb = eb
        .hasOne(target, ctx.name as string)
        .withMany(opts.inverse as ((n: T) => unknown) | undefined);
      applyNavOptions(rb, opts as Record<string, unknown>);
    });
}

export function OneToOne<T extends IEntity>(
  target: TargetThunk<T>,
  opts: NavOptions<T> = {},
) {
  return (
    _t: unknown,
    ctx: ClassFieldDecoratorContext<unknown, DecoratedValue<T>>,
  ): void =>
    recordField(ctx, (eb) => {
      const rb = eb
        .hasOne(target, ctx.name as string)
        .withOne(opts.inverse as ((n: T) => unknown) | undefined);
      applyNavOptions(rb, opts as Record<string, unknown>);
    });
}

export function OneToMany<T extends IEntity>(
  target: TargetThunk<T>,
  opts: OneToManyOptions<T>,
) {
  return (
    _t: unknown,
    ctx: ClassFieldDecoratorContext<unknown, DecoratedValue<T[]>>,
  ): void =>
    recordField(ctx, (eb) => {
      const rb = eb
        .hasMany(target, ctx.name as string)
        .withOne(opts.inverse as (n: T) => unknown);
      applyNavOptions(rb, opts as unknown as Record<string, unknown>);
    });
}

export function ManyToMany<T extends IEntity>(
  target: TargetThunk<T>,
  opts: NavOptions<T> = {},
) {
  return (
    _t: unknown,
    ctx: ClassFieldDecoratorContext<unknown, DecoratedValue<T[]>>,
  ): void =>
    recordField(ctx, (eb) => {
      const rb = eb
        .hasMany(target, ctx.name as string)
        .withMany(opts.inverse as ((n: T) => unknown) | undefined);
      applyNavOptions(rb, opts as Record<string, unknown>);
    });
}
