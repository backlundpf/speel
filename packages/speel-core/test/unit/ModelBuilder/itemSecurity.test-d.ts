import { Entity, Key, SpeelEntity, TextField } from "../../../src/index.js";
import type { IListProvisioning } from "../../../src/index.js";

// The feature IS a type: at runtime `@Entity` already spreads unknown keys into provisioning,
// so only the compiler can tell whether these options exist. `.test.ts` files are not
// type-checked in this package, which is why this guard is a `.test-d.ts`.

const own: IListProvisioning = { readSecurity: "own", writeSecurity: "own" };
const all: IListProvisioning = { readSecurity: "all", writeSecurity: "all" };
void own;
void all;

// @ts-expect-error — the security levels are a closed set, not arbitrary strings.
const bogus: IListProvisioning = { readSecurity: "everyone" };
void bogus;

@Entity({ list: "Own Items", readSecurity: "own", writeSecurity: "own" })
export class OwnedThing extends SpeelEntity {
  @Key public override Id?: number = undefined;
  @TextField() public Title: string | null = null;
}
