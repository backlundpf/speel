import { Principal, SiteGroup, SiteUser } from "@speel/core";
import type { GroupRef, UserRef } from "../src/index.js";

// The refs ARE types: every runtime path coerces whatever it is handed, so only the compiler
// can say which forms an app may pass. `.test.ts` is not type-checked in this package.

const byEntity: UserRef = new SiteUser();
const byPrincipal: UserRef = new Principal();
const byId: UserRef = 42;
const byLogin: UserRef = "i:0#.f|membership|ada@x.com";
void byEntity;
void byPrincipal;
void byId;
void byLogin;

const groupByEntity: GroupRef = new SiteGroup();
const groupById: GroupRef = 3;
const groupByTitle: GroupRef = "Auditors";
void groupByEntity;
void groupById;
void groupByTitle;

// @ts-expect-error — a reference is an entity, an id, or a name; nothing else.
const bogus: UserRef = true;
void bogus;

// The principal classes are NOT mutually exclusive to the compiler. Every member of each is
// optional and they share Id/Title/LoginName, so each satisfies the others structurally: a
// SiteGroup passes as a UserRef and a Principal passes as a GroupRef. Both lines below
// compile, and that is a statement of the current limitation rather than an endorsement —
// separating them needs a nominal marker on core's types, which is the internals cycle's job.
// What the refs do buy is rejecting values that are neither entity, id, nor name.
const structurallyAUser: UserRef = new SiteGroup();
const structurallyAGroup: GroupRef = new Principal();
void structurallyAUser;
void structurallyAGroup;
