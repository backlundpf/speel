import { useState } from "react";
import { or, OPTIONS_QUERY_TAKE } from "@speel/core";
import type {
  DbSet,
  EntityCtor,
  FieldConfig,
  FilterNode,
  Principal,
} from "@speel/core";
import type { SpeelIdentity } from "@speel/identity";
import { useSpeelUI, usePeopleSearch, useSpeelContext } from "../context.js";
import { useIdentity } from "../identity/useIdentity.js";
import type { FieldHandle } from "../form/FieldHandle.js";
import type { FieldChrome, PersonaItem } from "../adapter/SpeelUIAdapter.js";
import { useDebouncedResolver } from "./useDebouncedResolver.js";
import { SelectionFieldBody } from "./SelectionFieldBody.js";

type LookupConfig = Extract<FieldConfig, { kind: "Lookup" }>;

function toPersona(p: Principal): PersonaItem {
  const item: PersonaItem = {
    key: String(p.Id ?? p.LoginName ?? p.Title),
    text: p.Title ?? "",
    data: p,
  };
  if (p.Email !== undefined) item.secondaryText = p.Email;
  return item;
}

const fold = (s: string | undefined | null): string => (s ?? "").toLowerCase();

/**
 * Every lookup routes through here, and the two shapes it picks between are different
 * controls rather than variants of one. The dispatcher itself calls no hooks, which is
 * what makes the branching safe: the bodies mount and unmount as whole components, so
 * the two never share a hook sequence.
 *
 * 1. A lookup whose target is provider-routed is a person column, and a person column is
 *    still a people picker — with or without an identity — because that control resolves
 *    an identity: it searches a directory, merges the site's groups, and refuses a person
 *    the site has never seen. Identity adds what only it can do (list the site's groups,
 *    provision a person); without one the picker still searches and still resolves a pick
 *    against the site's own users. Declaring `optionsQueryAsync` on it does not change
 *    that — the picker already asks per term, through `field.options`.
 * 2. Every other lookup is the selection combobox, whichever of the three option states
 *    (declared list, declared query, or the target loaded once) it is in.
 */
export function LookupDispatchBody({
  field,
  chrome,
}: {
  field: FieldHandle;
  chrome: FieldChrome;
}): JSX.Element {
  const config = field.config as LookupConfig;
  if (config.target.source.kind === "provider") {
    return <PrincipalFieldBody field={field} chrome={chrome} />;
  }
  return <SelectionFieldBody field={field} chrome={chrome} />;
}

/**
 * People field, target-driven: a `siteUsers` target admits people only; any other
 * provider source (`principals`) admits groups too.
 *
 * Suggestions come from the injected `peopleSearch` (people), merged with identity's
 * groups when an identity is wired; with no `peopleSearch` at all, the target's own rows
 * are filtered client-side, so the picker works with nothing wired.
 *
 * A pick must carry a site id before it is set: the save derives the FK from the
 * navigation's `Id`, so an id-less object would CLEAR the column. An id-less hit (a
 * Graph result) is provisioned through `identity.users.ensure` when identity is wired;
 * otherwise it is matched to the site's own record by login or email; a person the
 * site has never seen is refused, with the reason on the field.
 */
export function PrincipalFieldBody({
  field,
  chrome,
  identity: identityProp,
}: {
  field: FieldHandle;
  chrome: FieldChrome;
  /** Defaults to the identity in context, when the host wired one. */
  identity?: SpeelIdentity;
}): JSX.Element {
  const ui = useSpeelUI();
  const db = useSpeelContext();
  const peopleSearch = usePeopleSearch();
  const contextIdentity = useIdentity();
  const identity = identityProp ?? contextIdentity;
  const config = field.config as LookupConfig;
  const target = config.target;
  const source = target.source;
  const includeGroups =
    source.kind === "provider" && source.key !== "siteUsers";
  // `siteGroups` has no email column at all, so it cannot be asked about one.
  const hasEmail =
    target.findProperty("Email") !== undefined &&
    !(source.kind === "provider" && source.key === "siteGroups");
  const [unresolved, setUnresolved] = useState<string | undefined>(undefined);

  /** The target's set, typed as the principals it holds. */
  const principals = (): DbSet<Principal> =>
    db.set(target.ctor as EntityCtor<Principal>);

  const current = (
    Array.isArray(field.value) ? field.value : field.value ? [field.value] : []
  ) as Principal[];
  const value = current.map(toPersona);

  /**
   * The target's own rows for a typed query. It is asked of the SOURCE: this is
   * the whole directory when nothing else is wired, and a site's directory is
   * longer than any one read — a page of it, sieved here, would leave everyone
   * past that page unfindable with no sign that they exist.
   */
  async function directory(query: string): Promise<Principal[]> {
    // A declared loader owns the query outright, and now receives the text.
    if (config.optionsQueryAsync) {
      return ((await field.options?.load(query)) ?? []) as Principal[];
    }
    return principals()
      .where((b) => {
        const parts: FilterNode[] = [b.Title.contains(query)];
        if (hasEmail) parts.push(b.Email.contains(query));
        return or(...parts);
      })
      .take(OPTIONS_QUERY_TAKE)
      .toArrayAsync();
  }

  async function search(query: string): Promise<PersonaItem[]> {
    if (!peopleSearch) {
      // Nothing wired: the target's rows are the only directory there is.
      if (!query) return [];
      const q = fold(query);
      // The same predicate the source was asked for, so what shows is exactly
      // what matched however the store spells `contains`.
      return (await directory(query))
        .filter((r) => fold(r.Title).includes(q) || fold(r.Email).includes(q))
        .map(toPersona);
    }
    const users = await peopleSearch(query);
    let items = users.map(toPersona);
    if (includeGroups && query && identity) {
      const groups = (await identity.groups.all()).filter((g) =>
        fold(g.Title).includes(fold(query)),
      );
      items = items.concat(groups.map(toPersona));
    }
    return items;
  }

  // A picker asks on every keystroke, and each ask here is a Graph call or a
  // SharePoint read. Only the last one's answer was ever going to be shown.
  const onResolveSuggestions = useDebouncedResolver(search);

  /** The site's record for an id-less hit, or undefined when the site does not know them. */
  async function resolve(p: Principal): Promise<Principal | undefined> {
    if (p.Id != null) return p;
    if (identity && p.LoginName) return identity.users.ensure(p.LoginName);
    // Ask the site about THIS person, by the keys that identify her. Scanning a
    // read of the target's rows would make the answer depend on how many rows
    // came back: a colleague past that page reads as a stranger, and a stranger
    // is refused AND clears the field — the save would then clear the column.
    // Never the options loader either: what a picker offers is a different
    // question from whether the site knows who was picked.
    const byLogin =
      p.LoginName != null && target.findProperty("LoginName") !== undefined;
    const byEmail = p.Email != null && hasEmail;
    if (!byLogin && !byEmail) return undefined;
    const rows = await principals()
      .where((b) => {
        const parts: FilterNode[] = [];
        if (byLogin) parts.push(b.LoginName.eq(p.LoginName!));
        if (byEmail) parts.push(b.Email.eq(p.Email!));
        return or(...parts);
      })
      .toArrayAsync();
    return rows.find(
      (r) =>
        (p.LoginName != null && r.LoginName === p.LoginName) ||
        (p.Email != null && fold(r.Email) === fold(p.Email)),
    );
  }

  async function onSelect(selected: PersonaItem[]): Promise<void> {
    const resolved: Principal[] = [];
    const refused: string[] = [];
    for (const item of selected) {
      const p = item.data as Principal;
      const r = await resolve(p);
      if (r) resolved.push(r);
      else refused.push(p.Title ?? p.LoginName ?? p.Email ?? "?");
    }
    setUnresolved(
      refused.length > 0
        ? `${refused.join(", ")} ${refused.length > 1 ? "are" : "is"} not a user of this site.`
        : undefined,
    );
    field.setValue(config.multi ? resolved : resolved[0]);
  }

  const error = chrome.error ?? unresolved;
  return (
    <ui.PeoplePicker
      {...chrome}
      {...(error !== undefined ? { error } : {})}
      value={value}
      onChange={(v) => void onSelect(v)}
      onResolveSuggestions={onResolveSuggestions}
      multi={config.multi}
    />
  );
}
