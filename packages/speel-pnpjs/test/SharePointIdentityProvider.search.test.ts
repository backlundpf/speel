import { describe, it, expect, vi } from "vitest";
import {
  SharePointIdentityProvider,
  type GraphGetRequest,
} from "../src/identity/SharePointIdentityProvider.js";
import { useSharePointIdentity } from "../src/identity/useSharePointIdentity.js";

interface DirectoryUser {
  displayName: string;
  givenName?: string;
  surname?: string;
  mail?: string;
  userPrincipalName: string;
}

const john: DirectoryUser = {
  displayName: "John Smith",
  givenName: "John",
  surname: "Smith",
  mail: "john.smith@contoso.com",
  userPrincipalName: "smithj@contoso.com",
};
const jane: DirectoryUser = {
  displayName: "Jane Doe",
  givenName: "Jane",
  surname: "Doe",
  mail: "jane.doe@contoso.com",
  userPrincipalName: "doej@contoso.com",
};
const mary: DirectoryUser = {
  displayName: "Mary Johnson",
  givenName: "Mary",
  surname: "Johnson",
  userPrincipalName: "johnsonm@contoso.com",
};

/**
 * Graph's `$search` over users, as its docs describe it: displayName is tokenized and matched
 * word-prefix in any order; every other property is a startsWith; clauses are `"prop:text"`
 * joined by OR inside parentheses, and groups by AND. Only the grammar the provider emits.
 */
function evaluateSearch(search: string, user: DirectoryUser): boolean {
  const groups = search.split(" AND ");
  return groups.every((group) => {
    const clauses = [...group.matchAll(/"((?:[^"\\]|\\.)*)"/g)].map((m) =>
      m[1]!.replace(/\\(.)/g, "$1"),
    );
    return clauses.some((clause) => {
      const at = clause.indexOf(":");
      const prop = clause.slice(0, at) as keyof DirectoryUser;
      const text = clause.slice(at + 1).toLowerCase();
      const value = (user[prop] ?? "").toLowerCase();
      if (prop === "displayName") {
        return value.split(/[^\p{L}\p{N}]+/u).some((w) => w.startsWith(text));
      }
      return value.startsWith(text);
    });
  });
}

function makeGraph(directory: DirectoryUser[]) {
  const requests: GraphGetRequest[] = [];
  const graph = vi.fn(async (request: GraphGetRequest) => {
    requests.push(request);
    const search = request.query.$search ?? "";
    const top = Number(request.query.$top ?? "999");
    return {
      value: directory.filter((u) => evaluateSearch(search, u)).slice(0, top),
    };
  });
  return { graph, requests };
}

interface PickerEntity {
  DisplayText: string;
  Key: string;
  EntityType: string;
  EntityData?: { Email?: string; SPUserID?: string };
}

function makeSp(picker: PickerEntity[] = []) {
  const clientPeoplePickerSearchUser = vi.fn(
    async (_params: {
      QueryString: string;
      MaximumEntitySuggestions: number;
    }) => picker,
  );
  return {
    sp: { profiles: { clientPeoplePickerSearchUser } },
    clientPeoplePickerSearchUser,
  };
}

const logins = (recs: Record<string, unknown>[]): unknown[] =>
  recs.map((r) => r.LoginName);

const directory = [john, jane, mary];
const JOHN_LOGIN = "i:0#.f|membership|smithj@contoso.com";

describe("SharePointIdentityProvider people search with a Graph source", () => {
  it("behaves exactly as before when no Graph source is configured", async () => {
    const { sp, clientPeoplePickerSearchUser } = makeSp([
      {
        DisplayText: "Ada",
        Key: "i:0#.f|membership|ada@contoso.com",
        EntityType: "User",
      },
    ]);
    const provider = new SharePointIdentityProvider(sp as never);
    const results = await provider.searchPrincipalsAsync("ada", 5);
    expect(logins(results)).toEqual(["i:0#.f|membership|ada@contoso.com"]);
    expect(clientPeoplePickerSearchUser).toHaveBeenCalledWith({
      QueryString: "ada",
      MaximumEntitySuggestions: 5,
    });
  });

  it.each([
    "John Smith",
    "Smith, John",
    "Smith John",
    "smith,john",
    "Smi Jo",
    "  john   SMITH ",
    "Smi",
  ])("finds the user by name in any order and partial: %j", async (query) => {
    const { sp } = makeSp();
    const { graph } = makeGraph(directory);
    const provider = new SharePointIdentityProvider(sp as never, { graph });
    const results = await provider.searchPrincipalsAsync(query, 10);
    expect(logins(results)).toContain(JOHN_LOGIN);
    expect(logins(results)).not.toContain("i:0#.f|membership|doej@contoso.com");
  });

  it("requires every token to match: 'John Doe' finds nobody", async () => {
    const { sp } = makeSp();
    const { graph } = makeGraph(directory);
    const provider = new SharePointIdentityProvider(sp as never, { graph });
    expect(await provider.searchPrincipalsAsync("John Doe", 10)).toEqual([]);
  });

  it("matches a login (UPN) that starts with a single token", async () => {
    const { sp } = makeSp();
    const { graph } = makeGraph(directory);
    const provider = new SharePointIdentityProvider(sp as never, { graph });
    for (const query of ["smithj", "smithj@contoso.com", "SmithJ@con"]) {
      expect(logins(await provider.searchPrincipalsAsync(query, 10))).toEqual([
        JOHN_LOGIN,
      ]);
    }
  });

  it("matches an email that starts with a single token", async () => {
    const { sp } = makeSp();
    const { graph } = makeGraph(directory);
    const provider = new SharePointIdentityProvider(sp as never, { graph });
    expect(
      logins(await provider.searchPrincipalsAsync("john.smith@", 10)),
    ).toEqual([JOHN_LOGIN]);
  });

  it("asks Graph for an eventual-consistency $search, trimmed and capped", async () => {
    const { sp } = makeSp();
    const { graph, requests } = makeGraph(directory);
    const provider = new SharePointIdentityProvider(sp as never, { graph });
    await provider.searchPrincipalsAsync('Smith, "Jo', 7);
    expect(requests).toHaveLength(1);
    const [request] = requests;
    expect(request!.path).toBe("/users");
    expect(request!.headers).toEqual({ ConsistencyLevel: "eventual" });
    expect(request!.query.$top).toBe("7");
    expect(request!.query.$select).toContain("userPrincipalName");
    expect(request!.query.$search).toBe(
      '("displayName:Smith" OR "givenName:Smith" OR "surname:Smith")' +
        ' AND ("displayName:\\"Jo" OR "givenName:\\"Jo" OR "surname:\\"Jo")',
    );
  });

  it("maps a directory user onto a principal record the way a picker hit is mapped", async () => {
    const { sp } = makeSp();
    const { graph } = makeGraph([john, mary]);
    const provider = new SharePointIdentityProvider(sp as never, { graph });
    const [first, second] = await provider.searchPrincipalsAsync("john", 10);
    expect(first).toEqual({
      Title: "John Smith",
      LoginName: JOHN_LOGIN,
      Email: "john.smith@contoso.com",
      PrincipalType: 1,
    });
    // No mail → no Email; never an Id (ensure() provisions one when picked).
    expect(second).toEqual({
      Title: "Mary Johnson",
      LoginName: "i:0#.f|membership|johnsonm@contoso.com",
      PrincipalType: 1,
    });
  });

  it("keeps the people picker's ranking first and de-duplicates by login", async () => {
    const { sp } = makeSp([
      {
        DisplayText: "Mary Johnson",
        Key: "i:0#.f|membership|JohnsonM@contoso.com",
        EntityType: "User",
        EntityData: { SPUserID: "12", Email: "mary@contoso.com" },
      },
      {
        DisplayText: "Johnson Fans",
        Key: "c:0o.c|federateddirectoryclaimprovider|abc",
        EntityType: "SecGroup",
      },
    ]);
    const { graph } = makeGraph(directory);
    const provider = new SharePointIdentityProvider(sp as never, { graph });
    const results = await provider.searchPrincipalsAsync("john", 10);
    expect(logins(results)).toEqual([
      "i:0#.f|membership|JohnsonM@contoso.com",
      "c:0o.c|federateddirectoryclaimprovider|abc",
      JOHN_LOGIN,
    ]);
    // The picker's copy is the one kept — it carries the site user id.
    expect(results[0]).toMatchObject({ Id: 12 });
  });

  it("applies maxResults after the merge", async () => {
    const { sp } = makeSp([
      {
        DisplayText: "Jo One",
        Key: "i:0#.f|membership|one@contoso.com",
        EntityType: "User",
      },
    ]);
    const { graph } = makeGraph(directory);
    const provider = new SharePointIdentityProvider(sp as never, { graph });
    const results = await provider.searchPrincipalsAsync("jo", 2);
    expect(logins(results)).toEqual([
      "i:0#.f|membership|one@contoso.com",
      JOHN_LOGIN,
    ]);
  });

  it("falls back to the people picker when Graph fails", async () => {
    const { sp } = makeSp([
      {
        DisplayText: "Ada",
        Key: "i:0#.f|membership|ada@contoso.com",
        EntityType: "User",
      },
    ]);
    const graph = vi.fn(async () => {
      throw new Error("Insufficient privileges");
    });
    const provider = new SharePointIdentityProvider(sp as never, { graph });
    expect(logins(await provider.searchPrincipalsAsync("ada", 5))).toEqual([
      "i:0#.f|membership|ada@contoso.com",
    ]);
  });

  it("still rejects when the people picker fails", async () => {
    const { sp, clientPeoplePickerSearchUser } = makeSp();
    clientPeoplePickerSearchUser.mockRejectedValueOnce(new Error("down"));
    const { graph } = makeGraph(directory);
    const provider = new SharePointIdentityProvider(sp as never, { graph });
    await expect(provider.searchPrincipalsAsync("john", 5)).rejects.toThrow(
      "down",
    );
  });

  it("useSharePointIdentity passes the Graph source through", async () => {
    const { sp } = makeSp();
    const { graph } = makeGraph(directory);
    const provider = useSharePointIdentity({ spInstance: sp as never, graph });
    expect(
      logins(await provider.searchPrincipalsAsync("Smith, John", 5)),
    ).toEqual([JOHN_LOGIN]);
  });

  it("does not ask Graph about a blank query", async () => {
    const { sp } = makeSp();
    const { graph } = makeGraph(directory);
    const provider = new SharePointIdentityProvider(sp as never, { graph });
    await provider.searchPrincipalsAsync(" , ", 5);
    expect(graph).not.toHaveBeenCalled();
  });
});
