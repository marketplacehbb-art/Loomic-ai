import { buildComponentLibrary } from './shared.js';

export const FORM_COMPONENTS = buildComponentLibrary('form', [
  {
    name: 'ContactSimple',
    description: 'Name, email, message contact form with polished submit action.',
    tags: ['form', 'contact', 'lead'],
  },
  {
    name: 'ContactDetailed',
    description: 'Extended contact form with phone, company, and subject selection.',
    tags: ['form', 'contact', 'company'],
  },
  {
    name: 'NewsletterInline',
    description: 'Single-row newsletter input and button for compact hero usage.',
    tags: ['form', 'newsletter', 'inline'],
  },
  {
    name: 'NewsletterCard',
    description: 'Newsletter signup card with heading, context text, and email input.',
    tags: ['form', 'newsletter', 'card'],
  },
  {
    name: 'LoginForm',
    description: 'Email/password login form with remember me and forgot password.',
    tags: ['form', 'auth', 'login'],
    supabaseRequired: true,
  },
  {
    name: 'RegisterForm',
    description: 'Registration form with name, email, password, confirmation, and terms.',
    tags: ['form', 'auth', 'register'],
    supabaseRequired: true,
  },
  {
    name: 'ForgotPassword',
    description: 'Forgot password form with email capture and return link.',
    tags: ['form', 'auth', 'password-reset'],
    supabaseRequired: true,
  },
  {
    name: 'WaitlistForm',
    description: 'Waitlist capture form with lightweight social-proof details.',
    tags: ['form', 'waitlist', 'email'],
  },
  {
    name: 'SearchBar',
    description: 'Prominent search input with suggestion dropdown support.',
    tags: ['form', 'search', 'autocomplete'],
    supabaseRequired: true,
  },
  {
    name: 'FilterBar',
    description: 'Horizontal filter chips for list and catalog refinement.',
    tags: ['form', 'filters', 'chips'],
    supabaseRequired: true,
  },
  {
    name: 'SurveyQuestion',
    description: 'Single survey question with selectable options and helper text.',
    tags: ['form', 'survey', 'questionnaire'],
  },
  {
    name: 'MultiStepForm',
    description: 'Multi-step form flow with progress and previous/next controls.',
    tags: ['form', 'wizard', 'progress'],
  },
]);
