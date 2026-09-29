import { describe, it, expect, vi } from "vitest";
import { SharePointIdentityProvider } from "../src/identity/SharePointIdentityProvider.js";

// A minimal structural SPFI double recording the calls the provider makes, following
// SharePointSchemaProvider.test.ts. The point is the wiring: which pnp path each method takes,
// and what it does with what comes back.
function makeFakeSp() {
  const calls: string[] = [];

  const groupUsers = (groupId: number) => ({
    // Invoking the collection reads its members.
    [Symbol.toPrimitive]: undefined,
    add: vi.fn(async (loginName: string) => {
      calls.push(`groupUsersAdd:${groupId}:${loginName}`);
    }),
    removeById: vi.fn(async (id: number) => {
      calls.push(`groupUsersRemoveById:${groupId}:${id}`);
    }),
  });

  const sp = {
    web: {
      currentUser: async () => {
        calls.push("currentUser");
        return {
          Id: 7,
          Title: "Ada",
          LoginName: "i:0#.f|membership|ada@x.com",
          Email: "ada@x.com",
          PrincipalType: 1,
        };
      },
      ensureUser: async (loginName: string) => {
        calls.push(`ensureUser:${loginName}`);
        return {
          Id: 9,
          Title: "New Person",
          LoginName: loginName,
          Email: "new@x.com",
          PrincipalType: 1,
        };
      },
      getUserById: (id: number) => ({
        groups: Object.assign(async () => {
          calls.push(`userGroups:${id}`);
          return [{ Id: 3, Title: "Auditors" }];
        }, {}),
      }),
      siteGroups: {
        getById: (id: number) => ({
          users: Object.assign(async () => {
            calls.push(`groupUsers:${id}`);
            return [{ Id: 7, Title: "Ada" }];
          }, groupUsers(id)),
        }),
      },
    },
    profiles: {
      clientPeoplePickerSearchUser: vi.fn(
        async (params: {
          QueryString: string;
          MaximumEntitySuggestions: number;
        }) => {
          calls.push(
            `peoplePicker:${params.QueryString}:${params.MaximumEntitySuggestions}`,
          );
          return [
            {
              DisplayText: "Ada Lovelace",
              Key: "i:0#.f|membership|ada@x.com",
              EntityType: "User",
              EntityData: {
                Email: "ada@x.com",
                SPUserID: "7",
                Title: "Engineer",
              },
            },
            {
              DisplayText: "Auditors",
              Key: "c:0(.s|true",
              EntityType: "SPGroup",
              EntityData: { SPGroupID: "3" },
            },
          ];
        },
      ),
    },
  };

  return { sp, calls };
}

function build() {
  const { sp, calls } = makeFakeSp();
  // The double is structural, not an SPFI; the provider only uses the paths above.
  return { provider: new SharePointIdentityProvider(sp as never), calls, sp };
}

describe("SharePointIdentityProvider", () => {
  it("reads the current user", async () => {
    const { provider, calls } = build();
    expect((await provider.getCurrentUserAsync()).Id).toBe(7);
    expect(calls).toEqual(["currentUser"]);
  });

  it("ensures a user by login and returns the record as the web hands it back", async () => {
    const { provider, calls } = build();
    const rec = await provider.ensureUserAsync("i:0#.f|membership|new@x.com");
    expect(rec).toEqual({
      Id: 9,
      Title: "New Person",
      LoginName: "i:0#.f|membership|new@x.com",
      Email: "new@x.com",
      PrincipalType: 1,
    });
    expect(calls).toEqual(["ensureUser:i:0#.f|membership|new@x.com"]);
  });

  it("reads group members by id", async () => {
    const { provider, calls } = build();
    expect((await provider.getGroupMembersAsync(3)).map((u) => u.Id)).toEqual([
      7,
    ]);
    expect(calls).toEqual(["groupUsers:3"]);
  });

  it("reads a user's groups", async () => {
    const { provider, calls } = build();
    expect((await provider.getUserGroupsAsync(7)).map((g) => g.Id)).toEqual([
      3,
    ]);
    expect(calls).toEqual(["userGroups:7"]);
  });

  // Membership mutations now travel only through executeBatchAsync — covered by
  // SharePointIdentityProvider.batch.test.ts.

  it("normalises people-picker results into principal records", async () => {
    const { provider, calls } = build();
    const [user, group] = await provider.searchPrincipalsAsync("ada", 5);
    expect(calls).toEqual(["peoplePicker:ada:5"]);

    // DisplayText/Key/EntityData are the picker's vocabulary; identity only knows the other.
    expect(user).toMatchObject({
      Id: 7,
      Title: "Ada Lovelace",
      LoginName: "i:0#.f|membership|ada@x.com",
      Email: "ada@x.com",
      PrincipalType: 1,
    });
    expect(group).toMatchObject({ Id: 3, Title: "Auditors", PrincipalType: 8 });
  });

  it("survives a picker entry with no EntityData rather than dropping the whole search", async () => {
    const { sp, calls } = makeFakeSp();
    sp.profiles.clientPeoplePickerSearchUser.mockImplementation(async () => {
      calls.push("peoplePicker");
      return [
        {
          DisplayText: "Ghost",
          Key: "i:0#.f|membership|ghost@x.com",
          EntityType: "User",
        },
      ] as never;
    });
    const provider = new SharePointIdentityProvider(sp as never);
    const [only] = await provider.searchPrincipalsAsync("ghost", 5);
    expect(only).toMatchObject({
      Title: "Ghost",
      LoginName: "i:0#.f|membership|ghost@x.com",
    });
    expect(only?.Id).toBeUndefined();
  });
});
