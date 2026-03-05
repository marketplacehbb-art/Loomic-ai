import { buildComponentLibrary } from './shared.js';

export const DASHBOARD_COMPONENTS = buildComponentLibrary('dashboard', [
  {
    name: 'ActivityFeed',
    description: 'Recent activity feed with actor, action, and relative timestamps.',
    tags: ['dashboard', 'activity', 'feed'],
    supabaseRequired: true,
  },
  {
    name: 'NotificationCenter',
    description: 'Notification list with unread indicators and grouped actions.',
    tags: ['dashboard', 'notifications', 'center'],
    supabaseRequired: true,
  },
  {
    name: 'UserMenu',
    description: 'Avatar dropdown menu with profile, settings, and sign-out links.',
    tags: ['dashboard', 'user', 'menu'],
    supabaseRequired: true,
  },
  {
    name: 'CommandPalette',
    description: 'Command palette overlay for quick navigation and actions.',
    tags: ['dashboard', 'command', 'shortcut'],
  },
  {
    name: 'QuickActions',
    description: 'Shortcut action grid for common dashboard tasks.',
    tags: ['dashboard', 'actions', 'shortcuts'],
    supabaseRequired: true,
  },
  {
    name: 'RecentItems',
    description: 'List of recently viewed or edited entities with metadata.',
    tags: ['dashboard', 'recent', 'history'],
    supabaseRequired: true,
  },
  {
    name: 'CalendarWidget',
    description: 'Mini month calendar widget with highlighted active date.',
    tags: ['dashboard', 'calendar', 'schedule'],
    supabaseRequired: true,
  },
  {
    name: 'WeatherWidget',
    description: 'Compact weather summary widget for location-based dashboards.',
    tags: ['dashboard', 'weather', 'widget'],
  },
  {
    name: 'ClockWidget',
    description: 'Digital or analog clock widget for timezone-aware workspaces.',
    tags: ['dashboard', 'clock', 'time'],
  },
  {
    name: 'UsageWidget',
    description: 'Resource usage bars for tokens, storage, and request limits.',
    tags: ['dashboard', 'usage', 'limits'],
    supabaseRequired: true,
  },
  {
    name: 'BillingWidget',
    description: 'Billing summary widget with current plan and renewal status.',
    tags: ['dashboard', 'billing', 'subscription'],
    supabaseRequired: true,
  },
  {
    name: 'OnboardingChecklist',
    description: 'Checklist widget guiding new users through setup tasks.',
    tags: ['dashboard', 'onboarding', 'tasks'],
    supabaseRequired: true,
  },
]);
