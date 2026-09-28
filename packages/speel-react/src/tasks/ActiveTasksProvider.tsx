import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { useSpeelUI } from "../context.js";
import { useHostFontFamily } from "../overlay/useHostFont.js";
import { Z } from "../layers.js";

export type TaskStatus = "in-progress" | "aging" | "completed" | "failed";

export interface TaskOptions {
  label: string;
  blocking?: boolean; // default false
  expectedMs?: number; // default 10_000; after this elapses while running → 'aging'
}

export interface TaskHandle {
  update(patch: { label?: string; progress?: number }): void;
  done(): void;
  fail(error?: unknown): void;
}

export interface ActiveTasksApi {
  run<T>(work: (task: TaskHandle) => Promise<T>, opts: TaskOptions): Promise<T>;
  begin(opts: TaskOptions): TaskHandle;
}

interface ActiveTask {
  id: string;
  label: string;
  blocking: boolean;
  progress?: number;
  expectedMs: number;
  status: TaskStatus;
}

const DEFAULT_EXPECTED_MS = 10_000;
const PERSIST_MS = 3_000;

export const ActiveTasksCtx = createContext<ActiveTasksApi | null>(null);

let counter = 0;

/** Owns the active-task registry + timers; renders the portaled stack/overlay. Must be inside a SpeelProvider. */
export function ActiveTasksProvider({
  children,
}: {
  children: ReactNode;
}): JSX.Element {
  const [tasks, setTasks] = useState<ActiveTask[]>([]);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>[]>());

  const clearTimers = useCallback((id: string) => {
    (timers.current.get(id) ?? []).forEach(clearTimeout);
    timers.current.delete(id);
  }, []);

  const remove = useCallback(
    (id: string) => {
      setTasks((ts) => ts.filter((t) => t.id !== id));
      clearTimers(id);
    },
    [clearTimers],
  );

  const begin = useCallback(
    (opts: TaskOptions): TaskHandle => {
      const id = `task-${++counter}`;
      const expectedMs = opts.expectedMs ?? DEFAULT_EXPECTED_MS;
      const task: ActiveTask = {
        id,
        label: opts.label,
        blocking: opts.blocking ?? false,
        expectedMs,
        status: "in-progress",
      };
      setTasks((ts) => [...ts, task]);
      let finished = false;

      // (Re)start the aging countdown — a task only ages after `expectedMs` of no updates.
      const scheduleAging = (): void => {
        clearTimers(id);
        timers.current.set(id, [
          setTimeout(() => {
            setTasks((ts) =>
              ts.map((t) =>
                t.id === id && t.status === "in-progress"
                  ? { ...t, status: "aging" }
                  : t,
              ),
            );
          }, expectedMs),
        ]);
      };
      scheduleAging();

      const finish = (status: TaskStatus): void => {
        finished = true;
        setTasks((ts) => ts.map((t) => (t.id === id ? { ...t, status } : t)));
        clearTimers(id);
        timers.current.set(id, [setTimeout(() => remove(id), PERSIST_MS)]);
      };
      return {
        update: (patch) => {
          setTasks((ts) =>
            ts.map((t) => {
              if (t.id !== id) return t;
              const next = { ...t };
              if (patch.label !== undefined) next.label = patch.label;
              if (patch.progress !== undefined) next.progress = patch.progress;
              if (next.status === "aging") next.status = "in-progress";
              return next;
            }),
          );
          if (!finished) scheduleAging();
        },
        done: () => finish("completed"),
        fail: () => finish("failed"),
      };
    },
    [clearTimers, remove],
  );

  const run = useCallback(
    async <T,>(
      work: (task: TaskHandle) => Promise<T>,
      opts: TaskOptions,
    ): Promise<T> => {
      const h = begin(opts);
      try {
        const result = await work(h);
        h.done();
        return result;
      } catch (e) {
        h.fail(e);
        throw e;
      }
    },
    [begin],
  );

  const api = useMemo<ActiveTasksApi>(() => ({ run, begin }), [run, begin]);

  useEffect(() => {
    const map = timers.current;
    return () => {
      map.forEach((arr) => arr.forEach(clearTimeout));
      map.clear();
    };
  }, []);

  // The surfaces portal into document.body, which the host page may leave unstyled
  // (SharePoint does) — so they carry the font measured where the app renders.
  const { probe, fontFamily } = useHostFontFamily();
  return (
    <ActiveTasksCtx.Provider value={api}>
      {children}
      {probe}
      <TaskSurfaces tasks={tasks} {...(fontFamily ? { fontFamily } : {})} />
    </ActiveTasksCtx.Provider>
  );
}

const isActivelyBlocking = (t: ActiveTask): boolean =>
  t.blocking && (t.status === "in-progress" || t.status === "aging");

/** Terminal statuses win; a running task with progress shows its percentage, else the plain status. */
function statusText(t: ActiveTask): string {
  if (t.status === "completed") return "Completed";
  if (t.status === "failed") return "Failed";
  if (t.progress !== undefined) return `${Math.round(t.progress * 100)}%`;
  return t.status === "aging" ? "Aging" : "In Progress";
}

function TaskSurfaces({
  tasks,
  fontFamily,
}: {
  tasks: ActiveTask[];
  fontFamily?: string;
}): JSX.Element | null {
  const ui = useSpeelUI();
  if (typeof document === "undefined") return null;
  const blocking = tasks.filter(isActivelyBlocking);
  const stack = tasks.filter((t) => !isActivelyBlocking(t));
  // A row shows label + status; only progress tasks get a (determinate) bar.
  const row = (
    t: ActiveTask,
    color: string,
    width: number | string,
  ): JSX.Element => (
    <div
      key={t.id}
      style={{
        width,
        maxWidth: "calc(100vw - 64px)",
        display: "flex",
        flexDirection: "column",
        gap: 4,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 12,
          color,
          fontSize: 14,
        }}
      >
        <span>{t.label}</span>
        <span style={{ opacity: 0.7 }}>{statusText(t)}</span>
      </div>
      {t.progress !== undefined ? (
        <ui.ProgressBar value={t.status === "completed" ? 1 : t.progress} />
      ) : null}
    </div>
  );
  return createPortal(
    <>
      {stack.length > 0 ? (
        <div
          data-testid="task-stack"
          style={{
            position: "fixed",
            ...(fontFamily ? { fontFamily } : {}),
            zIndex: Z.runningTasks,
            bottom: 16,
            right: 16,
            width: 320,
            maxWidth: "calc(100vw - 32px)",
            background: "white",
            boxShadow: "0 2px 8px rgba(0,0,0,.2)",
            borderRadius: 4,
            padding: "8px 12px",
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}
        >
          {stack.map((t) => row(t, "inherit", "100%"))}
        </div>
      ) : null}
      {blocking.length > 0 ? (
        <div
          data-testid="blocking-overlay"
          style={{
            position: "fixed",
            ...(fontFamily ? { fontFamily } : {}),
            inset: 0,
            zIndex: Z.blockingTasks,
            background: "rgba(0,0,0,0.9)",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 16,
          }}
        >
          {blocking.map((t) => row(t, "white", 360))}
        </div>
      ) : null}
    </>,
    document.body,
  );
}
