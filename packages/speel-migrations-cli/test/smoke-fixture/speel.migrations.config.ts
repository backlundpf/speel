// Imports the CLI by package name (not ../../src) so the smoke test exercises the
// same resolution a consumer's config does: built dist, loaded by plain Node.
import { defineMigrationsConfig } from "@speel/migrations-cli";
import { AppContext } from "../fixture/AppContext.js";

export default defineMigrationsConfig({
  context: AppContext,
  migrationsDir: "./migrations",
  snapshot: "./migrations/model-snapshot.json",
});
