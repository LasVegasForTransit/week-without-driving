// The two organizations behind the site. LVBT runs the Las Vegas campaign
// and owns lvwwd.org; every link back to LVBT is absolute because this site
// lives on its own hostname.
export const site = {
  name: 'Week Without Driving Las Vegas',
  url: 'https://lvwwd.org',
  description:
    'Week Without Driving Las Vegas 2026 has wrapped up. Thank you for taking part. We’ll see you in 2027! Stay involved with LVBT all year.',
} as const;

export const lvbt = {
  name: 'Las Vegans for Better Transit',
  shortName: 'LVBT',
  ein: '42-1995935',
  url: 'https://lasvegasfortransit.org',
  projectPageUrl: 'https://lasvegasfortransit.org/projects/week-without-driving',
  joinUrl: 'https://lasvegasfortransit.org/join/member/?from=wwd',
  email: {
    general: 'hello@lasvegasfortransit.org',
    partners: 'partners@lasvegasfortransit.org',
  },
  instagramUrl: 'https://instagram.com/lasvegasfortransit',
} as const;
