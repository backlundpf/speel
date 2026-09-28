import type { WebPartContext } from "@microsoft/sp-webpart-base";
import type { SpeelIdentity } from "@speel/identity";
import type { ProjectDashboardContext } from "../../../speel/ProjectDashboardContext";
import { Project } from "../../../entities/Project";
import { Programs } from "../../../entities/Programs";
import { Tags } from "../../../entities/Tags";
import { Customer } from "../../../entities/Customer";

// Valid tenant user names for the people fields (Owner / Reviewers).
const USERS = [
  "backlundpf",
  "fleshmanlw",
  "fletchergd",
  "parchmentrg",
  "dotysc",
] as const;

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
  owner: string;
  reviewers: string[];
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
    owner: "backlundpf",
    reviewers: ["fleshmanlw", "fletchergd"],
    program: "Platform",
    tags: ["frontend", "backend"],
    daysOut: 45,
  },
  {
    Title: "Mobile Checkout",
    Status: "Planning",
    Priority: "Critical",
    Budget: 120000,
    owner: "fleshmanlw",
    reviewers: ["backlundpf"],
    program: "Mobile",
    tags: ["frontend"],
    daysOut: 90,
  },
  {
    Title: "Data Warehouse Migration",
    Status: "Active",
    Priority: "Medium",
    Budget: 40000,
    owner: "fletchergd",
    reviewers: ["dotysc", "parchmentrg"],
    program: "Data",
    tags: ["infrastructure", "backend"],
    daysOut: 120,
  },
  {
    Title: "Design System Refresh",
    Status: "On Hold",
    Priority: "Low",
    Budget: 15000,
    owner: "parchmentrg",
    reviewers: ["fleshmanlw"],
    program: "Platform",
    tags: ["design", "frontend"],
    daysOut: 60,
  },
  {
    Title: "API Gateway",
    Status: "Complete",
    Priority: "High",
    Budget: 55000,
    owner: "dotysc",
    reviewers: ["backlundpf", "fletchergd"],
    program: "Platform",
    tags: ["backend", "infrastructure"],
    daysOut: -10,
  },
  {
    Title: "Offline Sync",
    Status: "Planning",
    Priority: "Medium",
    Budget: 30000,
    owner: "backlundpf",
    reviewers: ["dotysc"],
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
 * run migrations first. Exposed on `window.pd.seed()`.
 */
export function buildSeed(
  ctx: ProjectDashboardContext,
  identity: SpeelIdentity,
  spfxContext: WebPartContext,
): () => Promise<void> {
  return async function seed(): Promise<void> {
    console.group("[speel] seed (demo Programs / Tags / Customers / Projects)");
    try {
      // 1. Resolve the people fields' users to site-user ids.
      const user = spfxContext.pageContext.user;
      const domain = (user.email || user.loginName || "").split("@")[1];
      if (!domain)
        throw new Error(
          "Could not determine the tenant domain from pageContext.user.",
        );
      const userId: Record<string, number> = {};
      for (const login of USERS) {
        try {
          const u = await identity.users.ensure(`${login}@${domain}`);
          if (u.Id != null) userId[login] = u.Id;
        } catch (e) {
          console.warn(
            `  could not resolve ${login}@${domain}:`,
            e instanceof Error ? e.message : e,
          );
        }
      }
      console.log(
        "  resolved users:",
        Object.keys(userId).join(", ") || "(none)",
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
        const reviewers = s.reviewers
          .map((r) => userId[r])
          .filter((id): id is number => id != null);
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
