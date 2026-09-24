// The browser preset: the page's client scripts under public/scripts and the
// Worker in front of the assets both run against web globals.
import { config } from '@lasvegasfortransit/eslint-config/browser';

// dist-e2e is the analytics end-to-end build, generated like dist.
export default [...config, { ignores: ['dist-e2e/**'] }];
