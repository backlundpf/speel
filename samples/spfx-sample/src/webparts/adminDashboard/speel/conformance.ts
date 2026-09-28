import type { EntityType, IListHandle, Property } from "@speel/core";
import {
  providerConformanceCases,
  type IProviderConformanceHarness,
} from "@speel/core/testing";
import { getSPFI, SharePointProvider } from "@speel/pnpjs";
import type { ProjectDashboardContext } from "../../../speel/ProjectDashboardContext";
import { Project } from "../../../entities/Project";
import { ProjectArtifact } from "../../../entities/ProjectArtifact";

export interface IConformanceResult {
  name: string;
  ok: boolean;
  error?: string;
  ms: number;
}

export interface IConformance {
  /** Run the whole provider conformance suite against a FRESH SharePointProvider. */
  run(): Promise<IConformanceResult[]>;
  /** The case names, in run order. */
  names(): string[];
}

interface IRawPrincipal {
  Id: number;
  Title: string;
  LoginName: string;
  Email?: string;
}

/**
 * The @speel/core provider conformance suite, wired to this tenant. Everything the
 * suite must see WITHOUT the provider — the principals it writes, the rows it reads
 * back, the resolve traffic it counts — goes through raw REST here.
 */
export function buildConformance(
  ctx: ProjectDashboardContext,
  webAbsUrl: string,
): IConformance {
  const json = async <T>(url: string): Promise<T> => {
    const r = await fetch(url, {
      headers: { Accept: "application/json;odata=nometadata" },
      credentials: "include",
    });
    if (!r.ok) throw new Error(`${r.status} ${url}`);
    return r.json() as Promise<T>;
  };
  const listApi = (l: IListHandle): string =>
    l.kind === "title"
      ? `${webAbsUrl}/_api/web/lists/getByTitle('${encodeURIComponent(l.value)}')`
      : `${webAbsUrl}/_api/web/lists(guid'${l.value}')`;

  // The suite writes with the model's OWN properties — the exact metadata core
  // sends the provider — so the harness takes them from ctx.model by name.
  const propertyOf = (et: EntityType, name: string): Property => {
    const p = et.findProperty(name);
    if (!p)
      throw new Error(`conformance: ${et.ctor.name} has no property ${name}`);
    return p;
  };
  const harness = (): IProviderConformanceHarness => {
    const project = ctx.model.findEntityType(Project)!;
    const artifact = ctx.model.findEntityType(ProjectArtifact)!;
    const prop = (name: string): Property => propertyOf(project, name);
    return {
      provider: new SharePointProvider(getSPFI(ctx)),
      list: { kind: "title", value: "Projects" },
      baseFields: [
        { property: prop("Title"), value: `speel conformance ${Date.now()}` },
        { property: prop("Status"), value: "Planning" },
        { property: prop("Priority"), value: "Low" },
        {
          property: prop("DueDate"),
          value: new Date(Date.now() + 30 * 86_400_000),
        },
      ],
      properties: {
        text: prop("RepoUrl"),
        boolean: prop("IsPublic"),
        dateTime: prop("StartDate"),
        multiChoice: prop("Labels"),
        multiLookup: prop("TagsId"),
        person: prop("OwnerId"),
        multiPerson: prop("ReviewersId"),
      },
      libraryTitle: propertyOf(artifact, "Title"),
      multiChoiceValues: ["Compliance", "Security"],
      lookupTarget: { kind: "title", value: "Tags" },
      folderPath: "SpeelE2E/Conformance",
      library: { kind: "title", value: "ProjectArtifacts" },
      async principals() {
        const users = (
          await json<{ value: IRawPrincipal[] }>(
            `${webAbsUrl}/_api/web/siteusers?$filter=PrincipalType eq 1&$select=Id,Title,LoginName,Email&$top=100`,
          )
        ).value;
        const people = users.filter(
          (u) =>
            !!u.Email &&
            u.LoginName.startsWith("i:0#.f|membership|") &&
            !/app@sharepoint|system/i.test(u.LoginName),
        );
        const [user, secondUser] = people;
        if (!user)
          throw new Error(
            "conformance: no site user with an email to write into a person column",
          );
        if (!secondUser)
          throw new Error(
            "conformance: the root-path resolution case needs a second site user with an email",
          );
        const groups = (
          await json<{ value: IRawPrincipal[] }>(
            `${webAbsUrl}/_api/web/sitegroups?$select=Id,Title,LoginName&$top=1`,
          )
        ).value;
        const group = groups[0];
        if (!group)
          throw new Error("conformance: the site has no SharePoint group");
        return {
          user: { ...user, Email: user.Email! },
          secondUser: { ...secondUser, Email: secondUser.Email! },
          group,
        };
      },
      async readBack(l, id, columns) {
        return json<Record<string, unknown>>(
          `${listApi(l)}/items(${id})?$select=${columns.join(",")}`,
        );
      },
      async countPrincipalResolves(ids, fn) {
        // Both routes into the UIL put the id in the URL — siteUserInfoList/items(id) —
        // and PnPjs batches, so the body is searched too. Only the ids under test count.
        const watched = new Set(ids);
        let count = 0;
        const orig = window.fetch;
        window.fetch = ((...args: Parameters<typeof fetch>) => {
          try {
            const input = args[0];
            const url =
              typeof input === "string"
                ? input
                : input instanceof URL
                  ? input.href
                  : (input?.url ?? "");
            const body = typeof args[1]?.body === "string" ? args[1].body : "";
            const re = /siteuserinfolist\/items\((\d+)\)/gi;
            let m: RegExpExecArray | null;
            while ((m = re.exec(url + body)) !== null)
              if (watched.has(Number(m[1]))) count += 1;
          } catch {
            /* instrumentation must never break the run */
          }
          return orig.apply(window, args);
        }) as typeof fetch;
        try {
          await fn();
        } finally {
          window.fetch = orig;
        }
        return count;
      },
    };
  };

  return {
    names: () => providerConformanceCases({} as never).map((c) => c.name),
    async run() {
      const out: IConformanceResult[] = [];
      for (const c of providerConformanceCases(harness())) {
        const t0 = performance.now();
        try {
          await c.run();
          out.push({
            name: c.name,
            ok: true,
            ms: Math.round(performance.now() - t0),
          });
        } catch (e) {
          out.push({
            name: c.name,
            ok: false,
            error: e instanceof Error ? `${e.name}: ${e.message}` : String(e),
            ms: Math.round(performance.now() - t0),
          });
        }
      }
      return out;
    },
  };
}
