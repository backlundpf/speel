import type { SpeelUIAdapter } from "../adapter/SpeelUIAdapter.js";
import {
  V8TextInput,
  V8NumberInput,
  V8Dropdown,
  V8RadioGroup,
  V8Checkbox,
  V8DatePicker,
  V8PeoplePicker,
  V8Combobox,
  V8FileInput,
  V8Spinner,
  V8FieldDisplay,
  V8Button,
  V8IconButton,
  V8MessageBar,
  V8Dialog,
  V8Panel,
  V8Popover,
  V8Table,
  V8SearchBox,
  V8Menu,
  V8ProgressBar,
} from "./primitives.js";
import { V8RichTextInput } from "./richText.js";

/**
 * Fluent UI v8 implementation of SpeelUIAdapter, shipped at `@speel/react/fluent-v8`.
 * Provider-free: v8 controls render against the ambient Fabric theme the host injects.
 */
export const fluentV8Adapter: SpeelUIAdapter = {
  TextInput: V8TextInput,
  RichTextInput: V8RichTextInput,
  NumberInput: V8NumberInput,
  Dropdown: V8Dropdown,
  RadioGroup: V8RadioGroup,
  Checkbox: V8Checkbox,
  DatePicker: V8DatePicker,
  PeoplePicker: V8PeoplePicker,
  Combobox: V8Combobox,
  FileInput: V8FileInput,
  Spinner: V8Spinner,
  Button: V8Button,
  IconButton: V8IconButton,
  MessageBar: V8MessageBar,
  ProgressBar: V8ProgressBar,
  Dialog: V8Dialog,
  Drawer: V8Panel,
  Popover: V8Popover,
  Table: V8Table,
  SearchBox: V8SearchBox,
  Menu: V8Menu,
  FieldDisplay: V8FieldDisplay,
};
