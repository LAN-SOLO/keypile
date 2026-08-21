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
  /**
   * keys into t.templateFields; '*'-prefix = protected (masked) field,
   * ':<type>'-suffix = field type (default 'text')
   */
  fields: string[];
}

/** Parse a template field spec ('*cvv:pin') into its parts. */
export function parseTemplateField(spec: string): {
  key: string;
  protected: boolean;
  fieldType: string;
} {
  const isProtected = spec.startsWith('*');
  const rest = isProtected ? spec.slice(1) : spec;
  const [key, fieldType] = rest.split(':');
  return { key, protected: isProtected, fieldType: fieldType ?? 'text' };
}

export const TEMPLATES: Record<Category, Template> = {
  login: { username: true, password: true, urls: true, totp: true, fields: [] },
  card: {
    username: false,
    password: false,
    urls: false,
    totp: false,
    fields: ['cardholder', '*cardnumber:numeric', 'expiry', '*cvv:pin', '*pin:pin'],
  },
  identity: {
    username: false,
    password: false,
    urls: false,
    totp: false,
    fields: [
      'firstname',
      'lastname',
      'birthdate:date',
      'address:multiline',
      'phone:phone',
      'email:email',
    ],
  },
  note: { username: false, password: false, urls: false, totp: false, fields: [] },
  password: { username: false, password: true, urls: false, totp: false, fields: [] },
  finance: {
    username: false,
    password: false,
    urls: false,
    totp: false,
    fields: ['bank', 'iban', 'bic', '*accountnumber:numeric'],
  },
  license: {
    username: false,
    password: false,
    urls: true,
    totp: false,
    fields: ['*licensekey:password', 'version', 'registeredto', 'email:email'],
  },
  travel: {
    username: false,
    password: false,
    urls: false,
    totp: false,
    fields: ['*passportnumber', 'issued:date', 'expiry:date', 'country'],
  },
  computer: {
    username: true,
    password: true,
    urls: false,
    totp: false,
    fields: ['host', 'port:numeric'],
  },
  misc: { username: true, password: true, urls: true, totp: true, fields: [] },
};

export function normalizeCategory(cat: string | null | undefined): Category {
  return (CATEGORIES as readonly string[]).includes(cat ?? '') ? (cat as Category) : 'misc';
}
