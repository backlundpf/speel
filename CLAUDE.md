# speel

## Public repo: no consumer references

This repo is public. Nothing committed — code, tests, docs, specs, plans, commit
messages — may name an external consumer app, organization, tenant, or account.
Use `contoso` / `example.sharepoint.com` and describe shapes generically ("a
two-filter default view"), even when a consumer motivated the work.

## Module specifiers

Package dist must load under plain Node ESM, not just bundlers (the migrations
CLI runs it under Node). Relative imports carry `.js` (`./DbContext.js`,
`./dir/index.js`); deep imports into packages without an `exports` map name the
file (`@pnp/sp/webs/index.js`). Package tsconfigs use NodeNext so tsc rejects
extensionless specifiers (pnpjs stays on Bundler: PnP's typings break under
NodeNext), and `npm run check:node-esm` (part of `verify`) imports each built
package with Node. `npm run fix:node-esm` rewrites specifiers in bulk
(`scripts/add-js-extensions.mjs`, idempotent) and re-runs prettier.

## Documentation system

Consumer docs live per package: `packages/<pkg>/README.md` (landing page:
pitch → install → quickstart → conventions → annotated TOC) and
`packages/<pkg>/docs/*.md` (topic pages). Pages ship in the npm tarball via
the `files` array. Full conventions: `docs/documentation.md`.

Rules:

- **Every feature branch lands with a docs delta.** The pipeline is
  brainstorm → plan → implement → document → squash-merge. A branch may
  hold several spec/plan cycles; run the document step ONCE per branch, as
  its final task before the squash merge (the API is stable then), not
  after each spec. The document step: find the topic page(s) the branch
  touched, update the Capabilities section, update the canonical example
  only if the 80% case changed, re-verify that example against the
  package's current `src/index.ts` exports (read it — never from memory),
  and add a README TOC line if a new page was added.
- **Spec and plan commits go on the feature branch, never directly on
  main.** They ride the branch and land inside its squash-merge commit.
- **Topic pages have exactly four H2s, in this order**: What & when / Canonical example /
  Capabilities / Boundaries & gotchas. 100–250 lines.
- **Altitude rule:** document capabilities and idioms, never exhaustive
  signatures, overloads, or option-bag members. The TypeScript types are
  the reference; the docs are the map. In-flux areas get
  `> Stability: still settling.` rather than omission.
- README TOC entries read: `- [Title](docs/file.md) — read when <doing X>.`
