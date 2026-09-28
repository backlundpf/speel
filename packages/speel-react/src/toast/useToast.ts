import { useContext } from "react";
import { ToastCtx, type ToastApi } from "./ToastProvider.js";

/** The toast trigger (callable + success/error/warning/info + dismiss). Requires a <ToastProvider>. */
export function useToast(): ToastApi {
  const api = useContext(ToastCtx);
  if (!api) throw new Error("useToast must be used within a <ToastProvider>.");
  return api;
}
