export interface IIncludeNode {
  readonly navName: string;
  readonly children: IIncludeNode[]; // not readonly: thenInclude appends
}

export interface IExpandSpec {
  readonly navName: string;
  readonly fields: readonly string[]; // child fields → `${navName}/${field}` (may be empty)
  readonly expandPaths?: readonly string[]; // extra nested $expand segments
  readonly selectPaths?: readonly string[]; // extra full $select paths
  /**
   * Present on specs produced by a registered SpecialExpand: materializes the clause's
   * payload from the raw record instead of the navigation machinery. Receives the whole
   * record, so a handler can read top-level selectPaths fields alongside its nav payload.
   */
  readonly materialize?: (
    target: Record<string, unknown>,
    record: Record<string, unknown>,
  ) => void;
}
