speel-shadcn skin + stock shadcn ui, installed via `shadcn add` from the speel-shadcn
registry — not hand-edited. Refresh with `npx shadcn add ../../registry/public/r/speel-shadcn.json --overwrite`,
then re-apply the React-17 patches (`badge`/`button`/`calendar` from `registry/src/components/ui/`)
and `npm run tailwind:build`. See the repo-root `samples/spfx-sample/README.md` recipe.
