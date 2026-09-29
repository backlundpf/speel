import {
  createsByDisplayField,
  Entity,
  Key,
  ManyToOne,
  SpeelEntity,
  TextField,
} from "../../src/index.js";
import type {
  OptionsCreator,
  OptionsLoader,
} from "../../src/Metadata/optionsLoader.js";

class JobTitle extends SpeelEntity {
  @Key public override Id?: number = undefined;
  @TextField() public Title: string | null = null;
}
class Office extends SpeelEntity {
  @Key public override Id?: number = undefined;
}

// Callbacks declared ahead of the decorator, typed for the navigation's target — the
// shape a consumer writes to share one creator or loader across fields.
const creator: OptionsCreator<Person, JobTitle> = async ({ set }) =>
  (await set.findAsync(1)) ?? undefined;
const anySourceCreator: OptionsCreator<unknown, JobTitle> = async () =>
  undefined;
const loader: OptionsLoader<Person, JobTitle> = async ({ set }) =>
  set.toArrayAsync();
const officeCreator: OptionsCreator<unknown, Office> = async () => undefined;
const officeLoader: OptionsLoader<unknown, Office> = async () => [];

@Entity({ list: "People" })
class Person extends SpeelEntity {
  @Key public override Id?: number = undefined;

  @ManyToOne(() => JobTitle, { optionsCreateAsync: creator })
  A: JobTitle | null = null;

  @ManyToOne(() => JobTitle, { optionsCreateAsync: anySourceCreator })
  B: JobTitle | null = null;

  @ManyToOne(() => JobTitle, { optionsQueryAsync: loader })
  C: JobTitle | null = null;

  @ManyToOne(() => JobTitle, { optionsCreateAsync: createsByDisplayField() })
  D: JobTitle | null = null;

  // The navigation's target decides: a callback for another entity is refused.
  @ManyToOne(() => JobTitle, {
    // @ts-expect-error — creates an Office, not a JobTitle.
    optionsCreateAsync: officeCreator,
  })
  E: JobTitle | null = null;

  @ManyToOne(() => JobTitle, {
    // @ts-expect-error — loads Offices, not JobTitles.
    optionsQueryAsync: officeLoader,
  })
  F: JobTitle | null = null;
}

export { Person };
