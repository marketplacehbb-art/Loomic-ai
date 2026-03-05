import { buildComponentLibrary } from './shared.js';

export const FEATURE_COMPONENTS = buildComponentLibrary('feature', [
  {
    name: 'FeatureGrid3',
    description: 'Three-column feature grid with icons, titles, and concise descriptions.',
    tags: ['features', 'grid', '3-column'],
  },
  {
    name: 'FeatureGrid4',
    description: 'Compact four-column feature grid for dense product highlights.',
    tags: ['features', 'grid', '4-column'],
  },
  {
    name: 'FeatureAlternating',
    description: 'Alternating feature rows with text and image blocks left/right.',
    tags: ['features', 'alternating', 'image'],
  },
  {
    name: 'FeatureBento',
    description: 'Bento-style feature layout inspired by modern SaaS dashboards.',
    tags: ['features', 'bento', 'saas'],
  },
  {
    name: 'FeatureTimeline',
    description: 'Vertical timeline explaining product milestones or workflow steps.',
    tags: ['features', 'timeline', 'steps'],
  },
  {
    name: 'FeatureComparison',
    description: 'Before-and-after comparison component for competitor differentiation.',
    tags: ['features', 'comparison', 'before-after'],
  },
  {
    name: 'FeatureWithScreenshot',
    description: 'Feature list paired with a prominent application screenshot.',
    tags: ['features', 'screenshot', 'product'],
  },
  {
    name: 'FeatureIconList',
    description: 'Simple icon list for concise value propositions and capabilities.',
    tags: ['features', 'icon-list', 'benefits'],
  },
  {
    name: 'FeatureNumbered',
    description: 'Large numbered steps showing onboarding or workflow progression.',
    tags: ['features', 'numbered', 'how-it-works'],
  },
  {
    name: 'FeatureTabbed',
    description: 'Tab-switching feature panel with contextual detail views.',
    tags: ['features', 'tabs', 'interactive'],
  },
  {
    name: 'FeatureAccordion',
    description: 'Expandable feature details using accessible accordion patterns.',
    tags: ['features', 'accordion', 'details'],
  },
  {
    name: 'FeatureCarousel',
    description: 'Swipeable carousel of feature cards with navigation controls.',
    tags: ['features', 'carousel', 'swipe'],
  },
]);
