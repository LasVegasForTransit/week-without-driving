import list from '../data/reminders.json';

/**
 * The daily reminders: one message for each morning of the week, October 1
 * to 8, 2026, in src/data/reminders.json. That file is the only place the
 * wording lives. The Worker sends each day's notification from it, and a
 * future text message sender reads each day's text from it.
 *
 * Every build runs reminderProblems() over the file (see
 * src/integrations/reminder-check.ts) and stops with the date and the rule
 * when an edit breaks one, so a broken message never goes out.
 */

export interface ReminderMessage {
  /** The Las Vegas date it is sent on, as YYYY-MM-DD. */
  date: string;
  /** 1 to 8. */
  day: number;
  /** The notification's title. */
  title: string;
  /** The notification's body. */
  body: string;
  /**
   * The text message. {link} stands for the person's own "Open my week"
   * link, which the text sender puts in its place.
   */
  text: string;
}

export interface ReminderList {
  /** From here on nobody can turn reminders on: 8:00 am on October 8, Las Vegas time. */
  signupClosesAt: string;
  messages: ReminderMessage[];
}

export const REMINDERS: ReminderList = list;

/** Where a text carries the person's link. */
export const LINK_PLACEHOLDER = '{link}';

/** A personal link, https://lvwwd.org/open# and a 22-character code, is always this long. */
export const LINK_LENGTH = 45;

/** The longest text that is still one standard text message. */
export const MAX_TEXT_LENGTH = 160;

export const SIGNUP_CLOSES_AT = '2026-10-08T15:00:00Z';

export const MAIL_IN_LINE =
  'No purchase or post necessary. No social media? You can enter by mail.';

const TEXT_END = `${LINK_PLACEHOLDER} Reply STOP to end.`;

// A curly quote or a long dash makes phones send a text as several parts,
// so outside the link a text may use only these.
const PLAIN_TEXT = /^[A-Za-z0-9 .,:!?'/-]*$/;

const DATES = [1, 2, 3, 4, 5, 6, 7, 8].map((day) => `2026-10-0${day}`);

function textProblems(message: ReminderMessage): string[] {
  const { day, text } = message;
  const problems: string[] = [];
  if (!text.startsWith(`Week Without Driving day ${day}: `)) {
    problems.push(`the text must start with "Week Without Driving day ${day}: "`);
  }
  const places = text.split(LINK_PLACEHOLDER).length - 1;
  if (places !== 1) {
    problems.push(`the text must have ${LINK_PLACEHOLDER} exactly once, not ${places} times`);
  }
  if (!text.endsWith(TEXT_END)) problems.push(`the text must end with "${TEXT_END}"`);
  const sent = text.length + places * (LINK_LENGTH - LINK_PLACEHOLDER.length);
  if (sent > MAX_TEXT_LENGTH) {
    problems.push(
      `the text is ${sent} characters with the link in it; the most is ${MAX_TEXT_LENGTH}`,
    );
  }
  if (!PLAIN_TEXT.test(text.split(LINK_PLACEHOLDER).join(''))) {
    problems.push(
      "the text may use only plain letters, digits, spaces and . , : ! ? ' / - (no curly quotes or long dashes)",
    );
  }
  return problems;
}

function messageProblems(message: ReminderMessage, index: number): string[] {
  const day = index + 1;
  const problems: string[] = [];
  if (message.date !== DATES[index]) problems.push(`the date must be ${DATES[index] ?? '?'}`);
  if (message.day !== day) problems.push(`the day must be ${day}`);
  if (!message.title.startsWith(`Day ${day} of 8: `)) {
    problems.push(`the title must start with "Day ${day} of 8: "`);
  }
  if (!message.body.trim()) problems.push('the body is empty');
  if ((day === 1 || day === 8) && !message.body.endsWith(MAIL_IN_LINE)) {
    problems.push(`the body must end with "${MAIL_IN_LINE}"`);
  }
  return [...problems, ...textProblems(message)];
}

/**
 * Every broken rule in a reminder list, as "<date>: <rule>". An empty list
 * means the list is fine.
 */
export function reminderProblems(reminders: ReminderList): string[] {
  const problems: string[] = [];
  if (reminders.signupClosesAt !== SIGNUP_CLOSES_AT) {
    problems.push(`signupClosesAt: it must be ${SIGNUP_CLOSES_AT}`);
  }
  if (reminders.messages.length !== DATES.length) {
    problems.push(
      `messages: there must be exactly ${DATES.length} messages, not ${reminders.messages.length}`,
    );
  }
  reminders.messages.forEach((message, index) => {
    const name = message.date || `message ${index + 1}`;
    for (const problem of messageProblems(message, index)) problems.push(`${name}: ${problem}`);
  });
  return problems;
}

/** The message for a day of the week (1 to 8). */
export function messageForDay(day: number): ReminderMessage | undefined {
  return REMINDERS.messages.find((message) => message.day === day);
}
