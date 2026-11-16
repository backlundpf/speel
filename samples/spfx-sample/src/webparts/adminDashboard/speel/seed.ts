import type { SpeelIdentity } from "@speel/identity";
import type { ProjectDashboardContext } from "../../../speel/ProjectDashboardContext";
import { Project } from "../../../entities/Project";
import { Programs } from "../../../entities/Programs";
import { Tags } from "../../../entities/Tags";
import { Customer } from "../../../entities/Customer";

// People-field slots (Owner / Reviewers), filled from the people in the site's
// Members group in order (repeating when it has fewer than five), or the
// signed-in user when it has none, so the demo data seeds on any site.
const USERS = ["user1", "user2", "user3", "user4", "user5"] as const;
type UserSlot = (typeof USERS)[number];

const PROGRAMS = ["Platform", "Mobile", "Data"];
const TAGS = ["frontend", "backend", "infrastructure", "design"];
const CUSTOMERS: { Title: string; ContactName: string }[] = [
  { Title: "Contoso", ContactName: "Alice Hale" },
  { Title: "Fabrikam", ContactName: "Ben Osei" },
  { Title: "Northwind", ContactName: "Cara Lindqvist" },
];
const PROGRAM_CUSTOMER: Record<string, string> = {
  Platform: "Contoso",
  Mobile: "Fabrikam",
  Data: "Northwind",
};

interface ProjectSeed {
  Title: string;
  Status: Project["Status"];
  Priority: Project["Priority"];
  Budget: number;
  owner: UserSlot;
  reviewers: UserSlot[];
  program: string;
  tags: string[];
  daysOut: number;
}

const PROJECTS: ProjectSeed[] = [
  {
    Title: "Customer Portal",
    Status: "Active",
    Priority: "High",
    Budget: 75000,
    owner: "user1",
    reviewers: ["user2", "user3"],
    program: "Platform",
    tags: ["frontend", "backend"],
    daysOut: 45,
  },
  {
    Title: "Mobile Checkout",
    Status: "Planning",
    Priority: "Critical",
    Budget: 120000,
    owner: "user2",
    reviewers: ["user1"],
    program: "Mobile",
    tags: ["frontend"],
    daysOut: 90,
  },
  {
    Title: "Data Warehouse Migration",
    Status: "Active",
    Priority: "Medium",
    Budget: 40000,
    owner: "user3",
    reviewers: ["user5", "user4"],
    program: "Data",
    tags: ["infrastructure", "backend"],
    daysOut: 120,
  },
  {
    Title: "Design System Refresh",
    Status: "On Hold",
    Priority: "Low",
    Budget: 15000,
    owner: "user4",
    reviewers: ["user2"],
    program: "Platform",
    tags: ["design", "frontend"],
    daysOut: 60,
  },
  {
    Title: "API Gateway",
    Status: "Complete",
    Priority: "High",
    Budget: 55000,
    owner: "user5",
    reviewers: ["user1", "user3"],
    program: "Platform",
    tags: ["backend", "infrastructure"],
    daysOut: -10,
  },
  {
    Title: "Offline Sync",
    Status: "Planning",
    Priority: "Medium",
    Budget: 30000,
    owner: "user1",
    reviewers: ["user5"],
    program: "Mobile",
    tags: ["frontend", "backend"],
    daysOut: 75,
  },
];

/** Idempotently create the named lookup rows (Programs/Tags) and return Title → Id. */
async function ensureLookups<T extends { Id?: number; Title?: string | null }>(
  ctx: ProjectDashboardContext,
  set: { toArrayAsync(): Promise<T[]>; add(e: T): unknown },
  ctor: new () => T,
  titles: string[],
): Promise<Record<string, number>> {
  const byTitle = new Map<string, T>();
  for (const e of await set.toArrayAsync())
    if (e.Title) byTitle.set(e.Title, e);
  let added = false;
  for (const title of titles) {
    if (!byTitle.has(title)) {
      const e = new ctor();
      e.Title = title;
      set.add(e);
      byTitle.set(title, e);
      added = true;
    }
  }
  if (added) await ctx.saveChangesAsync(); // assigns server Ids to the new rows
  const map: Record<string, number> = {};
  for (const [title, e] of byTitle) if (e.Id != null) map[title] = e.Id;
  return map;
}

/**
 * Seed the Project Dashboard's live lists with demo Programs, Tags, Customers, and Projects.
 * Idempotent by Title (re-running won't duplicate). Requires the lists to exist —
 * run migrations first. Exposed on `window.pd.seed()`. People fields are
 * filled from the site's Members group.
 */
export function buildSeed(
  ctx: ProjectDashboardContext,
  identity: SpeelIdentity,
): () => Promise<void> {
  return async function seed(): Promise<void> {
    console.group("[speel] seed (demo Programs / Tags / Customers / Projects)");
    try {
      // 1. People for the people fields: the Members group's users (not
      // nested groups), or the signed-in user when it has none.
      const { members } = await identity.groups.associated();
      const people = (members ? await identity.groups.members(members) : [])
        .filter((u) => u.PrincipalType === 1 && u.Id != null)
        .map((u) => ({ id: u.Id!, name: u.Title ?? u.LoginName }));
      if (people.length === 0) {
        const me = await identity.users.me();
        if (me.Id != null) people.push({ id: me.Id, name: me.Title ?? "me" });
      }
      const userId: Partial<Record<UserSlot, number>> = {};
      if (people.length > 0)
        for (const [i, slot] of USERS.entries())
          userId[slot] = people[i % people.length]!.id;
      console.log(
        `  people (${members?.Title ?? "no Members group"}):`,
        people.map((p) => p.name).join(", ") || "(none)",
      );

      // 2. Programs + Tags (idempotent by Title).
      const programId = await ensureLookups(
        ctx,
        ctx.programs,
        Programs,
        PROGRAMS,
      );
      const tagId = await ensureLookups(ctx, ctx.tags, Tags, TAGS);

      // 2b. Customers (idempotent by Title; ContactName set on create only).
      const customerByTitle = new Map<string, Customer>();
      for (const c of await ctx.customers.toArrayAsync())
        if (c.Title) customerByTitle.set(c.Title, c);
      let customersAdded = false;
      for (const seed of CUSTOMERS) {
        if (customerByTitle.has(seed.Title)) continue;
        const c = new Customer();
        c.Title = seed.Title;
        c.ContactName = seed.ContactName;
        ctx.customers.add(c);
        customerByTitle.set(seed.Title, c);
        customersAdded = true;
      }
      if (customersAdded) await ctx.saveChangesAsync();

      // 2c. Link each Program to its customer (idempotent: skip if already linked).
      // Setting the nav is enough — relationship fixup derives CustomerId at save.
      let linked = 0;
      for (const prog of await ctx.programs
        .expand((p) => p.Customer)
        .toArrayAsync()) {
        const want = prog.Title ? PROGRAM_CUSTOMER[prog.Title] : undefined;
        if (!want || prog.Customer != null) continue;
        prog.Customer = customerByTitle.get(want);
        linked++;
      }
      if (linked) await ctx.saveChangesAsync();
      console.log(`  linked ${linked} program(s) to customers.`);

      // 3. Projects (idempotent by Title).
      const existing = new Set(
        (await ctx.projects.toArrayAsync()).map((p) => p.Title),
      );
      let created = 0;
      for (const s of PROJECTS) {
        if (existing.has(s.Title)) continue;
        const p = new Project();
        p.Title = s.Title;
        p.Status = s.Status;
        p.Priority = s.Priority;
        p.Budget = s.Budget;
        p.IsPublic = true;
        p.DueDate = new Date(Date.now() + s.daysOut * 86_400_000);
        p.StartDate = new Date(Date.now() - 14 * 86_400_000);
        if (userId[s.owner] != null) p.OwnerId = userId[s.owner]!;
        const reviewers = [
          ...new Set(s.reviewers.map((r) => userId[r])),
        ].filter((id): id is number => id != null);
        if (reviewers.length) p.ReviewersId = reviewers;
        if (programId[s.program] != null) p.ProgramId = programId[s.program]!;
        const tagIds = s.tags
          .map((t) => tagId[t])
          .filter((id): id is number => id != null);
        if (tagIds.length) p.TagsId = tagIds;
        ctx.projects.add(p);
        created++;
      }
      await ctx.saveChangesAsync();
      console.log(
        `  created ${created} project(s); ${PROJECTS.length - created} already existed.`,
      );
    } finally {
      console.groupEnd();
    }
  };
}
