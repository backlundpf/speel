import { forwardRef, useImperativeHandle, useRef, type Ref } from "react";
import type { DbSet, IEntity, IQuery } from "@speel/core";
import { useSpeelContext, useSpeelUI } from "../context.js";
import {
  SpeelTable,
  type SpeelTableProps,
  type SpeelTableHandle,
} from "./SpeelTable.js";
import { useTableData } from "./useTableData.js";

export type SpeelEntityTableHandle = {
  reload: () => Promise<void>;
  exportCsv: () => void;
  print: () => void;
};

export interface SpeelEntityTableProps<
  T extends IEntity = IEntity,
> extends Omit<SpeelTableProps<T>, "items"> {
  query?: (set: DbSet<T>) => IQuery<T>;
  loadingMessage?: string;
}

function SpeelEntityTableInner<T extends IEntity>(
  props: SpeelEntityTableProps<T>,
  ref: Ref<SpeelEntityTableHandle>,
): JSX.Element {
  const { query, loadingMessage, ...rest } = props;
  const db = useSpeelContext();
  const ui = useSpeelUI();
  const { rows, loading, error, reload } = useTableData<T>(db, props.of, query);
  const tableRef = useRef<SpeelTableHandle>(null);
  useImperativeHandle(
    ref,
    () => ({
      reload,
      exportCsv: () => tableRef.current?.exportCsv(),
      print: () => tableRef.current?.print(),
    }),
    [reload],
  );

  // The table stays mounted (hidden) while the spinner/error shows, so user sort/filter
  // state survives reload(); unmounting it would reset that state on every re-fetch.
  return (
    <>
      {error ? (
        <ui.MessageBar intent="error">{error}</ui.MessageBar>
      ) : loading ? (
        <ui.Spinner
          {...(loadingMessage !== undefined ? { label: loadingMessage } : {})}
        />
      ) : null}
      <div style={error || loading ? { display: "none" } : undefined}>
        <SpeelTable<T> {...rest} items={rows} ref={tableRef} />
      </div>
    </>
  );
}

export const SpeelEntityTable = forwardRef(
  SpeelEntityTableInner,
) as unknown as <T extends IEntity>(
  props: SpeelEntityTableProps<T> & { ref?: Ref<SpeelEntityTableHandle> },
) => JSX.Element;
