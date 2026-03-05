import { buildComponentLibrary } from './shared.js';

export const NAVIGATION_COMPONENTS = buildComponentLibrary('navigation', [
  {
    name: 'NavbarSimple',
    description: 'Minimal navbar with logo on the left, centered links, and CTA on the right.',
    tags: ['navbar', 'header', 'links', 'cta'],
    defaultProps: { sticky: false, showCta: true },
  },
  {
    name: 'NavbarDark',
    description: 'Dark sticky navbar with glassmorphism effect and polished hover states.',
    tags: ['navbar', 'dark', 'glassmorphism', 'sticky'],
    defaultProps: { sticky: true, blur: true },
  },
  {
    name: 'NavbarTransparent',
    description: 'Transparent navbar over hero that becomes solid after scroll.',
    tags: ['navbar', 'hero', 'scroll', 'transparent'],
    defaultProps: { revealOnScroll: true },
  },
  {
    name: 'NavbarMegaMenu',
    description: 'Desktop navigation with mega menu panels, icons, and short descriptions.',
    tags: ['navbar', 'mega-menu', 'dropdown', 'desktop'],
    defaultProps: { menuColumns: 3 },
  },
  {
    name: 'NavbarSidebar',
    description: 'Hamburger navigation that opens a full-screen sidebar overlay.',
    tags: ['navbar', 'mobile', 'hamburger', 'sidebar'],
    defaultProps: { overlay: true },
  },
  {
    name: 'NavbarDashboard',
    description: 'Dashboard navigation shell with collapsible app sidebar and topbar.',
    tags: ['dashboard', 'sidebar', 'navigation', 'app-shell'],
    defaultProps: { collapsible: true },
    supabaseRequired: true,
  },
  {
    name: 'BreadcrumbSimple',
    description: 'Path breadcrumbs with separators for subpage context.',
    tags: ['breadcrumb', 'navigation', 'path'],
  },
  {
    name: 'BreadcrumbBack',
    description: 'Back button plus page title pattern for compact page headers.',
    tags: ['breadcrumb', 'back', 'header'],
  },
  {
    name: 'PaginationSimple',
    description: 'Previous/next pagination with numbered pages and active state.',
    tags: ['pagination', 'list', 'table'],
    defaultProps: { pageSize: 10 },
    supabaseRequired: true,
  },
  {
    name: 'PaginationLoadMore',
    description: 'Load more pagination with visible count and loading state.',
    tags: ['pagination', 'load-more', 'infinite'],
    defaultProps: { pageSize: 12 },
    supabaseRequired: true,
  },
  {
    name: 'TabsSimple',
    description: 'Horizontal tabs with active underline for content switching.',
    tags: ['tabs', 'navigation', 'content-switch'],
    defaultProps: { defaultTab: 'overview' },
  },
  {
    name: 'TabsPills',
    description: 'Pill style tab navigation with filled active background.',
    tags: ['tabs', 'pills', 'filters'],
  },
  {
    name: 'TabsVertical',
    description: 'Vertical tabs for settings, account pages, and admin forms.',
    tags: ['tabs', 'vertical', 'settings'],
  },
  {
    name: 'StepperHorizontal',
    description: 'Horizontal stepper with progress indicator for multi-step flows.',
    tags: ['stepper', 'wizard', 'progress'],
    defaultProps: { steps: 4, currentStep: 1 },
  },
  {
    name: 'StepperVertical',
    description: 'Vertical stepper for onboarding and form completion workflows.',
    tags: ['stepper', 'vertical', 'onboarding'],
    defaultProps: { steps: 5, currentStep: 1 },
  },
]);
