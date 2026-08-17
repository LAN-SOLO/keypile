// Entry templates: which built-in fields a category shows and which custom
// fields it pre-creates. Field names come from the i18n dict (templateFields).

export const CATEGORIES = [
  'login',
  'card',
  'identity',
  'note',
  'password',
  'finance',
  'license',
  'travel',
  'computer',
  'misc',
] as const;

export type Category = (typeof CATEGORIES)[number];

export interface Template {
  username: boolean;
  password: boolean;
  urls: boolean;
  totp: boolean;
  /** keys into t.templateFields; '*'-prefix = protected (masked) field */
  fields: string[];
}

export const TEMPLATES: Record<Category, Template> = {
  login: { username: true, password: true, urls: true, totp: true, fields: [] },
  card: {
    username: false,
    password: false,
    urls: false,
    totp: false,
    fields: ['cardholder', '*cardnumber', 'expiry', '*cvv', '*pin'],
  },
  identity: {
    username: false,
    password: false,
    urls: false,
    totp: false,
    fields: ['firstname', 'lastname', 'birthdate', 'address', 'phone', 'email'],
  },
  note: { username: false, password: false, urls: false, totp: false, fields: [] },
  password: { username: false, password: true, urls: false, totp: false, fields: [] },
  finance: {
    username: false,
    password: false,
    urls: false,
    totp: false,
    fields: ['bank', 'iban', 'bic', '*accountnumber'],
  },
  license: {
    username: false,
    password: false,
    urls: true,
    totp: false,
    fields: ['*licensekey', 'version', 'registeredto', 'email'],
  },
  travel: {
    username: false,
    password: false,
    urls: false,
    totp: false,
    fields: ['*passportnumber', 'issued', 'expiry', 'country'],
  },
  computer: {
    username: true,
    password: true,
    urls: false,
    totp: false,
    fields: ['host', 'port'],
  },
  misc: { username: true, password: true, urls: true, totp: true, fields: [] },
};

export function normalizeCategory(cat: string | null | undefined): Category {
  return (CATEGORIES as readonly string[]).includes(cat ?? '') ? (cat as Category) : 'misc';
}
