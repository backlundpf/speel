import path from "path";
import fs from "fs";

/** Directory holding cached storageState + lock files (gitignored). */
export const authDir = path.resolve(__dirname, "..", "..", ".auth");

if (!fs.existsSync(authDir)) {
  fs.mkdirSync(authDir, { recursive: true });
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Remove this run's stale lock for a browser/user pair at worker-0 startup, so
 *  a crashed prior run doesn't deadlock the next one. */
export function cleanStaleLocks(browserName: string, username: string): void {
  if (!fs.existsSync(authDir)) return;

  try {
    const lockName = `.auth-lock-${browserName}-${username}`;
    for (const file of fs.readdirSync(authDir)) {
      if (file !== lockName) continue;
      const lockPath = path.join(authDir, file);
      try {
        const lockAge = Date.now() - fs.statSync(lockPath).mtimeMs;
        if (lockAge > 5_000) {
          fs.unlinkSync(lockPath);
          console.log(
            `[${browserName}:worker-0] Removed stale lock: ${file} (age: ${Math.round(lockAge / 1000)}s)`,
          );
        }
      } catch {
        // Lock deleted by another worker — ignore.
      }
    }
  } catch (error) {
    console.warn(
      `[${browserName}:worker-0] Failed to clean stale locks: ${getErrorMessage(error)}`,
    );
  }
}

/** Acquire an exclusive file lock so parallel workers sharing a role
 *  authenticate once. Returns a release function. Throws after maxWaitMs. */
export async function acquireAuthLock(
  identifier: string,
  browserName: string,
  username: string,
  maxWaitMs = 120_000,
): Promise<() => void> {
  const lockFile = path.join(authDir, `.auth-lock-${browserName}-${username}`);
  const startTime = Date.now();
  const maxLockAge = 120_000; // older than 2 minutes is stale

  while (Date.now() - startTime < maxWaitMs) {
    try {
      if (fs.existsSync(lockFile)) {
        try {
          const lockAge = Date.now() - fs.statSync(lockFile).mtimeMs;
          if (lockAge > maxLockAge) {
            console.log(
              `[${identifier}] Removing stale lock (age: ${Math.round(lockAge / 1000)}s)`,
            );
            fs.unlinkSync(lockFile);
          }
        } catch {
          // Lock file vanished — ignore.
        }
      }

      // Atomic create-or-fail.
      fs.writeFileSync(lockFile, `${identifier}-${Date.now()}`, { flag: "wx" });
      console.log(`[${identifier}] Acquired auth lock`);

      return () => {
        try {
          if (fs.existsSync(lockFile)) {
            const content = fs.readFileSync(lockFile, "utf-8");
            if (content.startsWith(identifier)) {
              fs.unlinkSync(lockFile);
              console.log(`[${identifier}] Released auth lock`);
            }
          }
        } catch {
          // Already released — safe to ignore.
        }
      };
    } catch {
      // Lock held and not stale — wait and retry.
      await new Promise((resolve) => setTimeout(resolve, 1_000));
    }
  }

  throw new Error(
    `[${identifier}] Failed to acquire auth lock after ${maxWaitMs}ms`,
  );
}
