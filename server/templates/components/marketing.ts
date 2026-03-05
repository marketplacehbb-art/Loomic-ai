import { buildComponentLibrary } from './shared.js';

export const MARKETING_COMPONENTS = buildComponentLibrary('marketing', [
  {
    name: 'AnnouncementBar',
    description: 'Top-of-page announcement strip for launches and campaigns.',
    tags: ['marketing', 'announcement', 'banner'],
  },
  {
    name: 'ExitIntentModal',
    description: 'Exit-intent modal pattern for retention and lead capture.',
    tags: ['marketing', 'modal', 'conversion'],
  },
  {
    name: 'CookieBanner',
    description: 'GDPR cookie consent banner with accept and reject actions.',
    tags: ['marketing', 'cookie', 'compliance'],
  },
  {
    name: 'PromoCard',
    description: 'Promotional card with offer details, timer, and CTA.',
    tags: ['marketing', 'promo', 'offer'],
  },
  {
    name: 'CountdownTimer',
    description: 'Days/hours/minutes/seconds countdown for campaigns and launches.',
    tags: ['marketing', 'countdown', 'launch'],
  },
  {
    name: 'SocialShare',
    description: 'Social platform share buttons with branded hover treatments.',
    tags: ['marketing', 'share', 'social'],
  },
  {
    name: 'ReferralBox',
    description: 'Referral invite box with copy-to-clipboard invite link.',
    tags: ['marketing', 'referral', 'copy'],
    supabaseRequired: true,
  },
  {
    name: 'BadgeNew',
    description: 'Compact "New" badge for recently released product features.',
    tags: ['marketing', 'badge', 'new'],
  },
  {
    name: 'BadgeBeta',
    description: 'Beta badge for early-access features and gated experiences.',
    tags: ['marketing', 'badge', 'beta'],
  },
  {
    name: 'BetaSignupCard',
    description: 'Card for collecting beta access requests and context details.',
    tags: ['marketing', 'beta', 'signup'],
  },
  {
    name: 'ProductHunt',
    description: 'Product Hunt launch badge and supporting vote CTA.',
    tags: ['marketing', 'product-hunt', 'launch'],
  },
  {
    name: 'AppStoreButtons',
    description: 'Download buttons for iOS App Store and Google Play.',
    tags: ['marketing', 'app-store', 'mobile'],
  },
]);
