import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  ACCESS_ENV,
  accessToken,
  adminGet,
  makeAccessKeys,
  seedEntry,
  seedParticipant,
  type AccessKeys,
} from './support/admin';
import { fakeOutbound, startPlatform, type Platform } from './support/platform';

describe('volunteer campaign report', () => {
  let platform: Platform;
  let keys: AccessKeys;
  const realFetch = globalThis.fetch;

  beforeAll(async () => {
    platform = await startPlatform();
    keys = await makeAccessKeys();
  }, 60_000);
  afterAll(async () => {
    vi.unstubAllGlobals();
    await platform.dispose();
  });
  beforeEach(async () => {
    await platform.reset();
    const outbound = fakeOutbound(realFetch);
    outbound.accessKeys = [keys.publicJwk];
    vi.stubGlobal('fetch', outbound.fetch);
  });

  async function open(path: string, signedIn = true) {
    return platform.send(
      adminGet(path, signedIn ? await accessToken(keys) : undefined),
      ACCESS_ENV,
    );
  }

  it('shows confirmed participation and partner attribution without personal details', async () => {
    const one = await seedParticipant(platform, {
      contact: 'one@example.com',
      createdAt: '2026-10-01T18:00:00.000Z',
    });
    const two = await seedParticipant(platform, {
      contact: 'two@example.com',
      createdAt: '2026-10-02T18:00:00.000Z',
    });
    await platform.env.DB.prepare(
      "UPDATE participants SET partner = 'rtc-southern-nevada' WHERE id = ?1",
    )
      .bind(one)
      .run();
    await platform.env.DB.prepare(
      `INSERT INTO trip_plans
       (id, participant_id, day, destination, created_at, updated_at)
       VALUES ('plan-1', ?1, 1, 'The park', '2026-10-01T19:00:00.000Z', '2026-10-01T19:00:00.000Z')`,
    )
      .bind(one)
      .run();
    await seedEntry(platform, { participantId: one, day: 1, checked: true });
    await seedEntry(platform, { participantId: two, day: 2, removed: true });

    const response = await open('/admin/report');
    const body = await response.text();
    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(body).toContain('Campaign report');
    expect(body).toContain('<strong>2</strong> signups');
    expect(body).toContain('<strong>1</strong> person with a plan');
    expect(body).toContain('<strong>1</strong> person with an entry');
    expect(body).toContain('RTC of Southern Nevada');
    expect(body).toContain('Oct 1');
    expect(body).not.toContain('one@example.com');
    expect(body).not.toContain('two@example.com');
    expect(body).not.toContain('The park');
  });

  it('downloads aggregate counts only and refuses unsigned requests', async () => {
    const person = await seedParticipant(platform, { contact: 'person@example.com' });
    await seedEntry(platform, { participantId: person, day: 3, checked: true });
    const denied = await open('/api/admin/report.csv', false);
    expect(denied.status).toBe(403);
    const response = await open('/api/admin/report.csv');
    const csv = await response.text();
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toContain('text/csv');
    expect(csv).toContain('section,label,metric,count');
    expect(csv).toContain('"campaign","all","signups","1"');
    expect(csv).not.toContain('person@example.com');
  });
});
