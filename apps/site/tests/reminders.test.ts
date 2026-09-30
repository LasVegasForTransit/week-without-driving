import { describe, expect, it } from 'vitest';

import { reminderCheck } from '../src/integrations/reminder-check';
import {
  LINK_LENGTH,
  ENTRY_LINE,
  REMINDERS,
  type ReminderList,
  reminderProblems,
} from '../src/lib/reminders';

// The basic GSM 7-bit alphabet (3GPP TS 23.038), the characters a standard
// text is written in. One character outside it splits a text into parts.
const GSM =
  '@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&\'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà';

const BASE64URL = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

/** A personal link as the text sender makes it: the address and 22 random characters. */
function randomLink(): string {
  const code = [...crypto.getRandomValues(new Uint8Array(22))]
    .map((byte) => BASE64URL[byte % 64] ?? '')
    .join('');
  return `https://lvwwd.org/open#${code}`;
}

/** A copy of the real list with one change made to it. */
function changed(edit: (list: ReminderList) => void): ReminderList {
  const copy = structuredClone(REMINDERS);
  edit(copy);
  return copy;
}

function setText(list: ReminderList, day: number, text: string): void {
  const message = list.messages[day - 1];
  if (message) message.text = text;
}

describe('the daily reminder list', () => {
  it('says exactly what the campaign wrote, one message a day from October 1 to 8', () => {
    expect(REMINDERS.messages).toHaveLength(8);
    for (const message of REMINDERS.messages) {
      expect(message.body).toContain('My week');
      expect(message.body).not.toMatch(/enter by mail|must post|post a photo/i);
    }
    expect(REMINDERS.messages.map((message) => message.date)).toEqual([
      '2026-10-01',
      '2026-10-02',
      '2026-10-03',
      '2026-10-04',
      '2026-10-05',
      '2026-10-06',
      '2026-10-07',
      '2026-10-08',
    ]);
    expect(REMINDERS.signupClosesAt).toBe('2026-10-08T15:00:00Z');
  });

  it('passes every rule of the build check', () => {
    expect(reminderProblems(REMINDERS)).toEqual([]);
  });

  it('makes the text entry route clear on days 1 and 8', () => {
    const [first] = REMINDERS.messages;
    const last = REMINDERS.messages.at(-1);
    expect(first?.body.endsWith(ENTRY_LINE)).toBe(true);
    expect(last?.body.endsWith(ENTRY_LINE)).toBe(true);
  });

  it('fits every text in one standard text once a personal link is in it', () => {
    for (const { text } of REMINDERS.messages) {
      const sent = text.replace('{link}', randomLink());
      expect(sent.length).toBe(text.replace('{link}', '').length + LINK_LENGTH);
      expect(sent.length).toBeLessThanOrEqual(160);
      for (const character of sent) expect(GSM).toContain(character);
    }
  });
});

describe('the build check', () => {
  // Each broken copy must be named by the date of the message and the rule.
  const cases: Array<[name: string, list: ReminderList, date: string, rule: RegExp]> = [
    ['seven messages', changed((list) => list.messages.pop()), 'messages', /exactly 8 messages/],
    [
      'a text of 161 characters with the link',
      changed((list) =>
        setText(
          list,
          3,
          'Week Without Driving day 3: leave the car at home today. Go somewhere new, too. Share your trip: {link} Reply STOP to end.',
        ),
      ),
      '2026-10-03',
      /161 characters with the link/,
    ],
    [
      'a curly apostrophe',
      changed((list) =>
        setText(
          list,
          2,
          'Week Without Driving day 2: leave the car at home. It’s bingo day. Share your trip: {link} Reply STOP to end.',
        ),
      ),
      '2026-10-02',
      /plain letters/,
    ],
    [
      'a text without {link}',
      changed((list) =>
        setText(
          list,
          4,
          'Week Without Driving day 4: leave the car at home today. Reply STOP to end.',
        ),
      ),
      '2026-10-04',
      /exactly once/,
    ],
    [
      'a text with {link} twice',
      changed((list) =>
        setText(
          list,
          5,
          'Week Without Driving day 5: leave the car at home. {link} Share your trip: {link} Reply STOP to end.',
        ),
      ),
      '2026-10-05',
      /exactly once/,
    ],
    [
      'a text that doesn’t end with the link and the STOP line',
      changed((list) =>
        setText(list, 6, 'Week Without Driving day 6: share your trip: {link} Text STOP to quit.'),
      ),
      '2026-10-06',
      /must end with/,
    ],
    [
      'a text that doesn’t start with its day',
      changed((list) =>
        setText(
          list,
          7,
          'Week Without Driving day 1: leave the car at home. {link} Reply STOP to end.',
        ),
      ),
      '2026-10-07',
      /must start with "Week Without Driving day 7: "/,
    ],
    [
      'a day 1 body without the entry line',
      changed((list) => {
        const first = list.messages[0];
        if (first) first.body = 'Then share your trip on My week.';
      }),
      '2026-10-01',
      /body must end with/,
    ],
    [
      'a day 8 body without the entry line',
      changed((list) => {
        const last = list.messages[7];
        if (last) last.body = 'Thank you for taking part!';
      }),
      '2026-10-08',
      /body must end with/,
    ],
  ];

  it.each(cases)('stops the build for %s, naming the date and the rule', (_, list, date, rule) => {
    const problems = reminderProblems(list);
    expect(problems.some((problem) => problem.startsWith(`${date}:`) && rule.test(problem))).toBe(
      true,
    );
    const setup = reminderCheck(list).hooks['astro:config:setup'] as () => void;
    expect(setup).toThrow(date);
  });

  it('lets the real list through without a word', () => {
    const setup = reminderCheck().hooks['astro:config:setup'] as () => void;
    expect(setup).not.toThrow();
  });
});
