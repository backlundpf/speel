import type { MigrationBuilder } from "./operations/MigrationBuilder.js";

export interface Migration {
  id: string;
  up: (b: MigrationBuilder) => void;
  down: (b: MigrationBuilder) => void;
}

export function defineMigration(
  id: string,
  body: Omit<Migration, "id">,
): Migration {
  return { id, up: body.up, down: body.down };
}
