import { dirname, resolve, isAbsolute } from "node:path";
import { createJiti } from "jiti";
import { transformSync, type Options as SwcOptions } from "@swc/core";
import type {
  DbContext,
  Model,
  IDbContextOptions,
  IStorageProvider,
} from "@speel/core";

/**
 * jiti's built-in transform uses babel's *legacy* decorators, which can't run the
 * Stage-3 decorators (@Entity/@XField) that decorator-defined entities rely on (the
 * decorator context, and its `metadata` channel, are absent in legacy mode). Swap in
 * SWC's '2022-03' decorator transform — which emits the context.metadata channel —
 * while jiti continues to handle module resolution, the import graph, and CJS interop.
 */
function swcDecoratorTransform(opts: {
  source: string;
  filename?: string;
  ts?: boolean;
}): { code: string; error?: unknown } {
  const filename = opts.filename ?? "module.ts";
  const isTsx = /\.tsx$/.test(filename);
  const isTs = opts.ts ?? /\.[cm]?tsx?$/.test(filename);
  try {
    const { code } = transformSync(opts.source, {
      filename,
      jsc: {
        parser: isTs
          ? { syntax: "typescript", decorators: true, tsx: isTsx }
          : { syntax: "ecmascript", decorators: true },
        transform: {
          decoratorVersion: "2022-03",
          useDefineForClassFields: true,
        },
        target: "es2022",
      },
      module: { type: "commonjs" },
      sourceMaps: false,
    } as SwcOptions);
    return { code };
  } catch (error) {
    return { code: opts.source, error };
  }
}

export interface IMigrationsConfig {
  /** The consumer's DbContext subclass — its onModelCreating defines the model. */
  context: new (options: IDbContextOptions) => DbContext;
  /** Directory for generated migration files + index.ts (relative to the config file). */
  migrationsDir: string;
  /** Path to the committed JSON snapshot (relative to the config file). */
  snapshot: string;
}

/** Identity helper for type-safe config authoring. */
export function defineMigrationsConfig(
  config: IMigrationsConfig,
): IMigrationsConfig {
  return config;
}

/** A no-op provider: the DbContext constructor builds the model without calling it. */
function stubProvider(): IStorageProvider {
  return new Proxy(
    {},
    {
      get: () => () => {
        throw new Error("stub provider: no I/O at design time");
      },
    },
  ) as unknown as IStorageProvider;
}

export interface ResolvedConfig {
  context: IMigrationsConfig["context"];
  migrationsDir: string; // absolute
  snapshot: string; // absolute
}

/** Import a TS/JS config module via jiti and resolve its paths against the config dir. */
export async function loadConfig(configPath: string): Promise<ResolvedConfig> {
  const absConfig = isAbsolute(configPath)
    ? configPath
    : resolve(process.cwd(), configPath);
  // nativeModules: load the already-built @speel packages natively rather than
  // re-transforming their (deep) module graphs. This keeps the call stack shallow,
  // shares the single @speel/core instance (so the decorator ENTITY_REGISTRY matches),
  // and — critically — avoids re-evaluating @speel/migrations-cli, whose bin.js entry
  // guard would otherwise re-run main() and recurse when invoked via the CLI.
  const jiti = createJiti(import.meta.url, {
    transform: swcDecoratorTransform,
    fsCache: false,
    nativeModules: [
      "@speel/core",
      "@speel/migrations",
      "@speel/migrations-cli",
    ],
  });
  const mod = await jiti.import<
    { default?: IMigrationsConfig } & Partial<IMigrationsConfig>
  >(absConfig);
  const cfg = mod.default ?? (mod as IMigrationsConfig);
  if (!cfg || typeof cfg.context !== "function") {
    throw new Error(
      `Invalid migrations config at ${absConfig}: missing 'context'.`,
    );
  }
  const base = dirname(absConfig);
  const abs = (p: string) => (isAbsolute(p) ? p : resolve(base, p));
  return {
    context: cfg.context,
    migrationsDir: abs(cfg.migrationsDir),
    snapshot: abs(cfg.snapshot),
  };
}

/** Construct the consumer context with a stub provider and read its built model. */
export function loadModel(cfg: ResolvedConfig): Model {
  const ctx = new cfg.context({ provider: stubProvider() });
  return ctx.model;
}
