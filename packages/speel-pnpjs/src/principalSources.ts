// src/principalSources.ts
//
// The three principal endpoints SharePoint exposes disagree on what to call the
// same thing. This module is the one place that knows: a provider key routes to
// an endpoint, and a caller's column names translate to and from that endpoint's.
import type { FilterNode, IOrderKey, IProviderSource } from "@speel/core";
import { QueryTranslationException } from "@speel/core";

export const PRINCIPAL_SOURCE_KEYS = [
  "principals",
  "siteUsers",
  "siteGroups",
] as const;
export type PrincipalSourceKey = (typeof PRINCIPAL_SOURCE_KEYS)[number];

/** Whether this provider serves `source` — the non-throwing form of `principalSourceKey`. */
export function servesPrincipalSource(source: IProviderSource): boolean {
  return (PRINCIPAL_SOURCE_KEYS as readonly string[]).includes(source.key);
}

/** The key `source` names, or a throw naming it (rule 1) — for reads and write targets alike. */
export function principalSourceKey(
  source: IProviderSource,
): PrincipalSourceKey {
  if (servesPrincipalSource(source)) {
    return source.key as PrincipalSourceKey;
  }
  throw new Error(
    `SharePointProvider: unknown provider source '${source.key}'. ` +
      `This provider serves: ${PRINCIPAL_SOURCE_KEYS.join(", ")}.`,
  );
}

/**
 * The content types the User Information List issues, by id prefix: Person, and
 * the two group kinds — SharePointGroup and DomainGroup (a claims security group,
 * PrincipalType 4 on web/siteusers). Nothing else lives there (census of a live
 * site's UIL, 2026-09-14: 0x010A ×11, 0x010B ×31, 0x010C ×3, nothing more).
 */
export const PERSON_CONTENT_TYPE_PREFIX = "0x010A";
export const GROUP_CONTENT_TYPE_PREFIXES = ["0x010B", "0x010C"] as const;

/**
 * Model column → endpoint column, per key. `null` marks a column the endpoint has
 * no counterpart for: dropped from a $select, refused in a $filter/$orderby. A
 * column absent from a row passes through verbatim — the endpoint decides.
 * `PrincipalType` on the UIL is the one DERIVED column: selected as ContentTypeId,
 * filtered as prefix tests on it, never ordered by.
 */
const OUTBOUND: Record<
  PrincipalSourceKey,
  Readonly<Record<string, string | null>>
> = {
  principals: {
    Id: "Id",
    ID: "Id",
    Title: "Title",
    LoginName: "Name",
    Email: "EMail",
    PrincipalType: "ContentTypeId",
    Description: null,
    OwnerTitle: null,
  },
  siteUsers: {
    Id: "Id",
    ID: "Id",
    Title: "Title",
    LoginName: "LoginName",
    Email: "Email",
    PrincipalType: "PrincipalType",
    Description: null,
    OwnerTitle: null,
  },
  siteGroups: {
    Id: "Id",
    ID: "Id",
    Title: "Title",
    LoginName: "LoginName",
    Email: null,
    PrincipalType: null,
    Description: "Description",
    OwnerTitle: "OwnerTitle",
  },
};

export function outboundColumn(
  key: PrincipalSourceKey,
  column: string,
): string | null {
  const mapped = OUTBOUND[key][column];
  return mapped === undefined ? column : mapped;
}

/** The $select for a provider-source read: Id first, mapped, deduped, uncarried columns dropped. */
export function selectFor(
  key: PrincipalSourceKey,
  fields: readonly string[],
): string[] {
  const out: string[] = ["Id"];
  for (const f of fields) {
    const mapped = outboundColumn(key, f);
    if (mapped !== null && !out.includes(mapped)) out.push(mapped);
  }
  return out;
}

export function translateFilter(
  key: PrincipalSourceKey,
  node: FilterNode,
): FilterNode {
  switch (node.kind) {
    case "and":
    case "or":
      return {
        kind: node.kind,
        children: node.children.map((c) => translateFilter(key, c)),
      };
    case "not": {
      if (key === "principals") {
        // A `not` directly over a PrincipalType leaf folds into the leaf (eq↔ne,
        // in↔not in) so the output is the positive prefix form. Deeper, the
        // negation cannot be pushed through without emitting `not` over a
        // content-type test, which SharePoint 400s — refuse rather than 400.
        const child = node.child;
        if (isPrincipalTypeLeaf(child)) {
          return principalTypeOnUserInfoList(negateLeaf(child));
        }
        if (mentionsPrincipalType(child)) {
          throw new QueryTranslationException(
            `The User Information List cannot negate a content-type test: a PrincipalType ` +
              `predicate under 'not' on the principals source has no expressible form. ` +
              `Rewrite the predicate without 'not' (PrincipalType ne / not in, or the ` +
              `complementary value).`,
            node,
          );
        }
      }
      return { kind: "not", child: translateFilter(key, node.child) };
    }
    case "container-scope":
    case "include-containers":
      throw new QueryTranslationException(
        `Provider source '${key}' has no containers; '${node.kind}' does not apply to it.`,
        node,
      );
    default: {
      if (key === "principals" && node.column === "PrincipalType") {
        return principalTypeOnUserInfoList(node);
      }
      const column = outboundColumn(key, node.column);
      if (column === null) {
        throw new QueryTranslationException(
          `Provider source '${key}' has no column '${node.column}'; it cannot be filtered on.`,
          node,
        );
      }
      return { ...node, column };
    }
  }
}

type PrincipalTypeLeaf = Extract<FilterNode, { kind: "compare" | "in" }>;

/** A compare/in leaf on PrincipalType — the two shapes the UIL translation takes. */
function isPrincipalTypeLeaf(node: FilterNode): node is PrincipalTypeLeaf {
  return (
    (node.kind === "compare" || node.kind === "in") &&
    node.column === "PrincipalType"
  );
}

/** Whether a PrincipalType leaf sits anywhere in `node`. */
function mentionsPrincipalType(node: FilterNode): boolean {
  switch (node.kind) {
    case "and":
    case "or":
      return node.children.some(mentionsPrincipalType);
    case "not":
      return mentionsPrincipalType(node.child);
    default:
      return "column" in node && node.column === "PrincipalType";
  }
}

/** The leaf with its negation folded in: eq↔ne, in↔not in. Other compare ops are left for the translation to refuse. */
function negateLeaf(leaf: PrincipalTypeLeaf): PrincipalTypeLeaf {
  if (leaf.kind === "in") return { ...leaf, negate: !leaf.negate };
  if (leaf.op === "eq") return { ...leaf, op: "ne" };
  if (leaf.op === "ne") return { ...leaf, op: "eq" };
  return leaf;
}

/**
 * The UIL has no PrincipalType column. Its ContentTypeId tells person (0x010A…)
 * from group (0x010B…, 0x010C…) and nothing finer, so a PrincipalType predicate
 * becomes the prefix tests for the types it admits — and any value but 1 or 8 is
 * refused: answering `eq 4` with "every group" would hand back records whose own
 * PrincipalType reads 8. Negation is always spelled as the complementary prefixes:
 * `ne` and `not in` here, and a `not` directly over the leaf is folded into it by
 * `translateFilter` before it gets here. Never `not (startswith …)`: SharePoint's
 * list OData has no negated startswith (CAML has no "not BeginsWith") and answers
 * one with a 400.
 */
function principalTypeOnUserInfoList(node: FilterNode): FilterNode {
  const prefix = (value: string): FilterNode => ({
    kind: "string",
    column: "ContentTypeId",
    op: "startsWith",
    value,
  });
  const person = prefix(PERSON_CONTENT_TYPE_PREFIX);
  const group: FilterNode = {
    kind: "or",
    children: GROUP_CONTENT_TYPE_PREFIXES.map(prefix),
  };
  const typeOf = (v: unknown): 1 | 8 => {
    const n = Number(v);
    if (n !== 1 && n !== 8) {
      throw new QueryTranslationException(
        `The User Information List distinguishes only users (PrincipalType 1) from groups (8); ` +
          `${String(v)} cannot be expressed there. Query the siteUsers or siteGroups source instead.`,
        node,
      );
    }
    return n;
  };
  const complement = (of: ReadonlySet<1 | 8>): Set<1 | 8> =>
    new Set(([1, 8] as const).filter((t) => !of.has(t)));

  // The types the predicate admits, negation already folded in.
  let admits: Set<1 | 8>;
  if (node.kind === "compare") {
    if (node.op !== "eq" && node.op !== "ne") {
      throw new QueryTranslationException(
        `PrincipalType on the principals source supports only eq/ne/in (got ${node.op}).`,
        node,
      );
    }
    const t = new Set<1 | 8>([typeOf(node.value)]);
    admits = node.op === "eq" ? t : complement(t);
  } else if (node.kind === "in") {
    const ts = new Set<1 | 8>(node.values.map(typeOf));
    admits = node.negate ? complement(ts) : ts;
  } else {
    throw new QueryTranslationException(
      `PrincipalType on the principals source cannot be used in a '${node.kind}' filter.`,
      node,
    );
  }

  const tests: FilterNode[] = [];
  if (admits.has(1)) tests.push(person);
  if (admits.has(8)) tests.push(group);
  if (tests.length === 0) {
    // `not in [1, 8]` admits nothing the UIL holds: a contradiction the endpoint
    // accepts, so the answer is empty rather than an error.
    return { kind: "and", children: [person, group] };
  }
  return tests.length === 1 ? tests[0]! : { kind: "or", children: tests };
}

export function translateOrderBy(
  key: PrincipalSourceKey,
  keys: readonly IOrderKey[],
): IOrderKey[] {
  return keys.map((k) => {
    if (key === "principals" && k.column === "PrincipalType") {
      throw new Error(
        `PrincipalType is derived on the principals source and cannot order it.`,
      );
    }
    const column = outboundColumn(key, k.column);
    if (column === null) {
      throw new Error(
        `Provider source '${key}' has no column '${k.column}'; it cannot be ordered by.`,
      );
    }
    return { column, direction: k.direction };
  });
}

/**
 * A record from the endpoint, in the caller's spelling: Id plus the columns asked
 * for, renamed back, PrincipalType derived (UIL) or synthesised (siteGroups — every
 * record that endpoint returns is a SharePoint group). A UIL record without a
 * ContentTypeId gets no PrincipalType rather than a guess.
 */
export function inboundRecord(
  key: PrincipalSourceKey,
  rec: Record<string, unknown>,
  fields: readonly string[],
): Record<string, unknown> {
  const out: Record<string, unknown> = { Id: rec.Id ?? rec.ID };
  for (const f of fields) {
    if (f === "Id" || f === "ID") continue;
    if (f === "PrincipalType") {
      if (key === "principals") {
        const cid = rec.ContentTypeId;
        if (typeof cid === "string") {
          out.PrincipalType = cid.startsWith(PERSON_CONTENT_TYPE_PREFIX)
            ? 1
            : 8;
        }
      } else if (key === "siteGroups") {
        out.PrincipalType = 8;
      } else if (rec.PrincipalType !== undefined) {
        out.PrincipalType = rec.PrincipalType;
      }
      continue;
    }
    const src = outboundColumn(key, f);
    if (src === null) continue;
    if (rec[src] !== undefined) out[f] = rec[src];
  }
  return out;
}

/**
 * What SharePoint projects through an inline person `$expand` (`Owner/Title`): the
 * User Information List's Id, Title, EMail and Name — a `$select` of
 * `Owner/PrincipalType` or a group-only column fails the WHOLE query. So a
 * provider-targeted expand clause maps the caller's columns onto these and drops
 * the rest, whatever key the target names: the inline expand always answers from
 * the UIL.
 */
const PERSON_EXPAND_COLUMNS: Readonly<Record<string, string>> = {
  Id: "Id",
  ID: "Id",
  Title: "Title",
  LoginName: "Name",
  Email: "EMail",
};

export function personExpandColumn(column: string): string | undefined {
  return PERSON_EXPAND_COLUMNS[column];
}

/** A sub-record from an inline person expand, back in the caller's spelling: `Id`, then only the fields asked for. */
export function inboundPersonExpand(
  rec: Record<string, unknown>,
  fields: readonly string[],
): Record<string, unknown> {
  const out: Record<string, unknown> = { Id: rec.Id ?? rec.ID };
  for (const f of fields) {
    if (f === "Id" || f === "ID") continue;
    const src = PERSON_EXPAND_COLUMNS[f];
    if (src !== undefined && rec[src] !== undefined) out[f] = rec[src];
  }
  return out;
}
