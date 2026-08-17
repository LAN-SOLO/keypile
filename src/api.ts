import { invoke } from '@tauri-apps/api/core';

// ---- types mirrored from the Rust side ----

export interface Settings {
  language: 'de' | 'en';
  auto_lock_minutes: number;
  clipboard_clear_seconds: number;
  lock_on_blur: boolean;
  recent_vaults: string[];
  device_id: string;
}

export interface Status {
  locked: boolean;
  path: string | null;
  name: string | null;
  entry_count: number;
  trash_count: number;
  uses_keyfile: boolean;
}

export interface EntrySummary {
  id: string;
  title: string;
  username: string;
  url: string | null;
  favorite: boolean;
  folder: string | null;
  tags: string[];
  has_totp: boolean;
  deleted: boolean;
  modified: string;
}

export interface CustomField {
  name: string;
  value: string;
  protected: boolean;
}

export interface Entry {
  id: string;
  folder: string | null;
  title: string;
  username: string;
  password: string;
  urls: string[];
  notes: string;
  tags: string[];
  totp: string | null;
  custom_fields: CustomField[];
  favorite: boolean;
  created: string;
  modified: string;
  password_changed: string | null;
  history: { password: string; replaced: string }[];
  deleted: boolean;
}

export interface EntryInput {
  id: string | null;
  folder: string | null;
  title: string;
  username: string;
  password: string;
  urls: string[];
  notes: string;
  tags: string[];
  totp: string | null;
  custom_fields: CustomField[];
  favorite: boolean;
}

export interface Folder {
  id: string;
  name: string;
  parent: string | null;
  deleted: boolean;
}

export interface Strength {
  score: number;
  guesses_log10: number;
  warning: string | null;
  suggestions: string[];
}

export interface PasswordOptions {
  length: number;
  lower: boolean;
  upper: boolean;
  digits: boolean;
  symbols: boolean;
  avoid_ambiguous: boolean;
}

export interface PassphraseOptions {
  words: number;
  separator: string;
  capitalize: boolean;
  include_digit: boolean;
}

export interface TotpCode {
  code: string;
  remaining: number;
  period: number;
}

export interface Health {
  weak: { id: string; score: number }[];
  reused: string[][];
  old: string[];
  no_totp_candidates: number;
}

export interface PwnedHit {
  id: string;
  count: number;
}

export interface ImportResult {
  added: number;
  folders: number;
  skipped: number;
}

// ---- command wrappers ----

export const api = {
  getSettings: () => invoke<Settings>('get_settings'),
  setSettings: (newSettings: Settings) => invoke<void>('set_settings', { newSettings }),
  createVault: (path: string, name: string, password: string, keyfilePath: string | null) =>
    invoke<Status>('create_vault', { path, name, password, keyfilePath }),
  openVault: (path: string, password: string, keyfilePath: string | null) =>
    invoke<Status>('open_vault', { path, password, keyfilePath }),
  lockVault: () => invoke<void>('lock_vault'),
  vaultStatus: () => invoke<Status>('vault_status'),
  listEntries: () => invoke<EntrySummary[]>('list_entries'),
  getEntry: (id: string) => invoke<Entry>('get_entry', { id }),
  saveEntry: (input: EntryInput) => invoke<Entry>('save_entry', { input }),
  deleteEntry: (id: string) => invoke<void>('delete_entry', { id }),
  restoreEntry: (id: string) => invoke<void>('restore_entry', { id }),
  purgeEntry: (id: string) => invoke<void>('purge_entry', { id }),
  emptyTrash: () => invoke<void>('empty_trash'),
  listFolders: () => invoke<Folder[]>('list_folders'),
  saveFolder: (id: string | null, name: string) => invoke<Folder>('save_folder', { id, name }),
  deleteFolder: (id: string) => invoke<void>('delete_folder', { id }),
  generatePassword: (options: PasswordOptions) => invoke<string>('generate_password', { options }),
  generatePassphrase: (options: PassphraseOptions) =>
    invoke<string>('generate_passphrase', { options }),
  passwordStrength: (password: string, context: string[]) =>
    invoke<Strength>('password_strength', { password, context }),
  totpCode: (id: string) => invoke<TotpCode>('totp_code', { id }),
  copySecret: (text: string) => invoke<void>('copy_secret', { text }),
  copyEntryField: (id: string, field: 'username' | 'password' | 'totp') =>
    invoke<void>('copy_entry_field', { id, field }),
  healthReport: () => invoke<Health>('health_report'),
  checkPwned: () => invoke<PwnedHit[]>('check_pwned'),
  importFile: (path: string) => invoke<ImportResult>('import_file', { path }),
  exportCsv: (path: string) => invoke<number>('export_csv_file', { path }),
  changeMasterPassword: (
    currentPassword: string,
    newPassword: string,
    currentKeyfilePath: string | null,
    newKeyfilePath: string | null
  ) =>
    invoke<void>('change_master_password', {
      currentPassword,
      newPassword,
      currentKeyfilePath,
      newKeyfilePath,
    }),
};
