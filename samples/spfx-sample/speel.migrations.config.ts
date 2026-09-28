import { defineMigrationsConfig } from "@speel/migrations-cli";
import { ProjectDashboardContext } from "./src/speel/ProjectDashboardContext";

export default defineMigrationsConfig({
  context: ProjectDashboardContext,
  migrationsDir: "./src/migrations",
  snapshot: "./src/migrations/model-snapshot.json",
});
