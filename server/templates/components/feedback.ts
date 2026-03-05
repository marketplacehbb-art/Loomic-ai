import { buildComponentLibrary } from './shared.js';

export const FEEDBACK_COMPONENTS = buildComponentLibrary('feedback', [
  {
    name: 'ToastSuccess',
    description: 'Green success toast notification with icon and auto-dismiss.',
    tags: ['feedback', 'toast', 'success'],
  },
  {
    name: 'ToastError',
    description: 'Red error toast notification with retry-focused copy.',
    tags: ['feedback', 'toast', 'error'],
  },
  {
    name: 'ToastInfo',
    description: 'Blue info toast for neutral updates and lightweight guidance.',
    tags: ['feedback', 'toast', 'info'],
  },
  {
    name: 'AlertBanner',
    description: 'Top-page full-width alert banner with optional dismiss action.',
    tags: ['feedback', 'alert', 'banner'],
  },
  {
    name: 'EmptyState',
    description: 'Empty state with icon, message, and primary action button.',
    tags: ['feedback', 'empty-state', 'cta'],
  },
  {
    name: 'ErrorState',
    description: 'Error state block with retry action and concise diagnostics.',
    tags: ['feedback', 'error-state', 'retry'],
  },
  {
    name: 'LoadingSpinner',
    description: 'Centered loading spinner for asynchronous operation feedback.',
    tags: ['feedback', 'loading', 'spinner'],
  },
  {
    name: 'LoadingSkeleton',
    description: 'Animated skeleton placeholder blocks for data loading phases.',
    tags: ['feedback', 'loading', 'skeleton'],
  },
  {
    name: 'LoadingDots',
    description: 'Three-dot loading indicator for compact async surfaces.',
    tags: ['feedback', 'loading', 'dots'],
  },
  {
    name: 'ProgressSteps',
    description: 'Step progress component with labels and active indicators.',
    tags: ['feedback', 'progress', 'steps'],
  },
  {
    name: 'ConfirmDialog',
    description: 'Reusable confirmation modal for destructive and risky actions.',
    tags: ['feedback', 'dialog', 'confirmation'],
  },
  {
    name: 'RatingStars',
    description: 'Interactive star rating input with hover and keyboard support.',
    tags: ['feedback', 'rating', 'stars'],
    supabaseRequired: true,
  },
]);
