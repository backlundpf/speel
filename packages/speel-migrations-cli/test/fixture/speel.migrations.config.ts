import { defineMigrationsConfig } from "../../src/config.js";
import { AppContext } from "./AppContext.js";

export default defineMigrationsConfig({
  context: AppContext,
  migrationsDir: "./migrations",
  snapshot: "./migrations/model-snapshot.json",
});
