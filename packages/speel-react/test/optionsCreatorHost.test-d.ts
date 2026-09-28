/**
 * Type-level assertion: importing `@speel/react` augments core's `OptionsCreatorHost`
 * with `surfaces: SurfaceApi`, so a custom creator written against `@speel/react` can
 * call `args.surfaces.showForm` with no cast. A `.test-d.ts` because `tsconfig.test.json`
 * compiles these, so a dropped or narrowed augmentation is caught by tsc.
 */
import { expectTypeOf } from "vitest";
import type { OptionsCreator } from "@speel/core";
import type { SurfaceApi } from "../src/index.js";
// Pulls the whole package's exports (and its OptionsCreatorHost augmentation) into this
// program, exactly as a consumer importing `@speel/react` would.
import "../src/index.js";

class Target {
  Id?: number;
  Title?: string;
}
type Source = { Department: string };

// A custom creator, written purely against @speel/react's public surface, gets a fully
// typed `surfaces` with no cast.
const creator: OptionsCreator<Source, Target> = async (args) => {
  expectTypeOf(args.surfaces).toEqualTypeOf<SurfaceApi>();

  const result = await args.surfaces.showForm({
    entity: new Target(),
    mode: "create",
  });
  expectTypeOf(result.entity).toEqualTypeOf<Target>();
  return result.action === "submit" ? result.entity : undefined;
};
void creator;
