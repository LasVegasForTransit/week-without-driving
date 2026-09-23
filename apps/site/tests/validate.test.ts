import { describe, expect, it } from 'vitest';

import {
  checkDetails,
  checkSignUp,
  cleanHandle,
  maskContact,
  parseContact,
} from '../worker/validate';

const valid = {
  firstName: '  Rosa  ',
  contact: 'rosa@example.com',
  zip: '89101',
  instagram: '',
  age: 'teen',
  newsletter: false,
};

describe('parseContact', () => {
  it('normalizes US phone numbers to E.164', () => {
    for (const raw of ['702-555-0123', '(702) 555-0123', '702.555.0123', '+1 702 555 0123']) {
      expect(parseContact(raw)).toEqual({ type: 'phone', value: '+17025550123' });
    }
  });

  it('lowercases email addresses', () => {
    expect(parseContact(' Rosa@Example.COM ')).toEqual({
      type: 'email',
      value: 'rosa@example.com',
    });
  });

  it('refuses anything else', () => {
    for (const raw of ['', '555-0123', '+44 20 7946 0958', 'rosa@example', 'call me', 'a@b.c']) {
      expect(parseContact(raw)).toBeNull();
    }
    expect(parseContact(`${'a'.repeat(250)}@example.com`)).toBeNull();
  });
});

describe('cleanHandle', () => {
  it('strips the @ and an instagram.com address, and lowercases', () => {
    expect(cleanHandle('@Rosa.Rides')).toBe('rosa.rides');
    expect(cleanHandle('https://www.instagram.com/Rosa_Rides/')).toBe('rosa_rides');
  });
});

describe('checkSignUp', () => {
  it('accepts a complete sign-up and tidies it', () => {
    const checked = checkSignUp(valid);
    expect(checked).toEqual({
      details: { firstName: 'Rosa', zip: '89101', instagram: null, age: 'teen', newsletter: false },
      contact: { type: 'email', value: 'rosa@example.com' },
    });
  });

  it('names each field that is wrong', () => {
    const checked = checkSignUp({ ...valid, firstName: '', contact: 'x', zip: '8910', age: '' });
    expect('errors' in checked && Object.keys(checked.errors).sort()).toEqual([
      'age',
      'contact',
      'firstName',
      'zip',
    ]);
  });

  it('tells a missing contact apart from a wrong one', () => {
    const missing = checkSignUp({ ...valid, contact: '' });
    const wrong = checkSignUp({ ...valid, contact: 'x' });
    expect('errors' in missing && 'errors' in wrong).toBe(true);
    if ('errors' in missing && 'errors' in wrong) {
      expect(missing.errors.contact).not.toBe(wrong.errors.contact);
    }
  });

  it('takes only Southern Nevada ZIP codes', () => {
    expect('details' in checkSignUp({ ...valid, zip: '89002' })).toBe(true);
    const outside = checkSignUp({ ...valid, zip: '90210' });
    expect('errors' in outside && outside.errors.zip).toMatch(/Southern Nevada/);
  });

  it('keeps names to 40 characters', () => {
    expect('details' in checkDetails({ ...valid, firstName: 'R'.repeat(40) })).toBe(true);
    expect('errors' in checkDetails({ ...valid, firstName: 'R'.repeat(41) })).toBe(true);
  });

  it('takes only the two age groups, so no one under 13 can sign up', () => {
    for (const age of ['child', 'under13', 12, undefined]) {
      expect('errors' in checkDetails({ ...valid, age })).toBe(true);
    }
  });

  it('refuses Instagram names with other characters', () => {
    expect('errors' in checkDetails({ ...valid, instagram: 'rosa rides!' })).toBe(true);
  });

  it('treats only a real true as a newsletter yes', () => {
    const yes = checkDetails({ ...valid, newsletter: true });
    const stringy = checkDetails({ ...valid, newsletter: 'true' });
    expect('details' in yes && yes.details.newsletter).toBe(true);
    expect('details' in stringy && stringy.details.newsletter).toBe(false);
  });
});

describe('maskContact', () => {
  it('shows only enough to recognise the contact', () => {
    expect(maskContact('+17025550123', 'phone')).toMatch(/0123$/);
    expect(maskContact('+17025550123', 'phone')).not.toContain('702');
    const email = maskContact('rosa@example.com', 'email');
    expect(email).toMatch(/^r.*@example\.com$/);
    expect(email).not.toContain('rosa');
  });
});
