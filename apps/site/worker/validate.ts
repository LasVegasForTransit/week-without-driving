import type { AgeGroup, ContactType } from './env';

/**
 * The sign-up rules, checked again on the server. The rules and the words
 * match public/modules/sign-up.js, so a person sees the same message
 * whichever side catches the mistake.
 */
export const FIELD_MESSAGES = {
  firstName: 'Enter your first name.',
  firstNameLong: 'Use 40 characters or fewer for your first name.',
  contactMissing: 'Enter your email address.',
  contact: 'Enter an email address, like name@example.com.',
  zip: 'Enter a 5-digit ZIP code.',
  county:
    'Choose your county. The giveaway is open to Clark, Esmeralda, Lincoln, and Nye residents.',
  instagram: 'Instagram names use only letters, numbers, periods and underscores.',
  age: 'Pick one. You need to be 13 or older to sign up.',
} as const;

export type Field = 'firstName' | 'contact' | 'zip' | 'county' | 'instagram' | 'age';
export type FieldErrors = Partial<Record<Field, string>>;

export interface Contact {
  type: ContactType;
  /** A phone number in E.164 (+1XXXXXXXXXX) or a lowercased email address. */
  value: string;
}

/** Everything about a person that they can change after signing up. */
export interface Details {
  firstName: string;
  zip: string;
  county: County;
  instagram: string | null;
  age: AgeGroup;
}

export const COUNTIES = ['Clark', 'Esmeralda', 'Lincoln', 'Nye'] as const;
export type County = (typeof COUNTIES)[number];

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE_CHARACTERS = /^[\d\s().+-]+$/;
const HANDLE = /^[a-z0-9._]{1,30}$/;

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

/** A US phone number or an email address, normalized, or null. */
export function parseContact(raw: string): Contact | null {
  const value = raw.trim();
  // Longer than any real address; also keeps the pattern below cheap.
  if (value.length > 254) return null;
  if (EMAIL.test(value)) return { type: 'email', value: value.toLowerCase() };
  if (!PHONE_CHARACTERS.test(value)) return null;
  const digits = value.replace(/\D/g, '');
  if (digits.length === 10) return { type: 'phone', value: `+1${digits}` };
  if (digits.length === 11 && digits.startsWith('1')) return { type: 'phone', value: `+${digits}` };
  return null;
}

/** Whether a cleaned Instagram name is one Instagram allows. */
export function isHandle(handle: string): boolean {
  return HANDLE.test(handle);
}

/** An Instagram name without the @ or the instagram.com address around it. */
export function cleanHandle(raw: string): string {
  return raw
    .trim()
    .replace(/^https?:\/\/(www\.)?instagram\.com\//i, '')
    .replace(/^@/, '')
    .replace(/\/.*$/, '')
    .toLowerCase();
}

/** Checks the changeable details; `input` is a request body. */
export function checkDetails(
  input: Record<string, unknown>,
): { details: Details } | { errors: FieldErrors } {
  const errors: FieldErrors = {};

  const firstName = text(input.firstName).replace(/\s+/g, ' ');
  if (!firstName) errors.firstName = FIELD_MESSAGES.firstName;
  // Counted the way the input's maxlength="40" counts, in UTF-16 units.
  else if (firstName.length > 40) errors.firstName = FIELD_MESSAGES.firstNameLong;

  const zip = text(input.zip);
  if (!/^\d{5}$/.test(zip)) errors.zip = FIELD_MESSAGES.zip;

  const county = COUNTIES.find((candidate) => candidate === input.county);
  if (!county) errors.county = FIELD_MESSAGES.county;

  const instagram = cleanHandle(text(input.instagram));
  if (instagram && !isHandle(instagram)) errors.instagram = FIELD_MESSAGES.instagram;

  // Under 13 is not an option: the form offers only these two.
  const age = input.age === 'adult' || input.age === 'teen' ? input.age : null;
  if (!age) errors.age = FIELD_MESSAGES.age;

  if (!age || !county || Object.keys(errors).length > 0) return { errors };
  return {
    details: {
      firstName,
      zip,
      county,
      instagram: instagram || null,
      age,
    },
  };
}

/** Checks a whole sign-up: the details plus the phone number or email. */
export function checkSignUp(
  input: Record<string, unknown>,
): { details: Details; contact: Contact } | { errors: FieldErrors } {
  const checked = checkDetails(input);
  const errors: FieldErrors = 'errors' in checked ? { ...checked.errors } : {};
  const raw = text(input.contact);
  const contact = parseContact(raw);
  if (!raw) errors.contact = FIELD_MESSAGES.contactMissing;
  else if (contact?.type !== 'email') errors.contact = FIELD_MESSAGES.contact;
  if ('errors' in checked || contact?.type !== 'email') return { errors };
  return { details: checked.details, contact };
}

/** Enough of a phone number or email to recognise it, and no more. */
export function maskContact(contact: string, type: ContactType): string {
  if (type === 'phone') return `(•••) •••-${contact.slice(-4)}`;
  const at = contact.lastIndexOf('@');
  return `${contact.slice(0, 1)}•••${contact.slice(at)}`;
}
