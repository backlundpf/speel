import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { skinFiles, syncSkin } from "./sync-shadcn-skin.mjs";

function write(root, path, content) {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), content);
}

function fixture({ sample }) {
  const root = mkdtempSync(join(tmpdir(), "skin-sync-"));
  write(
    root,
    "registry/registry.json",
    JSON.stringify({
      items: [
        {
          name: "speel-shadcn",
          files: [
            {
              path: "src/speel-shadcn/adapter.tsx",
              target: "components/speel/adapter.tsx",
            },
            {
              path: "src/speel-shadcn/table.tsx",
              target: "components/speel/table.tsx",
            },
          ],
        },
      ],
    }),
  );
  write(root, "registry/src/speel-shadcn/adapter.tsx", "adapter v2\n");
  write(root, "registry/src/speel-shadcn/table.tsx", "table v2\n");
  for (const [path, content] of Object.entries(sample)) {
    write(root, `samples/spfx-sample/src/${path}`, content);
  }
  return root;
}

test("skinFiles maps each registry file to its target under the sample's src/", () => {
  const root = fixture({ sample: {} });
  assert.deepEqual(skinFiles(root), [
    {
      from: "registry/src/speel-shadcn/adapter.tsx",
      to: "samples/spfx-sample/src/components/speel/adapter.tsx",
    },
    {
      from: "registry/src/speel-shadcn/table.tsx",
      to: "samples/spfx-sample/src/components/speel/table.tsx",
    },
  ]);
});

test("check mode reports stale and missing copies without writing", () => {
  const root = fixture({
    sample: { "components/speel/adapter.tsx": "adapter v2\n" },
  });
  write(root, "samples/spfx-sample/src/components/speel/table.tsx", "old\n");
  const { stale } = syncSkin(root, { check: true });
  assert.deepEqual(stale, [
    "samples/spfx-sample/src/components/speel/table.tsx",
  ]);
  assert.equal(
    readFileSync(
      join(root, "samples/spfx-sample/src/components/speel/table.tsx"),
      "utf8",
    ),
    "old\n",
  );

  const missing = fixture({ sample: {} });
  assert.equal(syncSkin(missing, { check: true }).stale.length, 2);
});

test("sync copies stale files and is idempotent", () => {
  const root = fixture({
    sample: { "components/speel/table.tsx": "old\n" },
  });
  assert.equal(syncSkin(root).stale.length, 2);
  assert.equal(
    readFileSync(
      join(root, "samples/spfx-sample/src/components/speel/table.tsx"),
      "utf8",
    ),
    "table v2\n",
  );
  assert.deepEqual(syncSkin(root, { check: true }).stale, []);
});
