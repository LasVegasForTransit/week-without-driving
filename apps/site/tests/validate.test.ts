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
  county: 'Clark',
  instagram: '',
  age: 'teen',
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
      details: { firstName: 'Rosa', zip: '89101', county: 'Clark', instagram: null, age: 'teen' },
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

  it('accepts a five-digit ZIP in each eligible county and rejects other counties', () => {
    for (const county of ['Clark', 'Esmeralda', 'Lincoln', 'Nye']) {
      expect('details' in checkSignUp({ ...valid, county, zip: '89301' })).toBe(true);
    }
    const outside = checkSignUp({ ...valid, county: 'Washoe' });
    expect('errors' in outside && outside.errors.county).toBeTruthy();
    expect('errors' in checkSignUp({ ...valid, county: '' })).toBe(true);
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

  it('requires an email address for a web sign-up', () => {
    const phone = checkSignUp({ ...valid, contact: '702-555-0123' });
    expect('errors' in phone && phone.errors.contact).toMatch(/email/i);
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
