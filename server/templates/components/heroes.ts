import { buildComponentLibrary } from './shared.js';

export const HERO_COMPONENTS = buildComponentLibrary('hero', [
  {
    name: 'HeroCenter',
    description: 'Centered hero with gradient backdrop and two clear CTA buttons.',
    tags: ['hero', 'centered', 'cta', 'gradient'],
    defaultProps: { align: 'center' },
  },
  {
    name: 'HeroLeft',
    description: 'Left aligned hero copy paired with a right visual mockup panel.',
    tags: ['hero', 'split', 'image', 'landing'],
  },
  {
    name: 'HeroVideo',
    description: 'Full-screen video hero with dark overlay and readable typography.',
    tags: ['hero', 'video', 'background'],
  },
  {
    name: 'HeroAnimated',
    description: 'Animated hero headline cycling highlighted words for emphasis.',
    tags: ['hero', 'animation', 'headline'],
  },
  {
    name: 'HeroMinimal',
    description: 'Minimal hero focusing on large typography and whitespace.',
    tags: ['hero', 'minimal', 'typography'],
  },
  {
    name: 'HeroGradientMesh',
    description: 'Hero with animated gradient mesh and soft glow depth.',
    tags: ['hero', 'gradient', 'mesh', 'animated'],
  },
  {
    name: 'HeroWithNotification',
    description: 'Hero variant with a compact badge above the primary headline.',
    tags: ['hero', 'badge', 'announcement'],
  },
  {
    name: 'HeroSplit',
    description: 'Strict 50/50 hero split with text left and product visual right.',
    tags: ['hero', 'split', 'product'],
  },
  {
    name: 'HeroProduct',
    description: 'Product-first hero with a large centered screenshot and feature cues.',
    tags: ['hero', 'product', 'screenshot'],
  },
  {
    name: 'HeroWaitlist',
    description: 'Waitlist-focused hero with email capture and countdown timer.',
    tags: ['hero', 'waitlist', 'email', 'countdown'],
    defaultProps: { countdownHours: 72 },
  },
  {
    name: 'HeroDashboard',
    description: 'Dashboard hero with floating app preview card and layered shadows.',
    tags: ['hero', 'dashboard', 'saas'],
    supabaseRequired: true,
  },
  {
    name: 'HeroTestimonial',
    description: 'Hero plus featured customer quote for instant social proof.',
    tags: ['hero', 'testimonial', 'social-proof'],
  },
]);
