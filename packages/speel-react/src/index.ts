// Provider + context
export { SpeelProvider } from "./SpeelProvider.js";
export type {
  SpeelProviderProps,
  SpeelConfiguration,
} from "./SpeelProvider.js";
export { SpeelUIProvider } from "./SpeelUIProvider.js";
export type { SpeelUIProviderProps } from "./SpeelUIProvider.js";
export {
  useSpeelContext,
  useSpeelUI,
  usePeopleSearch,
  useSpeelConfig,
} from "./context.js";
export type { PeopleSearch, ResolvedSpeelConfig } from "./context.js";

// UI-adapter contract (a skin implements this; the Fluent v8 skin is @speel/react/fluent-v8)
export type {
  SpeelUIAdapter,
  ColumnAlign,
  FieldChrome,
  TextInputProps,
  RichTextInputProps,
  NumberInputProps,
  DropdownProps,
  RadioGroupProps,
  RadioGroupOther,
  CheckboxProps,
  DatePickerProps,
  PeoplePickerProps,
  ComboboxProps,
  ComboboxCreate,
  SpinnerProps,
  ProgressBarProps,
  ButtonProps,
  IconButtonProps,
  MessageBarProps,
  DialogProps,
  DrawerProps,
  PopoverProps,
  TableColumn,
  TableLength,
  TableProps,
  TableSort,
  RowIntent,
  SearchBoxProps,
  MenuProps,
  MenuSection,
  MenuItem,
  OptionItem,
  PersonaItem,
  FieldDisplayProps,
  FileInputProps,
} from "./adapter/SpeelUIAdapter.js";

// Form controller + reactive field handle
export {
  useEntityForm,
  EntityFormProvider,
  useEntityFormContext,
} from "./form/useEntityForm.js";
export type { EntityForm, EntityFormOptions } from "./form/useEntityForm.js";
export { SpeelForm } from "./form/SpeelForm.js";
export type { SpeelFormProps, SpeelFormAction } from "./form/SpeelForm.js";
export { SpeelDocumentForm } from "./form/SpeelDocumentForm.js";
export type { SpeelDocumentFormProps } from "./form/SpeelDocumentForm.js";

// Actions — the one `actions` shape (forms, surfaces, MessageBar)
export { SpeelActionBar, isActionArray } from "./actions.js";
export type {
  SpeelAction,
  SpeelActions,
  SpeelActionAppearance,
} from "./actions.js";

// Surfaces (modal / panel) — require the Fluent v8 skin (Dialog/Drawer primitives)
export { SpeelModal } from "./surface/SpeelModal.js";
export type { SpeelModalProps } from "./surface/SpeelModal.js";
export { SpeelPanel } from "./surface/SpeelPanel.js";
export type { SpeelPanelProps } from "./surface/SpeelPanel.js";
export type {
  SurfaceChromeProps,
  PanelChromeProps,
  ModalChromeProps,
  SurfaceFormVariantProps,
  SurfaceContentVariantProps,
} from "./surface/surfaceProps.js";
export { useDisclosure } from "./surface/useDisclosure.js";
export type { Disclosure } from "./surface/useDisclosure.js";

// Imperative surfaces (awaitable showForm) + overlays
export { useSurfaces, useOverlays } from "./surface/useSurfaces.js";
export type {
  SurfaceApi,
  SurfaceResult,
  FormRequest,
  DocumentFormRequest,
  SurfaceKind,
} from "./surface/SurfaceManager.js";
export {
  useDocumentFormParts,
  DocumentFileBlock,
} from "./form/documentFormParts.js";
export type { DocumentFormParts } from "./form/documentFormParts.js";
export type { FormSection } from "./form/EntityFormBody.js";

// Data table
export { SpeelTable } from "./table/SpeelTable.js";
export type {
  SpeelTableProps,
  RowAction,
  SpeelTableHandle,
} from "./table/SpeelTable.js";
export { SpeelEntityTable } from "./table/SpeelEntityTable.js";
export type {
  SpeelEntityTableProps,
  SpeelEntityTableHandle,
} from "./table/SpeelEntityTable.js";
export type {
  ColumnSpec,
  ColumnDescriptor,
  ColumnOptions,
  ColumnRef,
  ColumnRefs,
  ResolvedColumn,
} from "./table/columns.js";
export type { TableFilterConfig, DatePreset } from "@speel/core";
export type { FilterCriteria } from "./table/filter/match.js";
export type { FilterState } from "./table/filter/FilterBar.js";
export type {
  ColumnState,
  ColumnStateEntry,
  ArrangedColumn,
} from "./table/columnState.js";
export type { TableState, FilterOrigin } from "./table/useTableState.js";

// Table views — named per-user views over the URL / scope / view state layers
export { useTableViews } from "./table/views/useTableViews.js";
export type {
  TableViews,
  TableViewsOptions,
} from "./table/views/useTableViews.js";
export { createLocalViewStore } from "./table/views/viewStore.js";
export { createSettingsViewStore } from "./table/views/settingsViewStore.js";
export { createEntitySharedViewStore } from "./table/views/sharedViewStore.js";
export type {
  SharedTableViewStore,
  EntitySharedViewStoreOptions,
} from "./table/views/sharedViewStore.js";
export type {
  TableViewStore,
  StoredView,
  AppDefaultView,
  TableViewDescriptor,
} from "./table/views/viewStore.js";

// Toasts
export { ToastProvider } from "./toast/ToastProvider.js";
export { useToast } from "./toast/useToast.js";
export type {
  ToastOptions,
  ToastApi,
  ToastIntent,
  ToastPosition,
  ToastSize,
} from "./toast/ToastProvider.js";
export { ActiveTasksProvider } from "./tasks/ActiveTasksProvider.js";
export { useActiveTasks } from "./tasks/useActiveTasks.js";
export type {
  TaskOptions,
  TaskHandle,
  ActiveTasksApi,
  TaskStatus,
} from "./tasks/ActiveTasksProvider.js";
export { useField } from "./form/useField.js";
export { useStandaloneField } from "./form/useStandaloneField.js";
export type { StandaloneFieldOptions } from "./form/useStandaloneField.js";
export type { FieldHandle, OptionsSource } from "./form/FieldHandle.js";

// Framework-neutral building blocks (extractable for other framework bindings)
export {
  projectEntityToValues,
  applyValuesToEntity,
} from "./form/projection.js";
export { buildFormErrors } from "./form/validators.js";
export type { FormErrors } from "./form/validators.js";

// Field components
export { SpeelField } from "./fields/SpeelField.js";
export type { SpeelFieldProps } from "./fields/SpeelField.js";
export { EntityFields } from "./fields/EntityFields.js";
export type { EntityFieldsProps } from "./fields/EntityFields.js";
export {
  SpeelTextField,
  SpeelNumberField,
  SpeelCurrencyField,
  SpeelBooleanField,
  SpeelDateTimeField,
  SpeelChoiceField,
  SpeelLookupField,
  SpeelUserField,
} from "./fields/named.js";
export { formatFieldValue } from "./fields/format.js";
export { createsByForm } from "./fields/createsByForm.js";

// User settings — the personal sibling of URL state: what follows the user, not the link
export {
  useUserSetting,
  useUserSettingsStatus,
  UserSettingsProvider,
} from "./settings/useUserSetting.js";
export {
  useIdentity,
  useCurrentUser,
  useAuthorized,
  usePermission,
} from "./identity/useIdentity.js";

// URL state — the query string as the source of truth for shareable surface state
export { useUrlState } from "./url/useUrlState.js";
export type { UrlValues } from "./url/useUrlState.js";
export { urlString, urlBoolean, urlNumber } from "./url/codecs.js";
export type {
  UrlCodec,
  UrlCodecOptions,
  UrlHistoryMode,
} from "./url/codecs.js";

// Skin-support hooks — drag/resize behaviors shared by Dialog/Drawer skin implementations
export { useDragResize } from "./surface/useDragResize.js";
export type {
  CornerResizeHandleProps,
  DragResizeOptions,
  DragResizeState,
} from "./surface/useDragResize.js";
export { useResizable } from "./surface/useResizable.js";
export type {
  ResizableOptions,
  ResizeState,
  ResizeHandleProps,
} from "./surface/useResizable.js";
export { setOverflowTitle } from "./table/overflowTitle.js";
export { resolveColumnWidths } from "./table/layout/resolveColumnWidths.js";
export type {
  FlexColumn,
  TableBounds,
  ColumnLayout,
} from "./table/layout/resolveColumnWidths.js";
export { headerFloor, textMeasurer } from "./table/layout/headerFloor.js";
export type { HeaderRoom } from "./table/layout/headerFloor.js";
export { MIN_RESIZE_WIDTH, toFlexColumn } from "./table/layout/columnFlex.js";
export { useContainerWidth } from "./table/layout/useContainerWidth.js";
