export const homeTechTopics = [
  {
    label: 'Wi-Fi & Routers',
    slug: 'home-tech/wifi-routers',
    href: '/home-tech/wifi-routers/',
    description: 'Coverage, speed, router placement, mesh systems, modems, and connection problems.',
  },
  {
    label: 'Gaming PCs',
    slug: 'home-tech/gaming-pcs',
    href: '/home-tech/gaming-pcs/',
    description: 'Parts, upgrades, cooling, frame-rate problems, compatibility, and sensible builds.',
  },
  {
    label: 'Laptops',
    slug: 'home-tech/laptops',
    href: '/home-tech/laptops/',
    description: 'Buying, setup, battery life, heat, storage, repairs, and performance.',
  },
  {
    label: 'Smart Home',
    slug: 'home-tech/smart-home',
    href: '/home-tech/smart-home/',
    description: 'Hubs, cameras, lights, voice assistants, compatibility, privacy, and reliability.',
  },
  {
    label: 'Streaming & TVs',
    slug: 'home-tech/streaming-tvs',
    href: '/home-tech/streaming-tvs/',
    description: 'Streaming devices, televisions, HDMI, sound, picture settings, and playback problems.',
  },
  {
    label: 'Privacy & Security',
    slug: 'home-tech/privacy-security',
    href: '/home-tech/privacy-security/',
    description: 'Updates, accounts, backups, passwords, home-network security, and safer defaults.',
  },
];

export const homeTechTopicIds = homeTechTopics.map(({ slug }) => slug.replace('home-tech/', ''));

export const primarySections = [
  {
    label: 'Home Tech',
    slug: 'home-tech',
    href: '/home-tech/',
    description: 'Wi-Fi, computers, smart devices, streaming, privacy, and troubleshooting.',
  },
  {
    label: 'Cooking',
    slug: 'cook',
    href: '/cook/',
    description: 'Recipes, substitutions, food safety, baking, and kitchen troubleshooting.',
  },
  {
    label: 'Home & DIY',
    slug: 'make-do',
    href: '/make-do/',
    description: 'Maintenance, repairs, cleaning, organization, and safe low-cost fixes.',
  },
  {
    label: 'Buying Guides',
    slug: 'buying-guides',
    href: '/buying-guides/',
    description: 'Clear comparisons, total costs, tradeoffs, and when not to buy.',
  },
];
