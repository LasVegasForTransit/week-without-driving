import type { AstroIntegration } from 'astro';

import { REMINDERS, type ReminderList, reminderProblems } from '../lib/reminders';

/**
 * Checks the daily reminders in src/data/reminders.json before every build
 * and every `pnpm dev`. A message that breaks a rule stops the build with
 * the date of the message and the rule it broke, so a volunteer who edits
 * a reminder sees the problem before anything is published.
 */
export function reminderCheck(reminders: ReminderList = REMINDERS): AstroIntegration {
  return {
    name: 'lvwwd-reminder-check',
    hooks: {
      'astro:config:setup': () => {
        const problems = reminderProblems(reminders);
        if (problems.length > 0) {
          throw new Error(
            `src/data/reminders.json has ${problems.length === 1 ? 'a problem' : `${problems.length} problems`}:\n${problems.map((problem) => `  - ${problem}`).join('\n')}`,
          );
        }
      },
    },
  };
}
