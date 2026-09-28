import { useCallback, useState } from "react";

export interface Disclosure {
  open: boolean;
  show(): void;
  hide(): void;
  toggle(): void;
}

/** Controlled open/close state for a surface. */
export function useDisclosure(initial = false): Disclosure {
  const [open, setOpen] = useState(initial);
  return {
    open,
    show: useCallback(() => setOpen(true), []),
    hide: useCallback(() => setOpen(false), []),
    toggle: useCallback(() => setOpen((o) => !o), []),
  };
}
