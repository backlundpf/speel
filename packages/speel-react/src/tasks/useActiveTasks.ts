import { useContext } from "react";
import { ActiveTasksCtx, type ActiveTasksApi } from "./ActiveTasksProvider.js";

export function useActiveTasks(): ActiveTasksApi {
  const api = useContext(ActiveTasksCtx);
  if (!api)
    throw new Error(
      "useActiveTasks must be used within an <ActiveTasksProvider>.",
    );
  return api;
}
