import {
  defineMigration,
  Migrator,
  FakeSchemaProvider,
  FakeHistoryStore,
} from "../src/index.js";
import type { Migration, MigrateResult } from "../src/index.js";
import type { DbContext } from "@speel/core";

// defineMigration returns a Migration with the given id
const m: Migration = defineMigration("20260101T0900_X", {
  up: (b) => {
    b.createList("A", { template: "documentLibrary" });
    b.addField("A", "Title", (f) => f.text({ maxLength: 255, required: true }));
    b.addField("A", "OwnerId", (f) =>
      f.lookup({ list: "People", showField: "Title" }),
    );
    b.run(async ({ context, state }) => {
      void context;
      state.done = true;
    });
  },
  down: (b) => b.dropList("A"),
});

// Migrator wiring type-checks with injected fakes
const migrator = new Migrator({
  context: {} as DbContext,
  schema: new FakeSchemaProvider(),
  migrations: [m],
  history: new FakeHistoryStore(),
});
const _res: Promise<MigrateResult> = migrator.migrate();
void _res;

// @ts-expect-error — createList requires a title
defineMigration("bad", { up: (b) => b.createList(), down: () => {} });
