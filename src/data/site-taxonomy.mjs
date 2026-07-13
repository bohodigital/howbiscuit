const topic = (section, id, label, description, route = section, standalone = false) => ({
  id: `${section}/${id}`,
  label,
  slug: standalone ? `${section}/${id}` : '',
  href: standalone ? `/${section}/${id}/` : `/${route}/#${id}`,
  description,
});

export const homeTechTopics = [
  topic('home-tech', 'wifi-routers', 'Wi-Fi & Routers', 'Coverage, speed, router placement, mesh systems, modems, and connection problems.', 'home-tech', true),
  topic('home-tech', 'gaming-pcs', 'Gaming PCs', 'Parts, upgrades, cooling, frame-rate problems, compatibility, and sensible builds.', 'home-tech', true),
  topic('home-tech', 'laptops', 'Laptops', 'Buying, setup, battery life, heat, storage, repairs, and performance.', 'home-tech', true),
  topic('home-tech', 'smart-home', 'Smart Home', 'Hubs, cameras, lights, voice assistants, compatibility, privacy, and reliability.', 'home-tech', true),
  topic('home-tech', 'streaming-tvs', 'Streaming & TVs', 'Streaming devices, televisions, HDMI, sound, picture settings, and playback problems.', 'home-tech', true),
  topic('home-tech', 'privacy-security', 'Privacy & Security', 'Updates, accounts, backups, passwords, home-network security, and safer defaults.', 'home-tech', true),
];

export const cookingTopics = [
  topic('cooking', 'cheap-meals', 'Cheap Meals', 'Staples, meal planning, batch cooking, leftovers, and realistic per-serving costs.', 'cook'),
  topic('cooking', 'baking', 'Baking', 'Doughs, batters, leavening, temperature, texture, and common failures.', 'cook'),
  topic('cooking', 'ingredient-substitutions', 'Ingredient Substitutions', 'What can be replaced, how the result changes, and when a substitution will not work.', 'cook'),
  topic('cooking', 'kitchen-troubleshooting', 'Kitchen Troubleshooting', 'Diagnose texture, browning, seasoning, timing, and equipment problems.', 'cook'),
  topic('cooking', 'food-safety', 'Food Safety', 'Storage, temperatures, spoilage, cross-contamination, and official safety limits.', 'cook'),
];

export const homeDiyTopics = [
  topic('home-diy', 'repairs-maintenance', 'Repairs & Maintenance', 'Basic repairs, routine upkeep, diagnosis, materials, and realistic stop points.', 'make-do'),
  topic('home-diy', 'cleaning', 'Cleaning', 'Methods that work without damaging finishes, fabrics, appliances, or indoor air.', 'make-do'),
  topic('home-diy', 'organization-storage', 'Organization & Storage', 'Practical layouts, storage systems, small spaces, and reducing repeat clutter.', 'make-do'),
  topic('home-diy', 'apartment-living', 'Apartment Living', 'Reversible fixes, landlord responsibilities, leases, noise, comfort, and utilities.', 'make-do'),
  topic('home-diy', 'tools-materials', 'Tools & Materials', 'Choosing, using, maintaining, and safely storing common household tools and supplies.', 'make-do'),
  topic('home-diy', 'safety-professional-help', 'Safety & Professional Help', 'Electrical, plumbing, structural, gas, water, mold, and hazardous-material boundaries.', 'make-do'),
];

export const toolsTopics = [
  topic('tools', 'calculators', 'Calculators', 'Everyday price, subscription, trip, discount, bill-splitting, and budgeting calculators.', 'tools', true),
  topic('tools', 'checklists', 'Checklists', 'Setup, troubleshooting, maintenance, inspection, and buying checklists.', 'tools'),
  topic('tools', 'converters', 'Converters', 'Liquid, weight, length, area, temperature, speed, storage, energy, and pressure conversions.', 'tools', true),
  topic('tools', 'cost-estimators', 'Cost Estimators', 'Appliance energy, sales tax, special tax, and honest total-cost estimates.', 'tools', true),
  topic('tools', 'templates', 'Templates', 'Reusable planning, comparison, inventory, maintenance, and documentation templates.', 'tools'),
  topic('tools', 'decision-tools', 'Decision Tools', 'Auditable comparisons and decision trees without fake precision.', 'tools'),
];

export const buyingGuideTopics = [
  topic('buying-guides', 'computers-laptops', 'Computers & Laptops', 'Workload, performance, repairability, support life, and total cost.', 'buying-guides'),
  topic('buying-guides', 'networking', 'Networking', 'Routers, mesh systems, modems, switches, access points, and service requirements.', 'buying-guides'),
  topic('buying-guides', 'smart-home', 'Smart Home', 'Compatibility, subscriptions, privacy, local control, support, and vendor risk.', 'buying-guides'),
  topic('buying-guides', 'kitchen', 'Kitchen', 'Appliances, cookware, tools, capacity, maintenance, and replacement parts.', 'buying-guides'),
  topic('buying-guides', 'home-diy', 'Home & DIY', 'Tools, materials, cleaning equipment, storage, and repair products.', 'buying-guides'),
  topic('buying-guides', 'used-refurbished', 'Used & Refurbished', 'Inspection, remaining life, warranties, repair costs, and when used is poor value.', 'buying-guides'),
];

export const menuSections = [
  { label: 'Home Tech', slug: 'home-tech', href: '/home-tech/', description: 'Wi-Fi, computers, smart devices, streaming, privacy, and troubleshooting.', topics: homeTechTopics },
  { label: 'Cooking', slug: 'cook', href: '/cook/', description: 'Meals, baking, substitutions, food safety, and kitchen troubleshooting.', topics: cookingTopics },
  { label: 'Home & DIY', slug: 'make-do', href: '/make-do/', description: 'Maintenance, repairs, cleaning, organization, and safe low-cost fixes.', topics: homeDiyTopics },
  { label: 'Tools & Calculators', slug: 'tools', href: '/tools/', description: 'Calculators, checklists, converters, estimators, templates, and decision aids.', topics: toolsTopics },
  { label: 'Buying Guides', slug: 'buying-guides', href: '/buying-guides/', description: 'Clear comparisons, total costs, tradeoffs, and when not to buy.', topics: buyingGuideTopics },
];

export const primarySections = menuSections;
export const allTopicIds = menuSections.flatMap(({ topics }) => topics.map(({ id }) => id));
