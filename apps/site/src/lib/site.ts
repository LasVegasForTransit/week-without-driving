// The two organizations behind the site. LVBT runs the Las Vegas campaign
// and owns lvwwd.org; every link back to LVBT is absolute because this site
// lives on its own hostname.
export const site = {
  name: 'Week Without Driving Las Vegas',
  url: 'https://lvwwd.org',
  description:
    'Take at least one trip without driving during Week Without Driving in Las Vegas. Post it, tag us, and enter the giveaway.',
} as const;

export const lvbt = {
  name: 'Las Vegans for Better Transit',
  shortName: 'LVBT',
  url: 'https://lasvegasfortransit.org',
  projectPageUrl: 'https://lasvegasfortransit.org/projects/week-without-driving',
  joinUrl: 'https://lasvegasfortransit.org/join',
  email: {
    general: 'hello@lasvegasfortransit.org',
    partners: 'partners@lasvegasfortransit.org',
  },
  instagramUrl: 'https://instagram.com/lasvegasfortransit',
} as const;
