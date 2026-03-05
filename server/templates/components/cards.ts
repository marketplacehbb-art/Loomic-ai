import { buildComponentLibrary } from './shared.js';

export const CARD_COMPONENTS = buildComponentLibrary('card', [
  {
    name: 'ProductCard',
    description: 'Product card with image, name, price, and add-to-cart action.',
    tags: ['card', 'product', 'ecommerce'],
    supabaseRequired: true,
  },
  {
    name: 'ProductCardMinimal',
    description: 'Minimal product card focused on clean visuals and price.',
    tags: ['card', 'product', 'minimal'],
    supabaseRequired: true,
  },
  {
    name: 'BlogCard',
    description: 'Blog card with thumbnail, category, excerpt, and author meta.',
    tags: ['card', 'blog', 'content'],
    supabaseRequired: true,
  },
  {
    name: 'BlogCardHorizontal',
    description: 'Horizontal blog card layout optimized for lists and sidebars.',
    tags: ['card', 'blog', 'horizontal'],
    supabaseRequired: true,
  },
  {
    name: 'TeamCard',
    description: 'Team member card with avatar, role, and social links.',
    tags: ['card', 'team', 'about'],
  },
  {
    name: 'TeamCardMinimal',
    description: 'Compact team card variant with concise identity details.',
    tags: ['card', 'team', 'minimal'],
  },
  {
    name: 'PricingCard',
    description: 'Single pricing tier card with features and CTA.',
    tags: ['card', 'pricing', 'plans'],
  },
  {
    name: 'FeatureCard',
    description: 'Feature card with icon, title, and supporting description.',
    tags: ['card', 'feature', 'marketing'],
  },
  {
    name: 'StatCard',
    description: 'Stat card with metric value, label, and trend indicator.',
    tags: ['card', 'stats', 'dashboard'],
    supabaseRequired: true,
  },
  {
    name: 'TestimonialCard',
    description: 'Customer testimonial card with quote, author, company, and stars.',
    tags: ['card', 'testimonial', 'social-proof'],
  },
  {
    name: 'ProjectCard',
    description: 'Project card with thumbnail, title, and technology badges.',
    tags: ['card', 'project', 'portfolio'],
    supabaseRequired: true,
  },
  {
    name: 'ServiceCard',
    description: 'Service card with icon, summary text, and action button.',
    tags: ['card', 'service', 'cta'],
  },
  {
    name: 'EventCard',
    description: 'Event card with date, location, and registration action.',
    tags: ['card', 'event', 'calendar'],
    supabaseRequired: true,
  },
  {
    name: 'JobCard',
    description: 'Job listing card with role, location, salary, and apply button.',
    tags: ['card', 'jobs', 'careers'],
    supabaseRequired: true,
  },
  {
    name: 'NotificationCard',
    description: 'Notification card showing icon, message, timestamp, and action.',
    tags: ['card', 'notification', 'alerts'],
    supabaseRequired: true,
  },
]);
