import { buildComponentLibrary } from './shared.js';

export const LAYOUT_COMPONENTS = buildComponentLibrary('layout', [
  {
    name: 'SectionWrapper',
    description: 'Standard section wrapper using py-24 and centered container width.',
    tags: ['layout', 'section', 'container'],
  },
  {
    name: 'TwoColumnLayout',
    description: 'Two-column split layout supporting 60/40 or 50/50 composition.',
    tags: ['layout', 'two-column', 'split'],
  },
  {
    name: 'ThreeColumnLayout',
    description: 'Equal thirds layout for cards, features, and compact summaries.',
    tags: ['layout', 'three-column', 'grid'],
  },
  {
    name: 'SidebarLayout',
    description: 'Sidebar and main content layout for docs and dashboard pages.',
    tags: ['layout', 'sidebar', 'dashboard'],
    supabaseRequired: true,
  },
  {
    name: 'DashboardLayout',
    description: 'Application dashboard shell with sidebar nav and content header.',
    tags: ['layout', 'dashboard', 'shell'],
    supabaseRequired: true,
  },
  {
    name: 'ModalOverlay',
    description: 'Centered modal with backdrop blur and accessible close actions.',
    tags: ['layout', 'modal', 'overlay'],
  },
  {
    name: 'DrawerRight',
    description: 'Slide-in drawer panel from the right for details or settings.',
    tags: ['layout', 'drawer', 'panel'],
  },
  {
    name: 'DrawerBottom',
    description: 'Bottom sheet drawer for mobile-first interaction patterns.',
    tags: ['layout', 'drawer', 'mobile'],
  },
  {
    name: 'AccordionItem',
    description: 'Single accordion item block with expandable body content.',
    tags: ['layout', 'accordion', 'content'],
  },
  {
    name: 'TabPanel',
    description: 'Accessible tab content panel with active/inactive transitions.',
    tags: ['layout', 'tabs', 'panel'],
  },
  {
    name: 'CardGrid',
    description: 'Responsive card grid wrapper for repeated content cards.',
    tags: ['layout', 'grid', 'cards'],
  },
  {
    name: 'MasonryGrid',
    description: 'Masonry-style grid using CSS columns for uneven card heights.',
    tags: ['layout', 'masonry', 'gallery'],
  },
  {
    name: 'StickyHeader',
    description: 'Header block that remains sticky while scrolling page content.',
    tags: ['layout', 'sticky', 'header'],
  },
  {
    name: 'BackToTop',
    description: 'Floating back-to-top button with smooth scroll behavior.',
    tags: ['layout', 'floating', 'navigation'],
  },
  {
    name: 'Divider',
    description: 'Styled section divider with optional centered helper text.',
    tags: ['layout', 'divider', 'separator'],
  },
]);
