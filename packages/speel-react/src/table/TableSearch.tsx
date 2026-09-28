import { useEffect, useRef, useState } from "react";
import type { SpeelUIAdapter } from "../adapter/SpeelUIAdapter.js";

/** How long typing pauses before the search commits to table state. */
export const SEARCH_DEBOUNCE_MS = 250;

export interface TableSearchProps {
  ui: SpeelUIAdapter;
  /** The committed search — what the table is matching on right now. */
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
}

/**
 * The universal search box: local text that commits on a pause.
 *
 * The commit is debounced rather than per keystroke because a committed search is part of
 * the table's question, and with views in play every commit is a URL write — Safari refuses
 * more than a hundred `replaceState` calls in thirty seconds, which a fast typist reaches.
 * A committed value arriving from outside (a view switch, "Clear") replaces the local text.
 */
export function TableSearch({
  ui,
  value,
  onChange,
  placeholder = "Search",
}: TableSearchProps): JSX.Element {
  const [text, setText] = useState(value);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  // The commit fires later than the keystroke that scheduled it, and the setter it calls
  // closes over the table state of ITS render — so it is read at fire time, not capture time.
  const commit = useRef(onChange);
  commit.current = onChange;
  // A pending commit carries the text the user typed; an outside change supersedes it.
  const pending = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (pending.current !== undefined && value === pending.current) {
      pending.current = undefined;
      return;
    }
    if (timer.current) clearTimeout(timer.current);
    pending.current = undefined;
    setText(value);
  }, [value]);

  useEffect(() => () => clearTimeout(timer.current), []);

  const type = (next: string): void => {
    setText(next);
    if (timer.current) clearTimeout(timer.current);
    pending.current = next;
    timer.current = setTimeout(() => {
      timer.current = undefined;
      commit.current(next);
    }, SEARCH_DEBOUNCE_MS);
  };

  return (
    <ui.SearchBox
      value={text}
      onChange={type}
      placeholder={placeholder}
      ariaLabel="Search"
    />
  );
}
