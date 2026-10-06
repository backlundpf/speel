export { DbContext } from "./DbContext.js";
export { initSpeelDbContext } from "./initSpeelDbContext.js";
export { DbContextOptionsBuilder } from "./DbContextOptionsBuilder.js";
export { DbSet } from "./DbSet.js";
export type { IAddOptions } from "./DbSet.js";
export type {
  SerializedEntity,
  NavigationMode,
  ISerializeOptions,
} from "./Entities/SerializedEntity.js";
export type { IFileContent, IStagedFile } from "./Save/fileUpload.js";
export type {
  IFileUploadProgress,
  IFileUploadRequest,
  IFileUploadResult,
  IRenameResult,
} from "./providers/ISharePointProvider.js";
export { ModelBuilder } from "./ModelBuilder/ModelBuilder.js";
export {
  EntityTypeBuilder,
  Entity,
  JsonShape,
  Key,
} from "./ModelBuilder/EntityTypeBuilder.js";
export { PropertyBuilder } from "./ModelBuilder/PropertyBuilder.js";
export { ChangeTracker } from "./ChangeTracker/ChangeTracker.js";
export type { NavLoader } from "./ChangeTracker/ChangeTracker.js";
export { EntityEntry, EntityState } from "./ChangeTracker/EntityEntry.js";
export {
  ReferenceEntry,
  CollectionEntry,
  type ILoadOptions,
} from "./ChangeTracker/NavigationEntry.js";
export type { ISaveChangesOptions } from "./Save/SaveExecutor.js";

export type {
  IEntity,
  EntityCtor,
  IListHandle,
  IDbContextOptions,
} from "./types.js";
export type {
  IStorageProvider,
  IFileSystem,
  IChangeFeed,
  ISharePointProvider,
  IBatchOperation,
  IBatchOperationResult,
  IReadOperation,
  IReadOperationResult,
  ISourceHandle,
  IProviderSource,
  IWriteField,
} from "./providers/ISharePointProvider.js";
export { hasFileSystem, hasChangeFeed } from "./providers/capabilities.js";

// Query API
export { Query } from "./Query/Query.js";
export type { IQuery, NavTarget } from "./Query/IQuery.js";
export type {
  FilterBuilder,
  PropertyFilterType,
} from "./Query/FilterBuilder.js";
export { PropertyFilter } from "./Query/FilterBuilder.js";
export {
  type FilterNode,
  type ComparisonOp,
  and,
  or,
  not,
} from "./Query/FilterNode.js";
export {
  extractContainerOptions,
  containsContainerScope,
} from "./Query/containerScope.js";
export type { IContainerOptions } from "./Query/containerScope.js";

// Provider seam new types
export type {
  IGetItemsOptions,
  IOrderKey,
} from "./providers/ISharePointProvider.js";

// Field builders (so callers can name them in types)
export {
  TextFieldBuilder,
  TextField,
  NoteField,
} from "./ModelBuilder/fieldTypes/TextFieldBuilder.js";
export {
  NumberFieldBuilder,
  NumberField,
} from "./ModelBuilder/fieldTypes/NumberFieldBuilder.js";
export {
  CurrencyFieldBuilder,
  CurrencyField,
} from "./ModelBuilder/fieldTypes/CurrencyFieldBuilder.js";
export {
  BooleanFieldBuilder,
  BooleanField,
} from "./ModelBuilder/fieldTypes/BooleanFieldBuilder.js";
export {
  DateTimeFieldBuilder,
  DateTimeField,
} from "./ModelBuilder/fieldTypes/DateTimeFieldBuilder.js";
export {
  ChoiceFieldBuilder,
  ChoiceField,
  MultiChoiceField,
} from "./ModelBuilder/fieldTypes/ChoiceFieldBuilder.js";
export {
  JsonFieldBuilder,
  JsonField,
  MultiJsonField,
} from "./ModelBuilder/fieldTypes/JsonFieldBuilder.js";
export type { JsonFieldOptions } from "./ModelBuilder/fieldTypes/FieldOptions.js";
export {
  patchShapeInstance,
  shapeValueErrors,
} from "./ModelBuilder/fieldTypes/shapeCodec.js";
export { FieldBuilderBase } from "./ModelBuilder/fieldTypes/FieldBuilderBase.js";
export { FieldRefinementBuilder } from "./ModelBuilder/fieldTypes/FieldRefinementBuilder.js";
export type { FieldConfig, SpFieldType } from "./Metadata/FieldConfig.js";
export type {
  OptionsLoader,
  OptionsQueryArgs,
  ChoiceOptionsLoader,
  OptionsThunk,
  OptionsCreator,
  OptionsCreatorHost,
} from "./Metadata/optionsLoader.js";
export {
  OPTIONS_QUERY_TAKE,
  searchesDisplayField,
  createsByDisplayField,
  findByDisplayField,
} from "./Metadata/optionsLoader.js";
export type { SelectionOptions } from "./Metadata/FieldConfig.js";
export { declaredOptions } from "./Metadata/selectionOptions.js";
export type {
  TableFilterConfig,
  DatePreset,
} from "./Metadata/TableFilterConfig.js";
export type {
  EntityType,
  ListTemplate,
  IListProvisioning,
  EntitySource,
} from "./Metadata/EntityType.js";
export type { Property, IValueCodec } from "./Metadata/Property.js";
export type { Model } from "./Metadata/Model.js";
export { codecFor } from "./Metadata/valueCodec.js";

export {
  DbUpdateException,
  DbUpdateConcurrencyException,
  SaveAbortedException,
  ModelConfigurationException,
  DataException,
  InvalidOperationException,
  QueryTranslationException,
} from "./errors.js";

// Navigation slice
export { SpeelEntity } from "./SpeelEntity.js";
export { SpeelDocument } from "./SpeelDocument.js";
export { Principal } from "./Principal.js";
export { SiteUser } from "./SiteUser.js";
export { SiteGroup } from "./SiteGroup.js";
export { SharedTableView, SHARED_VIEWS_LIST } from "./SharedTableView.js";
export type {
  INavigation,
  NavigationKind,
  NavigationStorage,
} from "./Metadata/Navigation.js";
export { ReferenceNavigationBuilder } from "./ModelBuilder/navigations/ReferenceNavigationBuilder.js";
export { CollectionNavigationBuilder } from "./ModelBuilder/navigations/CollectionNavigationBuilder.js";
export {
  ManyToOne,
  OneToOne,
  OneToMany,
  ManyToMany,
} from "./ModelBuilder/navigations/relationshipDecorators.js";
export type {
  NavOptions,
  OneToManyOptions,
} from "./ModelBuilder/navigations/NavOptions.js";
export { IncludableQuery } from "./Query/Query.js";
export type { IIncludeNode, IExpandSpec } from "./Query/IncludeNode.js";
export type { SpecialExpand } from "./Query/SpecialExpand.js";
export type { IExpandClause } from "./providers/ISharePointProvider.js";
export { NavigationConfigurationException } from "./errors.js";

// Caching
export { InMemoryCacheProvider } from "./Cache/InMemoryCacheProvider.js";
export { IndexedDbCacheProvider } from "./Cache/IndexedDbCacheProvider.js";
export type { IIndexedDbCacheOptions } from "./Cache/IndexedDbCacheProvider.js";
export type {
  ICacheProvider,
  ICachedListState,
  ICacheEntry,
} from "./Cache/ICacheProvider.js";
export { CacheCoordinator } from "./Cache/CacheCoordinator.js";
export { CacheConfigBuilder } from "./ModelBuilder/CacheConfigBuilder.js";
export type {
  ICacheConfig,
  ICacheExpandSpec,
} from "./ModelBuilder/CacheConfigBuilder.js";
export { listKey, sourceKey } from "./Cache/listKey.js";
export { tokenToIso } from "./Cache/changeToken.js";

// Presentation layer
export type {
  FormMode,
  FieldStateFn,
  FieldContext,
  OptionContext,
} from "./types.js";
export type { ValidationRule, FieldRenderFn } from "./Metadata/Validation.js";
export {
  isEmpty,
  requiredRule,
  minLengthRule,
  maxLengthRule,
  minRule,
  maxRule,
  dateMinRule,
  dateMaxRule,
  choiceMembershipRule,
} from "./Metadata/Validation.js";
export type { IFieldState } from "./Metadata/IFieldState.js";
export {
  buildValidations,
  refinementRulesFor,
} from "./Metadata/buildValidations.js";
export type { ValidatableField } from "./Metadata/buildValidations.js";
export { resolveState, collectErrors } from "./Forms/resolve.js";
