import {
  createElement,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useSyncExternalStore } from "use-sync-external-store/shim";
import type { FilterState } from "../filter/FilterBar.js";
import type { ColumnState } from "../columnState.js";
import type { FilterOrigin, TableState } from "../useTableState.js";
import {
  getUrlSnapshot,
  subscribeToUrl,
  writeUrlParams,
} from "../../url/urlStore.js";
import {
  decodeQuestion,
  encodeQuestion,
  tableUrlKeys,
} from "./tableUrlCodecs.js";
import type {
  AppDefaultView,
  StoredView,
  TableViewStore,
} from "./viewStore.js";
import type { SharedTableViewStore } from "./sharedViewStore.js";
import { ViewPicker } from "./ViewPicker.js";
import { useSpeelUI } from "../../context.js";
import {
  useUserSetting,
  useUserSettingsStore,
} from "../../settings/useUserSetting.js";
import { createSettingsViewStore } from "./settingsViewStore.js";
import { createLocalViewStore } from "./viewStore.js";

export interface TableViewsOptions {
  /** Namespaces this table's URL params and its stored views. */
  tableId: string;
  /**
   * Where this user's views live. Omitted, they follow the user when identity is wired and
   * fall back to this browser when it is not — so a table works with no wiring at all, at the
   * cost that local views do not migrate if identity is added later.
   */
  viewStore?: TableViewStore;
  /**
   * The app-authored baseline, never written to. The **first entry is the table's default** —
   * what a user who has never touched the picker sees, and what a bare URL means. Any further
   * entries are alternatives the app ships: the picker lists them all, in this order, above
   * the user's own views. Names must be unique.
   */
  defaultViews: readonly AppDefaultView[];
  /** Defaults to `tableId`. Short is better — SPFx paths are long already. */
  urlPrefix?: string;
  /** Column write-through debounce. Over a second in practice; 0 in tests. */
  debounceMs?: number;
  /** Published views everyone sees. Omitted, the table has personal views only. */
  sharedViewStore?: SharedTableViewStore;
}

export interface TableViews {
  /** Spread onto `SpeelTable` / `SpeelEntityTable`. */
  table: {
    tableState: TableState;
    onTableStateChange: (next: TableState) => void;
    /** Which of the three layers the live filters came from — the table validates each
     *  according to who wrote it. */
    filterOrigins: FilterOrigin[];
  };
  /** Drop into the table's `toolbar` slot. */
  picker: ReactNode;
  views: StoredView[];
  /** Published views, listed apart from personal ones. */
  sharedViews: StoredView[];
  /** The app-authored views, in author order — the first is this table's default. */
  defaultViews: readonly AppDefaultView[];
  /** Which app-authored view is in effect. Meaningful while `activeView` is undefined. */
  activeDefaultView: AppDefaultView;
  /** `undefined` means an app-authored view is active — `activeDefaultView` says which. */
  activeView: StoredView | undefined;
  activeIsShared: boolean;
  /** May the user publish, rename, or delete shared views? */
  canPublish: boolean;
  /** Is the active view the user's to change — personal, or shared when they may publish? */
  canEditActive: boolean;
  /** Is the active view the one this user starts on? */
  activeIsStartingView: boolean;
  loading: boolean;
  dirty: boolean;
  error: string | undefined;
  /** Column edits made on the pristine default, which have nowhere to be saved yet. */
  pendingDefaultEdits: boolean;
  canUndo: boolean;
  save: () => Promise<void>;
  saveAs: (name: string) => Promise<void>;
  rename: (name: string) => Promise<void>;
  remove: () => Promise<void>;
  setStartingView: () => Promise<void>;
  /** Move a personal view into the shared store, so the team sees it. */
  publish: () => Promise<void>;
  /** Move it back: the team's view becomes the publisher's own again. */
  unpublish: () => Promise<void>;
  switchTo: (viewId: string | undefined) => void;
  /** Select an app-authored view by name. An unknown name selects the default one. */
  switchToDefault: (name: string) => void;
  reset: () => void;
  undo: () => void;
  undoAll: () => void;
}

/** The presentation half of a descriptor: what auto-saves rather than waiting for Save. */
interface SessionPresentation {
  columns?: ColumnState;
  pageSize?: number;
}

interface UrlSlice {
  filters: FilterState;
  clearedScope: string[];
  sort?: TableState["sort"];
  page?: number;
  search?: string;
  /** The view this link names, if it names one. Deliberately outside `present`. */
  view?: string;
  /**
   * The blob spoke. It then answers for the WHOLE question — filters, sort, page and
   * dismissed scope — and the view's own baseline is ignored, which is what makes an
   * empty filter map mean "cleared" rather than "untouched".
   */
  present: boolean;
  /** There was a blob and it could not be read. Warned about once, then ignored. */
  malformed: boolean;
}

function readUrl(search: string, prefix: string): UrlSlice {
  const keys = tableUrlKeys(prefix);
  const params = new URLSearchParams(search);
  // Which view, NOT part of `present`: naming the view you are looking at is not unsaved
  // work, so it must never light up Save and Discard changes.
  const view = params.get(keys.view);
  const named = view !== null && view !== "" ? { view } : {};
  const empty = {
    filters: {},
    clearedScope: [],
    present: false,
    ...named,
  };

  const raw = params.get(keys.question);
  if (raw === null || raw === "") return { ...empty, malformed: false };
  const question = decodeQuestion(raw);
  if (question === undefined) return { ...empty, malformed: true };
  return {
    filters: question.filters,
    clearedScope: question.clearedScope,
    present: true,
    malformed: false,
    ...named,
    ...(question.sort !== undefined ? { sort: question.sort } : {}),
    ...(question.page !== undefined ? { page: question.page } : {}),
    ...(question.search !== undefined ? { search: question.search } : {}),
  };
}

/**
 * Is this state the same *question* the view already asks?
 *
 * Every part the URL carries has to be compared, page included. Comparing only sort and
 * filters made turning a page look like a revert, so the params were cleared and the page
 * write discarded — the pager appeared dead.
 */
function sameQuestion(a: TableState, b: TableState): boolean {
  const norm = (s: TableState): string =>
    JSON.stringify({
      sort: s.sort ?? null,
      filters: Object.entries(s.filters ?? {}).sort(([x], [y]) =>
        x.localeCompare(y),
      ),
      page: s.page ?? 0,
      clearedScope: [...(s.clearedScope ?? [])].sort(),
      search: (s.search ?? "").trim(),
    });
  return norm(a) === norm(b);
}

/**
 * Named views over three layers of state.
 *
 * Columns write through to the active view on a debounce, because layout fiddling is casual
 * and constant. Sort and filters go to the URL and stay dirty until Save, because a data
 * question is the thing worth naming and sharing.
 *
 * The URL is read through `urlStore` rather than `useUrlState`: that hook decodes each key to
 * a value, and this layer needs the three-way answer a codec cannot give — the question is
 * absent, present, or present-but-unreadable — since presence is exactly what makes an empty
 * question mean "cleared".
 */
export function useTableViews(o: TableViewsOptions): TableViews {
  const { tableId, defaultViews, debounceMs = 1200 } = o;
  // The list is source code, so a table with nothing to show or two views answering to one
  // name is a bug at the call site — loud at init, like every other authored input here.
  if (defaultViews.length === 0) {
    throw new Error(
      "useTableViews: defaultViews is empty — supply at least one app-authored view.",
    );
  }
  const seen = new Set<string>();
  for (const view of defaultViews) {
    if (seen.has(view.name)) {
      throw new Error(
        `useTableViews: duplicate app-default view name '${view.name}'.`,
      );
    }
    seen.add(view.name);
  }
  const defaultView = defaultViews[0]!;

  const settingsStore = useUserSettingsStore();
  // Memoised on the settings store: a fresh view store each render would retrigger the load
  // effect below on every pass.
  const fallbackStore = useMemo(
    () =>
      settingsStore
        ? createSettingsViewStore(settingsStore)
        : createLocalViewStore(),
    [settingsStore],
  );
  const viewStore = o.viewStore ?? fallbackStore;
  const prefix = (o.urlPrefix ?? tableId).toLowerCase();
  const ui = useSpeelUI();

  const [views, setViews] = useState<StoredView[]>([]);
  const [sharedViews, setSharedViews] = useState<StoredView[]>([]);
  const [canPublish, setCanPublish] = useState(false);
  const [activeId, setActiveId] = useState<string | undefined>(undefined);
  // Which app-authored view is selected. Consulted only while no stored view is active, so
  // switching to a stored view and back lands where the user left off.
  const [activeDefaultName, setActiveDefaultName] = useState<
    string | undefined
  >(undefined);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | undefined>(undefined);

  // A per-user pointer, not a flag on the record: stored on the view it would let one user
  // change where everyone lands, and keeping one flag exclusive meant writing N records.
  const [startingViewId, setStartingViewId] = useUserSetting<
    string | undefined
  >(`table.startingView.${tableId}`, undefined);
  // Presentation held in memory: either not yet flushed to the active view, or made on the
  // pristine default view, which is never written to.
  const [session, setSession] = useState<SessionPresentation>({});

  const undoStack = useRef<ColumnState[]>([]);
  const undoBase = useRef<ColumnState | undefined>(undefined);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );

  const search = useSyncExternalStore(
    subscribeToUrl,
    getUrlSnapshot,
    getUrlSnapshot,
  );
  const url = useMemo(() => readUrl(search, prefix), [search, prefix]);

  const sharedStore = o.sharedViewStore;

  // Both stores and the permission question resolve together, so the layout settles once
  // rather than flipping as each answer lands.
  useEffect(() => {
    let live = true;
    void Promise.all([
      viewStore.list(tableId),
      sharedStore
        ? sharedStore.list(tableId)
        : Promise.resolve<StoredView[]>([]),
      sharedStore ? sharedStore.canPublish() : Promise.resolve(false),
    ]).then(
      ([mine, theirs, mayPublish]) => {
        if (!live) return;
        setViews(mine);
        setSharedViews(theirs);
        setCanPublish(mayPublish);
        setLoading(false);
      },
      (e: unknown) => {
        if (!live) return;
        setError(e instanceof Error ? e.message : String(e));
        setLoading(false);
      },
    );
    return () => {
      live = false;
    };
  }, [viewStore, sharedStore, tableId]);

  // One Set per mounted table, the same bookkeeping a dead filter key gets: a name that
  // resolves to nothing is worth saying once, not once per render.
  const warnedViewNames = useRef<Set<string>>(new Set());

  /**
   * A question nobody can read is user-carried state, so it is loud once and then ignored —
   * the table falls back to the view exactly as a bare URL would. The param is left alone:
   * rewriting it would destroy the evidence the user needs to see what they pasted.
   */
  const warnedBadQuestion = useRef(false);
  useEffect(() => {
    if (!url.malformed || warnedBadQuestion.current) return;
    warnedBadQuestion.current = true;
    // eslint-disable-next-line no-console
    console.warn(
      `[speel] table '${tableId}': the url question could not be read — using the view instead.`,
    );
  }, [url.malformed, tableId]);

  /**
   * Which view this visit opens on, decided once the lists are known.
   *
   * A name in the URL wins over the user's starting view: the link says what THIS visit is
   * about, while the starting view says what visits usually are. Names resolve app-authored
   * first, then personal, then shared — the app's own vocabulary is the one an author writing
   * a link can count on. A name nobody answers to is user-carried state, so it warns and the
   * default view stands, exactly as a bare URL would.
   *
   * A starting-view pointer to a view that no longer exists — unpublished, deleted — falls
   * back silently instead: a stale preference is not worth interrupting anyone over.
   */
  const applied = useRef(false);
  useEffect(() => {
    if (loading || applied.current) return;
    applied.current = true;
    const named = url.view;
    if (named !== undefined) {
      const app = defaultViews.find((v) => v.name === named);
      if (app) {
        setActiveDefaultName(app.name);
        return;
      }
      const stored =
        views.find((v) => v.name === named) ??
        sharedViews.find((v) => v.name === named);
      if (stored) {
        setActiveId(stored.id);
        return;
      }
      if (!warnedViewNames.current.has(named)) {
        warnedViewNames.current.add(named);
        // eslint-disable-next-line no-console
        console.warn(
          `[speel] table '${tableId}': url view '${named}' not found — using the default view.`,
        );
      }
      return;
    }
    if (startingViewId === undefined) return;
    const exists = [...views, ...sharedViews].some(
      (v) => v.id === startingViewId,
    );
    if (exists) setActiveId(startingViewId);
  }, [
    loading,
    startingViewId,
    views,
    sharedViews,
    url.view,
    defaultViews,
    tableId,
  ]);

  const activeView =
    views.find((v) => v.id === activeId) ??
    sharedViews.find((v) => v.id === activeId);
  const activeIsShared =
    activeView !== undefined && sharedViews.some((v) => v.id === activeView.id);
  /**
   * "Is this mine to edit" — the rule that used to be "is this the app default". A shared view
   * the user cannot publish is simply a second kind of read-only, and every downstream guard
   * (Save, Rename, Delete, held column edits) already keys off it.
   */
  const canEditActive =
    activeView !== undefined && (!activeIsShared || canPublish);
  const activeDefaultView =
    defaultViews.find((v) => v.name === activeDefaultName) ?? defaultView;
  const base = activeView?.descriptor ?? activeDefaultView.descriptor;

  // The URL is authoritative for the question when it speaks — wholesale, sort included, so
  // a question that omits a part means the part is not being asked. The view supplies the
  // presentation either way.
  const tableState: TableState = useMemo(
    () => ({
      columns: session.columns ?? base.columns,
      ...(url.present
        ? url.sort
          ? { sort: url.sort }
          : {}
        : base.sort
          ? { sort: base.sort }
          : {}),
      filters: url.present ? url.filters : (base.filters ?? {}),
      ...(url.present
        ? url.search !== undefined
          ? { search: url.search }
          : {}
        : base.search !== undefined
          ? { search: base.search }
          : {}),
      ...((session.pageSize ?? base.pageSize) !== undefined
        ? { pageSize: session.pageSize ?? base.pageSize }
        : {}),
      ...(url.page !== undefined ? { page: url.page } : {}),
      ...(url.clearedScope.length > 0
        ? { clearedScope: url.clearedScope }
        : {}),
    }),
    [session, base, url],
  );

  /**
   * The provenance of the filters in `tableState`, for the table to police.
   *
   * EVERY app-authored view is checked whichever one is active: they are source code versioned
   * with the model, so a key naming nothing is a bug wherever it sits — and one that only
   * bites the day a user picks the third view is the silent failure this exists to prevent.
   * What the user carries — the active saved view, or a pasted URL — is only checked when it
   * is what the table is actually filtering by, since a warning about an unapplied key is
   * noise.
   */
  const filterOrigins = useMemo<FilterOrigin[]>(() => {
    const origins: FilterOrigin[] = defaultViews.map((view) => ({
      label: `default view '${view.name}' filter`,
      loudness: "throw",
      tableId,
      ...(view.descriptor.filters !== undefined
        ? { filters: view.descriptor.filters }
        : {}),
    }));
    if (url.present) {
      origins.push({
        label: "url filter",
        loudness: "warn",
        tableId,
        filters: url.filters,
      });
    } else if (activeView?.descriptor.filters !== undefined) {
      origins.push({
        label: "saved view filter",
        loudness: "warn",
        tableId,
        filters: activeView.descriptor.filters,
      });
    }
    return origins;
  }, [defaultViews, tableId, url, activeView]);

  const clearParams = useCallback(() => {
    const key = tableUrlKeys(prefix).question;
    // Nothing to drop: a history write per keystroke on an already-bare URL is churn the
    // host shell sees.
    if (new URLSearchParams(window.location.search).get(key) === null) return;
    writeUrlParams([[key, null]], "replace");
  }, [prefix]);

  /**
   * Address the selected view by name, so a link reproduces the pick rather than the pile of
   * filters behind it. The default view writes NOTHING: a bare URL has always meant the
   * default, and spelling it out would put a param in every link for the common case.
   */
  const currentViewParam = useCallback(
    (): string | null =>
      new URLSearchParams(window.location.search).get(
        tableUrlKeys(prefix).view,
      ),
    [prefix],
  );

  const writeViewParam = useCallback(
    (name: string | undefined) => {
      const next =
        name === undefined || name === defaultView.name ? null : name;
      // Nothing to say: a redundant history write on every pick is churn the host shell sees.
      if (currentViewParam() === next) return;
      writeUrlParams([[tableUrlKeys(prefix).view, next]], "replace");
    },
    [prefix, defaultView.name, currentViewParam],
  );

  /**
   * The FULL effective question replaces the param, never a delta: a delta would be
   * reinterpreted against whatever view the recipient happens to have. Written whole, an
   * empty filter map is a statement — "nothing is being filtered" — which is what makes
   * clear-all survive a reload against a view that carries baseline filters.
   */
  const writeQuestion = useCallback(
    (next: TableState) => {
      writeUrlParams(
        [[tableUrlKeys(prefix).question, encodeQuestion(next)]],
        "replace",
      );
    },
    [prefix],
  );

  /**
   * Presentation — the column arrangement and the page size — writes through to the active
   * view on a debounce. Both are "how I like to read this", casual and constant, so neither
   * waits for Save. On the pristine default view there is nowhere to write, so the change is
   * held in session state and the picker's menu offers "Save as new view".
   */
  const persistPresentation = useCallback(
    (presentation: SessionPresentation) => {
      setSession((prev) => ({ ...prev, ...presentation }));
      // Not editable — the app default, or someone else's shared view — so the change lives in
      // session state until the user saves a view of their own.
      if (!activeView || !canEditActive) return;
      if (saveTimer.current) clearTimeout(saveTimer.current);
      const view = activeView;
      const store = activeIsShared ? sharedStore! : viewStore;
      saveTimer.current = setTimeout(() => {
        const descriptor = {
          ...view.descriptor,
          ...(presentation.columns !== undefined
            ? { columns: presentation.columns }
            : {}),
          ...(presentation.pageSize !== undefined
            ? { pageSize: presentation.pageSize }
            : {}),
        };
        void store.save({ ...view, descriptor }).then(
          (saved) => {
            const replace = (prev: StoredView[]): StoredView[] =>
              prev.map((v) => (v.id === saved.id ? saved : v));
            if (activeIsShared) setSharedViews(replace);
            else setViews(replace);
            setSession({});
          },
          (e: unknown) => setError(e instanceof Error ? e.message : String(e)),
        );
      }, debounceMs);
    },
    [
      activeView,
      canEditActive,
      activeIsShared,
      sharedStore,
      viewStore,
      debounceMs,
    ],
  );

  const onTableStateChange = useCallback(
    (next: TableState) => {
      const columnsChanged =
        JSON.stringify(next.columns) !== JSON.stringify(tableState.columns);
      const pageSizeChanged = next.pageSize !== tableState.pageSize;
      if (columnsChanged) {
        undoStack.current.push(tableState.columns);
        if (undoBase.current === undefined)
          undoBase.current = tableState.columns;
      }
      if (columnsChanged || pageSizeChanged) {
        persistPresentation({
          ...(columnsChanged ? { columns: next.columns } : {}),
          ...(pageSizeChanged && next.pageSize !== undefined
            ? { pageSize: next.pageSize }
            : {}),
        });
      }
      // A change that lands back on the view's own question clears the params instead of
      // claiming "modified" over an identical arrangement.
      if (sameQuestion(next, base)) clearParams();
      else writeQuestion(next);
    },
    [tableState, base, persistPresentation, writeQuestion, clearParams],
  );

  const replaceView = useCallback((saved: StoredView) => {
    setViews((prev) =>
      prev.some((v) => v.id === saved.id)
        ? prev.map((v) => (v.id === saved.id ? saved : v))
        : [...prev, saved],
    );
  }, []);

  const guard = async (work: () => Promise<void>): Promise<void> => {
    try {
      setError(undefined);
      await work();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const descriptorNow = (): StoredView["descriptor"] => ({
    columns: tableState.columns,
    ...(tableState.sort !== undefined ? { sort: tableState.sort } : {}),
    ...(tableState.filters !== undefined
      ? { filters: tableState.filters }
      : {}),
    ...(tableState.search !== undefined && tableState.search.trim() !== ""
      ? { search: tableState.search }
      : {}),
    ...(tableState.pageSize !== undefined
      ? { pageSize: tableState.pageSize }
      : {}),
  });

  /** The store that owns the active view — shared views are written through the shared one. */
  const owningStore = (): TableViewStore =>
    activeIsShared ? sharedStore! : viewStore;

  const save = (): Promise<void> =>
    guard(async () => {
      if (!activeView || !canEditActive) return;
      const saved = await owningStore().save({
        ...activeView,
        descriptor: descriptorNow(),
      });
      if (activeIsShared)
        setSharedViews((p) => p.map((v) => (v.id === saved.id ? saved : v)));
      else replaceView(saved);
      clearParams();
    });

  const saveAs = (name: string): Promise<void> =>
    guard(async () => {
      const saved = await viewStore.save({
        id: "",
        tableId,
        name,
        descriptor: descriptorNow(),
      });
      replaceView(saved);
      setActiveId(saved.id);
      setSession({});
      undoStack.current = [];
      undoBase.current = undefined;
      clearParams();
      // The new view is the selected one, so the URL says so — otherwise a refresh would
      // land back on the default and the view just created would look lost.
      writeViewParam(saved.name);
    });

  const rename = (name: string): Promise<void> =>
    guard(async () => {
      if (!activeView || !canEditActive) return;
      const saved = await owningStore().save({ ...activeView, name });
      if (activeIsShared)
        setSharedViews((p) => p.map((v) => (v.id === saved.id ? saved : v)));
      else replaceView(saved);
      // The name IS the address, so a rename would otherwise leave the URL pointing at a view
      // that no longer answers. Only when the URL was addressing it: renaming should not add a
      // param nobody asked for.
      if (currentViewParam() === activeView.name) writeViewParam(saved.name);
    });

  const remove = (): Promise<void> =>
    guard(async () => {
      if (!activeView || !canEditActive) return;
      await owningStore().remove(activeView.id);
      const drop = (prev: StoredView[]): StoredView[] =>
        prev.filter((v) => v.id !== activeView.id);
      if (activeIsShared) setSharedViews(drop);
      else setViews(drop);
      setActiveId(undefined); // never viewless: fall back to the app default
      clearParams();
      writeViewParam(undefined); // the address died with the view
    });

  const setStartingView = (): Promise<void> =>
    guard(() => {
      if (activeView) setStartingViewId(activeView.id);
      return Promise.resolve();
    });

  /**
   * Publishing MOVES the view: saved into the shared store, removed from the personal one.
   * Copying would leave two entries with the same name in one picker, drifting apart with no
   * way to tell them apart from the menu.
   */
  const publish = (): Promise<void> =>
    guard(async () => {
      if (!activeView || activeIsShared || !sharedStore || !canPublish) return;
      const shared = await sharedStore.save({ ...activeView, id: "" });
      await viewStore.remove(activeView.id);
      setViews((prev) => prev.filter((v) => v.id !== activeView.id));
      setSharedViews((prev) => [...prev, shared]);
      setActiveId(shared.id);
    });

  /** The same move backwards: the team's view becomes the publisher's own again. */
  const unpublish = (): Promise<void> =>
    guard(async () => {
      if (!activeView || !activeIsShared || !sharedStore || !canPublish) return;
      const mine = await viewStore.save({ ...activeView, id: "" });
      await sharedStore.remove(activeView.id);
      setSharedViews((prev) => prev.filter((v) => v.id !== activeView.id));
      replaceView(mine);
      setActiveId(mine.id);
    });

  /** Everything a pick drops, whichever kind of view was picked. */
  const startFresh = (): void => {
    // The URL outranks the view, so leaving the old params would override the pick.
    clearParams();
    setSession({});
    undoStack.current = [];
    undoBase.current = undefined;
  };

  const switchTo = (viewId: string | undefined): void => {
    startFresh();
    setActiveId(viewId);
    if (viewId === undefined) setActiveDefaultName(defaultView.name);
    writeViewParam(
      viewId === undefined
        ? undefined
        : [...views, ...sharedViews].find((v) => v.id === viewId)?.name,
    );
  };

  const switchToDefault = (name: string): void => {
    startFresh();
    setActiveId(undefined);
    const found = defaultViews.find((v) => v.name === name);
    setActiveDefaultName((found ?? defaultView).name);
    writeViewParam((found ?? defaultView).name);
  };

  /**
   * Everything unsaved, gone: the URL's question AND any presentation still held in session
   * — an edit made on the pristine default, or one not yet flushed to the active view. The
   * control is called "Discard changes", so leaving half of it behind would make it a liar.
   */
  const discardChanges = (): void => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    setSession({});
    undoStack.current = [];
    undoBase.current = undefined;
    clearParams();
  };

  const undo = (): void => {
    const previous = undoStack.current.pop();
    if (previous) persistPresentation({ columns: previous });
  };

  const undoAll = (): void => {
    const start = undoBase.current;
    if (!start) return;
    undoStack.current = [];
    undoBase.current = undefined;
    persistPresentation({ columns: start });
  };

  const result: TableViews = {
    table: { tableState, onTableStateChange, filterOrigins },
    picker: null,
    views,
    sharedViews,
    defaultViews,
    activeDefaultView,
    activeView,
    activeIsShared,
    canPublish,
    canEditActive,
    activeIsStartingView:
      activeView !== undefined && activeView.id === startingViewId,
    loading,
    dirty: url.present,
    error,
    pendingDefaultEdits:
      !canEditActive &&
      (session.columns !== undefined || session.pageSize !== undefined),
    canUndo: undoStack.current.length > 0,
    save,
    saveAs,
    rename,
    remove,
    setStartingView,
    publish,
    unpublish,
    switchTo,
    switchToDefault,
    reset: discardChanges,
    undo,
    undoAll,
  };
  // Built from the finished object so the picker sees every field, including itself's
  // siblings — assigned after construction rather than threading a dozen props by hand.
  result.picker = createElement(ViewPicker, { ui, views: result });
  return result;
}
