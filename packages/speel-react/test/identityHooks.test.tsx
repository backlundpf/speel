import { describe, it, expect } from "vitest";
import * as React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { DbContext, ModelBuilder } from "@speel/core";
import { initSpeelIdentity, list } from "@speel/identity";
import { FakeIdentityProvider } from "@speel/identity/testing";
import { SpeelProvider } from "../src/SpeelProvider.js";
import {
  useAuthorized,
  useCurrentUser,
  useIdentity,
  usePermission,
} from "../src/identity/useIdentity.js";
import { usePeopleSearch } from "../src/context.js";
import { fakeAdapter } from "./fakeAdapter.js";
import { makeFakeProvider } from "./fakeProvider.js";

class Thing {
  Id?: number;
  Title?: string;
}
class TCtx extends DbContext {
  protected override onModelCreating(mb: ModelBuilder): void {
    mb.entity(Thing, (b) => {
      b.toList("Things");
      b.property((e) => e.Title).isText();
    });
  }
}

function setup(configure: (p: FakeIdentityProvider) => void = () => undefined) {
  const ctx = new TCtx({ provider: makeFakeProvider({ Things: [] }) } as never);
  const ids = new FakeIdentityProvider();
  configure(ids);
  const identity = initSpeelIdentity(ctx as never, (b) =>
    b
      .useProvider(ids)
      .addPolicy("Publish", (p) =>
        p.requirePermission("addListItems").onList("Views"),
      ),
  );
  return { ctx, ids, identity };
}

const wrap = (identity: unknown, ctx: unknown, ui: React.ReactElement) =>
  render(
    <SpeelProvider
      db={ctx as never}
      ui={fakeAdapter}
      identity={identity as never}
    >
      {ui}
    </SpeelProvider>,
  );

function Authorized(): JSX.Element {
  const { allowed, ready } = useAuthorized("Publish");
  return <div>{`allowed:${String(allowed)} ready:${String(ready)}`}</div>;
}

describe("identity hooks", () => {
  it("exposes the identity the host wired", () => {
    const { ctx, identity } = setup();
    function Probe(): JSX.Element {
      return <div>{useIdentity() ? "wired" : "inert"}</div>;
    }
    wrap(identity, ctx, <Probe />);
    expect(screen.getByText("wired")).toBeTruthy();
  });

  it("stays inert with no identity, rather than throwing", async () => {
    const ctx = new TCtx({
      provider: makeFakeProvider({ Things: [] }),
    } as never);
    render(
      <SpeelProvider db={ctx as never} ui={fakeAdapter}>
        <Authorized />
      </SpeelProvider>,
    );
    // Never ready, never allowed — a component need not know how the app is wired.
    expect(screen.getByText("allowed:false ready:false")).toBeTruthy();
  });

  it("denies while deciding, then allows", async () => {
    const { ctx, identity, ids } = setup((p) =>
      p.seedPermissions({ kind: "list", list: "Views" }, ["addListItems"]),
    );
    void ids;
    wrap(identity, ctx, <Authorized />);
    // The rule that matters: false first, never true-then-false. A button that appears late is
    // better than one that is offered and then withdrawn.
    expect(screen.getByText("allowed:false ready:false")).toBeTruthy();
    await waitFor(() =>
      expect(screen.getByText("allowed:true ready:true")).toBeTruthy(),
    );
  });

  it("settles on denied when the policy fails", async () => {
    const { ctx, identity } = setup((p) =>
      p.seedPermissions({ kind: "list", list: "Views" }, ["viewListItems"]),
    );
    wrap(identity, ctx, <Authorized />);
    await waitFor(() =>
      expect(screen.getByText("allowed:false ready:true")).toBeTruthy(),
    );
  });

  it("treats an authorization error as a denial, not a crash", async () => {
    const { ctx, identity, ids } = setup();
    ids.getEffectivePermissionsAsync = () =>
      Promise.reject(new Error("offline"));
    wrap(identity, ctx, <Authorized />);
    await waitFor(() =>
      expect(screen.getByText("allowed:false ready:true")).toBeTruthy(),
    );
  });

  it("answers a bare permission at a resource built inline", async () => {
    const { ctx, identity } = setup((p) =>
      p.seedPermissions({ kind: "list", list: "Contracts" }, ["manageLists"]),
    );
    function Probe(): JSX.Element {
      // Deliberately inline: `list(...)` returns a fresh object per render, and a raw object in
      // the effect's dependencies re-fetches forever. This test hangs if that regresses.
      const { allowed } = usePermission("manageLists", list("Contracts"));
      return <div>{`can:${String(allowed)}`}</div>;
    }
    wrap(identity, ctx, <Probe />);
    await waitFor(() => expect(screen.getByText("can:true")).toBeTruthy());
  });

  it("resolves the current user", async () => {
    const { ctx, identity, ids } = setup();
    ids.setCurrentUser({ Id: 7, Title: "Ada", LoginName: "ada" });
    function Probe(): JSX.Element {
      const { user, ready } = useCurrentUser();
      return <div>{ready ? `user:${user?.Title ?? "none"}` : "loading"}</div>;
    }
    wrap(identity, ctx, <Probe />);
    expect(screen.getByText("loading")).toBeTruthy();
    await waitFor(() => expect(screen.getByText("user:Ada")).toBeTruthy());
  });

  it("supplies people search from identity, and the prop still wins", async () => {
    const { ctx, identity, ids } = setup();
    ids.seedUser({ Id: 8, Title: "Grace Hopper", LoginName: "grace" });

    let seen: string[] = [];
    function Probe(): JSX.Element {
      const search = usePeopleSearch();
      React.useEffect(() => {
        void search?.("hopp").then((hits) => {
          seen = hits.map((p) => p.Title ?? "");
        });
      }, [search]);
      return <div>probe</div>;
    }

    wrap(identity, ctx, <Probe />);
    await waitFor(() => expect(seen).toEqual(["Grace Hopper"]));

    seen = [];
    render(
      <SpeelProvider
        db={ctx as never}
        ui={fakeAdapter}
        identity={identity as never}
        peopleSearch={() =>
          Promise.resolve([{ Title: "From the prop" } as never])
        }
      >
        <Probe />
      </SpeelProvider>,
    );
    await waitFor(() => expect(seen).toEqual(["From the prop"]));
  });
});
