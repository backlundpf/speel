import { useContext } from "react";
import { SurfaceCtx, type SurfaceApi } from "./SurfaceManager.js";
import { useToast } from "../toast/useToast.js";
import { useActiveTasks } from "../tasks/useActiveTasks.js";
import type { ToastApi } from "../toast/ToastProvider.js";
import type { ActiveTasksApi } from "../tasks/ActiveTasksProvider.js";

export function useSurfaces(): SurfaceApi {
  const api = useContext(SurfaceCtx);
  if (!api)
    throw new Error("useSurfaces must be used within a <SpeelProvider>.");
  return api;
}

/** One-import access to every overlay system: toasts, active tasks, and imperative surfaces. */
export function useOverlays(): SurfaceApi & {
  toast: ToastApi;
  tasks: ActiveTasksApi;
} {
  const surfaces = useSurfaces();
  const toast = useToast();
  const tasks = useActiveTasks();
  return { ...surfaces, toast, tasks };
}
