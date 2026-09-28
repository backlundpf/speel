// A recording double for the three principal endpoints, list writes, and list reads.
// Every invoked queryable pushes what it was asked onto `queries`. `filter` and
// `orderBy` are recorded, not applied — semantics are the live conformance run's job,
// this pins the wire. `top` and `skip` ARE applied, so paging can be asserted on — except
// in the UIL and list iterators, which page by `top` alone and ignore `skip` (it is
// still recorded). List rows are returned as given: the double is SharePoint's JSON,
// so a typed-read test seeds wire shapes (ISO strings, 0/1) and asserts what the
// provider makes of them.
export interface IRecordedQuery {
  path: "siteUserInfoList" | "siteUsers" | "siteGroups" | "list";
  /** The list title, when `path` is "list". */
  list?: string;
  id?: number;
  select?: string[];
  expand?: string[];
  filter?: string;
  top?: number;
  skip?: number;
  orderBy?: [string, boolean][];
  envelope?: boolean;
}

export interface IFakePrincipalData {
  uil: Record<string, unknown>[];
  siteUsers: Record<string, unknown>[];
  siteGroups: Record<string, unknown>[];
  /** Canned rows per list title, served by the list read surface. */
  lists?: Record<string, Record<string, unknown>[]>;
  /** What `getListItemChangesSinceToken` answers; defaults to a feed with one token. */
  changesXml?: string;
}

/** One list/library write the double received, in the shape the provider sent it. */
export interface IRecordedWrite {
  list: string;
  kind:
    | "add"
    | "update"
    | "addValidateUpdateItemUsingPath"
    | "validateUpdateListItem"
    | "addUsingPath";
  id?: number;
  etag?: string;
  payload?: Record<string, unknown>;
  formValues?: { FieldName: string; FieldValue: string }[];
  folder?: string;
}

export function fakePrincipalSp(data: IFakePrincipalData) {
  const queries: IRecordedQuery[] = [];
  const writes: IRecordedWrite[] = [];
  const makeCollection = (
    path: IRecordedQuery["path"],
    rows: Record<string, unknown>[],
  ) => {
    const build = (state: IRecordedQuery): any => {
      const q: any = () => {
        queries.push(state);
        if (state.id !== undefined) {
          const row = rows.find((r) => r.Id === state.id);
          return row
            ? Promise.resolve({ ...row })
            : Promise.reject({ status: 404 });
        }
        let out = rows.slice();
        if (state.skip) out = out.slice(state.skip);
        if (state.top !== undefined) out = out.slice(0, state.top);
        const copies = out.map((r) => ({ ...r }));
        return Promise.resolve(state.envelope ? { value: copies } : copies);
      };
      q.select = (...f: string[]) => build({ ...state, select: f });
      q.filter = (f: string) => build({ ...state, filter: f });
      q.top = (n: number) => build({ ...state, top: n });
      q.skip = (n: number) => build({ ...state, skip: n });
      q.orderBy = (c: string, asc = true) =>
        build({ ...state, orderBy: [...(state.orderBy ?? []), [c, asc]] });
      q.using = () => build({ ...state, envelope: true });
      q.getById = (id: number) => build({ ...state, id });
      if (path === "siteUserInfoList") {
        q[Symbol.asyncIterator] = async function* () {
          const top = state.top ?? rows.length;
          for (let i = 0; i < rows.length; i += top) {
            queries.push({ ...state, skip: i });
            yield rows.slice(i, i + top).map((r) => ({ ...r }));
          }
        };
      }
      return q;
    };
    return build({ path });
  };
  // A list's items: the same recording builder as the principal collections, plus
  // `expand`, the JSONParse `{ value }` envelope, an iterator that pages by `top`
  // (lists carry a continuation link, like the UIL), and the two write entry points.
  const makeListItems = (title: string, rows: Record<string, unknown>[]) => {
    const build = (state: IRecordedQuery): any => {
      const q: any = () => {
        queries.push(state);
        if (state.id !== undefined) {
          const row = rows.find((r) => r.Id === state.id);
          return row
            ? Promise.resolve({ ...row })
            : Promise.reject({ status: 404 });
        }
        let out = rows.slice();
        if (state.skip) out = out.slice(state.skip);
        if (state.top !== undefined) out = out.slice(0, state.top);
        const copies = out.map((r) => ({ ...r }));
        return Promise.resolve(state.envelope ? { value: copies } : copies);
      };
      q.select = (...f: string[]) => build({ ...state, select: f });
      q.expand = (...e: string[]) => build({ ...state, expand: e });
      q.filter = (f: string) => build({ ...state, filter: f });
      q.top = (n: number) => build({ ...state, top: n });
      q.skip = (n: number) => build({ ...state, skip: n });
      q.orderBy = (c: string, asc = true) =>
        build({ ...state, orderBy: [...(state.orderBy ?? []), [c, asc]] });
      q.using = () => build({ ...state, envelope: true });
      q.getById = (id: number) => build({ ...state, id });
      q[Symbol.asyncIterator] = async function* () {
        const top = state.top ?? rows.length;
        for (let i = 0; i < rows.length; i += top) {
          queries.push({ ...state, skip: i });
          yield rows.slice(i, i + top).map((r) => ({ ...r }));
        }
      };
      q.add = (payload: Record<string, unknown>) => {
        writes.push({ list: title, kind: "add", payload });
        return Promise.resolve({ data: { Id: 100 + writes.length } });
      };
      q.update = (payload: Record<string, unknown>, etag: string) => {
        writes.push({
          list: title,
          kind: "update",
          id: state.id,
          etag,
          payload,
        });
        return Promise.resolve({});
      };
      return q;
    };
    return build({ path: "list", list: title });
  };
  const makeWeb = () => ({
    siteUserInfoList: { items: makeCollection("siteUserInfoList", data.uil) },
    siteUsers: makeCollection("siteUsers", data.siteUsers),
    siteGroups: makeCollection("siteGroups", data.siteGroups),
    lists: {
      getByTitle: (title: string) => ({
        items: makeListItems(title, data.lists?.[title] ?? []),
        getListItemChangesSinceToken: () =>
          Promise.resolve(
            data.changesXml ??
              `<listitems><Changes LastChangeToken="1;3;g;638400000000000000;9"></Changes></listitems>`,
          ),
        addValidateUpdateItemUsingPath: (
          formValues: { FieldName: string; FieldValue: string }[],
          folder: string,
        ) => {
          writes.push({
            list: title,
            kind: "addValidateUpdateItemUsingPath",
            formValues,
            folder,
          });
          return Promise.resolve([
            {
              FieldName: "Id",
              FieldValue: String(100 + writes.length),
              HasException: false,
            },
          ]);
        },
      }),
    },
    getFolderByServerRelativePath: (url: string) => ({
      files: {
        addUsingPath: (name: string) => {
          writes.push({ list: url, kind: "addUsingPath" });
          return Promise.resolve({
            Name: name,
            ServerRelativeUrl: `${url}/${name}`,
          });
        },
      },
    }),
    getFileByServerRelativePath: (url: string) => ({
      getItem: () =>
        Promise.resolve({
          Id: 7,
          validateUpdateListItem: (
            formValues: { FieldName: string; FieldValue: string }[],
          ) => {
            writes.push({
              list: url,
              kind: "validateUpdateListItem",
              formValues,
            });
            return Promise.resolve([]);
          },
        }),
    }),
  });
  const sp: any = { web: makeWeb() };
  sp.batched = () => [{ web: makeWeb() }, async () => {}];
  return { sp, queries, writes };
}

export const UIL_ADA = {
  Id: 6,
  Title: "Ada",
  Name: "i:0#.f|membership|ada@x",
  EMail: "ada@x",
  ContentTypeId: "0x010A00AB",
};
export const UIL_GROUP = {
  Id: 12,
  Title: "Audit Members",
  Name: "Audit Members",
  ContentTypeId: "0x010B00",
};
export const SU_ADA = {
  Id: 6,
  Title: "Ada",
  LoginName: "i:0#.f|membership|ada@x",
  Email: "ada@x",
  PrincipalType: 1,
};
export const SU_EVERYONE = {
  Id: 15,
  Title: "Everyone",
  LoginName: "c:0-.f|rolemanager|x",
  PrincipalType: 4,
};
export const SG_AUDIT = {
  Id: 12,
  Title: "Audit Members",
  LoginName: "Audit Members",
  Description: "d",
  OwnerTitle: "Ada",
};
