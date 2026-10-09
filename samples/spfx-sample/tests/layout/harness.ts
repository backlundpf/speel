import type { Page } from "@playwright/test";
import { build, type Plugin } from "esbuild";
import { createRequire } from "node:module";
import path from "node:path";

const sampleDir = path.resolve(__dirname, "../..");
const fromSample = createRequire(path.join(sampleDir, "package.json"));

/**
 * One React and one Fluent in the bundle: the sample's, the versions SPFx ships.
 * `@speel/react` is a file: link, so without this its own imports would resolve from the
 * repo root's copies and the page would run two Reacts.
 */
const singleCopies: Plugin = {
  name: "single-copies",
  setup(b) {
    b.onResolve(
      { filter: /^(react|react-dom|@fluentui\/[^/]+)(\/.*)?$/ },
      (args) => ({ path: fromSample.resolve(args.path) }),
    );
  },
};

/** Bundles a fixture entry into one browser script. */
export async function bundle(entry: string): Promise<string> {
  const out = await build({
    entryPoints: [entry],
    bundle: true,
    write: false,
    format: "iife",
    platform: "browser",
    jsx: "automatic",
    define: { "process.env.NODE_ENV": '"production"' },
    alias: { "@": path.join(sampleDir, "src") },
    plugins: [singleCopies],
    logLevel: "silent",
  });
  return out.outputFiles[0]!.text;
}

/** Loads the bundle (and optional CSS) into an offline page and waits for the fixture. */
export async function open(
  page: Page,
  js: string,
  css?: string,
): Promise<void> {
  // A fixture that throws never sets `ready`: fail on the error itself, not on the timeout.
  const crashed = new Promise<Error>((resolve) =>
    page.once("pageerror", resolve),
  );
  await page.route("**/*", (route) => route.abort()); // offline: nothing leaves the page
  await page.setContent(
    '<!doctype html><html><body style="margin:0"><div id="root"></div></body></html>',
  );
  if (css) await page.addStyleTag({ content: css });
  await page.addScriptTag({ content: js });
  const error = await Promise.race([
    page
      .waitForFunction(() => document.body.dataset["ready"] === "1")
      .then(() => undefined),
    crashed,
  ]);
  if (error)
    throw new Error(`The fixture threw: ${error.stack ?? error.message}`);
}
