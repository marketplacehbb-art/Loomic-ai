import { buildComponentLibrary } from './shared.js';

export const PRICING_COMPONENTS = buildComponentLibrary('pricing', [
  {
    name: 'PricingCards3',
    description: 'Three-tier pricing cards with highlighted center plan.',
    tags: ['pricing', 'tiers', 'plans'],
  },
  {
    name: 'PricingCards2',
    description: 'Simple free versus pro split card layout.',
    tags: ['pricing', 'free', 'pro'],
  },
  {
    name: 'PricingTable',
    description: 'Feature comparison pricing table with sticky feature column.',
    tags: ['pricing', 'table', 'comparison'],
  },
  {
    name: 'PricingToggle',
    description: 'Monthly and annual pricing toggle with savings indicator badge.',
    tags: ['pricing', 'toggle', 'annual'],
  },
  {
    name: 'PricingEnterprise',
    description: 'Enterprise pricing card focused on contact-sales conversion.',
    tags: ['pricing', 'enterprise', 'sales'],
  },
  {
    name: 'PricingUsageBased',
    description: 'Usage-based pricing calculator with slider-driven estimates.',
    tags: ['pricing', 'usage', 'calculator'],
  },
  {
    name: 'PricingFreemium',
    description: 'Freemium model display showing limits and upgrade path.',
    tags: ['pricing', 'freemium', 'limits'],
  },
  {
    name: 'PricingFAQ',
    description: 'Pricing-focused FAQ accordion with billing and invoice questions.',
    tags: ['pricing', 'faq', 'billing'],
  },
]);
