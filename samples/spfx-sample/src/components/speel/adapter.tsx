import type { SpeelUIAdapter } from "@speel/react";

import {
  ShadButton,
  ShadCheckbox,
  ShadCombobox,
  ShadDatePicker,
  ShadDropdown,
  ShadFieldDisplay,
  ShadFileInput,
  ShadIconButton,
  ShadLink,
  ShadMessageBar,
  ShadNumberInput,
  ShadProgressBar,
  ShadRadioGroup,
  ShadSearchBox,
  ShadSpinner,
  ShadTextInput,
} from "./fields";
import { ShadDialog, ShadDrawer, ShadPopover, ShadMenu } from "./overlays";
import { ShadPeoplePicker } from "./people-picker";
import { ShadRichTextInput } from "./rich-text";
import { ShadTable } from "./table";

/**
 * shadcn/ui implementation of SpeelUIAdapter. Copy-in source: you own these
 * files — restyle or swap any primitive freely. Pass to SpeelProvider:
 *   <SpeelProvider db={db} ui={shadcnAdapter}>…</SpeelProvider>
 */
export const shadcnAdapter: SpeelUIAdapter = {
  TextInput: ShadTextInput,
  RichTextInput: ShadRichTextInput,
  NumberInput: ShadNumberInput,
  Dropdown: ShadDropdown,
  RadioGroup: ShadRadioGroup,
  Checkbox: ShadCheckbox,
  DatePicker: ShadDatePicker,
  PeoplePicker: ShadPeoplePicker,
  Combobox: ShadCombobox,
  FileInput: ShadFileInput,
  Spinner: ShadSpinner,
  Button: ShadButton,
  IconButton: ShadIconButton,
  Link: ShadLink,
  MessageBar: ShadMessageBar,
  ProgressBar: ShadProgressBar,
  Dialog: ShadDialog,
  Drawer: ShadDrawer,
  Popover: ShadPopover,
  Table: ShadTable,
  SearchBox: ShadSearchBox,
  Menu: ShadMenu,
  FieldDisplay: ShadFieldDisplay,
};
