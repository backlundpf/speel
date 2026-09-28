import { Principal } from "@speel/core";
import { FakeStorageProvider } from "@speel/core/testing";
import type { PeopleSearch } from "@speel/react";

import { DemoContext } from "./DemoContext";
import { Program, Project } from "./entities";

const PEOPLE = [
  { Id: 1, Title: "Ada Lovelace", Email: "ada@example.com" },
  { Id: 2, Title: "Grace Hopper", Email: "grace@example.com" },
  { Id: 3, Title: "Alan Turing", Email: "alan@example.com" },
] as const;

function inDays(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + n);
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Build a DemoContext over a seeded in-memory provider. */
export async function createDemoDb(): Promise<DemoContext> {
  const provider = new FakeStorageProvider();
  for (const u of PEOPLE) {
    provider.seedUserInfo({
      Id: u.Id,
      Title: u.Title,
      EMail: u.Email,
      PrincipalType: 1,
    });
  }

  const db = new DemoContext({ provider });

  const apollo = Object.assign(new Program(), { Title: "Apollo" });
  const daedalus = Object.assign(new Program(), { Title: "Daedalus" });
  db.programs.add(apollo);
  db.programs.add(daedalus);

  db.projects.add(
    Object.assign(new Project(), {
      Title: "Heat shield",
      Status: "Active",
      Budget: 120000,
      DueDate: inDays(14),
      IsPublic: true,
      OwnerId: 1,
      ReviewersId: [2, 3],
      Program: apollo,
    }),
  );
  db.projects.add(
    Object.assign(new Project(), {
      Title: "Guidance computer",
      Status: "Planning",
      Budget: 80000,
      DueDate: inDays(45),
      IsPublic: false,
      OwnerId: 2,
      Program: apollo,
    }),
  );
  db.projects.add(
    Object.assign(new Project(), {
      Title: "Wing assembly",
      Status: "On Hold",
      Budget: 30000,
      DueDate: inDays(-7),
      IsPublic: true,
      OwnerId: 3,
      Program: daedalus,
    }),
  );

  await db.saveChangesAsync();
  return db;
}

export const searchPeople: PeopleSearch = (query) =>
  Promise.resolve(
    PEOPLE.filter((p) =>
      p.Title.toLowerCase().includes(query.toLowerCase()),
    ).map((p) =>
      Object.assign(new Principal(), {
        Id: p.Id,
        Title: p.Title,
        Email: p.Email,
        PrincipalType: 1,
      }),
    ),
  );
