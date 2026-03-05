import { buildComponentLibrary } from './shared.js';

export const SOCIAL_PROOF_COMPONENTS = buildComponentLibrary('social-proof', [
  {
    name: 'TestimonialGrid',
    description: 'Three-column testimonial cards with star ratings and author details.',
    tags: ['testimonials', 'grid', 'stars'],
  },
  {
    name: 'TestimonialCarousel',
    description: 'Auto-sliding testimonial carousel with pause-on-hover behavior.',
    tags: ['testimonials', 'carousel', 'autoplay'],
  },
  {
    name: 'TestimonialFeatured',
    description: 'Single large featured quote block for key customer validation.',
    tags: ['testimonials', 'quote', 'featured'],
  },
  {
    name: 'TestimonialAvatarList',
    description: 'Avatar row with social proof count and supportive microcopy.',
    tags: ['testimonials', 'avatars', 'social-proof'],
  },
  {
    name: 'LogoCloud',
    description: 'Partner logo cloud row with responsive wrapping and grayscale hover.',
    tags: ['logos', 'partners', 'trust'],
  },
  {
    name: 'LogoCloudScrolling',
    description: 'Infinite scrolling logo marquee for high-volume trust marks.',
    tags: ['logos', 'marquee', 'trust'],
  },
  {
    name: 'StatsBar',
    description: 'Horizontal stats row with four key proof metrics.',
    tags: ['stats', 'metrics', 'social-proof'],
  },
  {
    name: 'StatsAnimated',
    description: 'Count-up metric cards animated on scroll into view.',
    tags: ['stats', 'animated', 'count-up'],
  },
  {
    name: 'CaseStudyCard',
    description: 'Mini case-study card showing customer result and improvement.',
    tags: ['case-study', 'results', 'roi'],
  },
  {
    name: 'TrustBadges',
    description: 'Security and award badge row for compliance-focused products.',
    tags: ['trust', 'badges', 'security'],
  },
  {
    name: 'ReviewStars',
    description: 'Aggregated star rating display with vote count and source.',
    tags: ['reviews', 'stars', 'ratings'],
  },
  {
    name: 'SocialProofPopup',
    description: 'Small signup activity popup for realtime social validation.',
    tags: ['popup', 'social-proof', 'notifications'],
    supabaseRequired: true,
  },
]);
