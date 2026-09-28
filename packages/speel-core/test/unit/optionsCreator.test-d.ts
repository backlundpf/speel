import { expectTypeOf } from "vitest";
import type { OptionsCreator } from "../../src/Metadata/optionsLoader.js";
import type { DbContext } from "../../src/DbContext.js";
import type { DbSet } from "../../src/DbSet.js";

// A UI binding fills the host bag by augmenting the module where it lives.
declare module "../../src/Metadata/optionsLoader.js" {
  interface OptionsCreatorHost {
    extra: number;
  }
}

class Target {
  Id?: number;
  Title?: string;
}
type Source = { Department: string };

// The augmentation makes `extra` a typed member of every creator's args.
const creator: OptionsCreator<Source, Target> = async (args) => {
  expectTypeOf(args.extra).toEqualTypeOf<number>();
  expectTypeOf(args.text).toEqualTypeOf<string>();
  expectTypeOf(args.displayField).toEqualTypeOf<string>();
  expectTypeOf(args.source).toEqualTypeOf<Source>();
  expectTypeOf(args.set).toEqualTypeOf<DbSet<Target>>();
  expectTypeOf(args.db).toEqualTypeOf<DbContext>();
  return undefined;
};
void creator;
