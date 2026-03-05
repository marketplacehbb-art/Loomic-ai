import { llmManager, type LLMRequest } from '../api/llm/manager.js';
import type { FeatureFlags } from '../config/feature-flags.js';
import { astRewriter, type RewriteResult } from './processor-evolution/ast-rewriter.js';
import { qualityScorer, type QualityScore } from './processor-evolution/quality-scorer.js';
import { styleDNAInjector, type StyleDNA } from './elite-features/style-dna-injector.js';
import { dependencyIntelligence, type DependencyAnalysis } from './elite-features/dependency-intelligence.js';
import { DESIGN_REFERENCE, MICRO_INTERACTIONS, STACK_CONSTRAINT } from '../prompts/designReferences.js';
import { hydratePrompt, inferIndustryFromPrompt, type HydratedContext, type HydrationIndustry } from '../api/hydration.js';
import { INDUSTRY_PROFILES, getIndustryFonts } from '../prompts/industryProfiles.js';
import { INDUSTRY_IMAGES } from '../prompts/imageLibrary.js';
import { SECTION_TEMPLATES, type SectionTemplateKey } from '../templates/sections/index.js';

type SupabaseIntegrationContext = {
  connected?: boolean;
  environment?: 'test' | 'live' | null;
  projectRef?: string | null;
  projectUrl?: string | null;
  hasTestConnection?: boolean;
  hasLiveConnection?: boolean;
} | null | undefined;

type GitHubIntegrationContext = {
  connected?: boolean;
  username?: string | null;
  repoUrl?: string | null;
  lastSync?: string | null;
} | null | undefined;

export interface GenerateInput {
  provider: LLMRequest['provider'];
  generationMode: 'new' | 'edit';
  prompt: string;
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
  currentFiles?: Record<string, string>;
  image?: string;
  knowledgeBase?: Array<{ path: string; content: string }>;
  featureFlags?: Partial<FeatureFlags>;
  signal?: AbortSignal;
  hydratedContext?: HydratedContext | null;
  supabaseIntegration?: SupabaseIntegrationContext;
  githubIntegration?: GitHubIntegrationContext;
  screenshotBase64?: string;
  screenshotMimeType?: string;
}

export interface Node<TInput = GenerateInput, TOutput = unknown> {
  name: string;
  deps: string[];
  run: (resolvedDeps: Record<string, unknown>, input: TInput) => Promise<TOutput>;
}

interface ContextNodeOutput {
  selectedFiles: Record<string, string>;
  selectedPaths: string[];
  totalChars: number;
}

interface TokenBudgetNodeOutput {
  generationMaxTokens: number;
  repairMaxTokens: number;
}

interface StyleDNANodeOutput {
  styleDNA: StyleDNA | null;
  constraints: string[];
}

interface DependencyIntelligenceNodeOutput {
  analysis: DependencyAnalysis | null;
  inferredDependencies: string[];
}

interface GenerationNodeOutput {
  rawCode: string;
  rateLimit?: any;
  effectivePrompt: string;
}

interface HydrationNodeOutput {
  hydratedContext: HydratedContext;
}

interface ASTRewriteNodeOutput {
  code: string;
  rewriteResult: RewriteResult | null;
}

interface QualityGateNodeOutput {
  code: string;
  qualityScore: QualityScore | null;
}

export interface GenerateResult {
  code: string;
  files: Array<{ path: string; content: string }>;
  rateLimit?: any;
  nodeOutputs: Record<string, unknown>;
  metadata: {
    styleDNA?: StyleDNA | null;
    dependencyAnalysis?: DependencyAnalysis | null;
    qualityScore?: QualityScore | null;
    selectedContextPaths: string[];
    hydratedContext?: HydratedContext | null;
  };
}

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' ? (value as Record<string, unknown>) : {};

const inferDepsFromPrompt = (prompt: string): string[] => {
  const lower = String(prompt || '').toLowerCase();
  const deps = new Set<string>();
  if (/chart|analytics|diagram/.test(lower)) deps.add('recharts');
  if (/animation|motion/.test(lower)) deps.add('framer-motion');
  if (/icon|icons|symbol/.test(lower)) deps.add('lucide-react');
  if (/route|routing|navigation/.test(lower)) deps.add('react-router-dom');
  if (/toast|notification/.test(lower)) deps.add('sonner');
  return [...deps];
};

const buildStyleConstraints = (prompt: string): string[] => {
  const lower = String(prompt || '').toLowerCase();
  const constraints: string[] = [];
  if (/lux|elegant|premium|gold/.test(lower)) constraints.push('Design direction: premium, elegant, high contrast accents.');
  if (/minimal|clean/.test(lower)) constraints.push('Design direction: minimal, reduced visual noise.');
  if (/dark/.test(lower)) constraints.push('Theme preference: dark-first palette.');
  if (/mobile|responsive/.test(lower)) constraints.push('Layout preference: mobile-first responsiveness.');
  return constraints;
};

const buildGenerationPrompt = (
  basePrompt: string,
  styleOutput: StyleDNANodeOutput | null,
  depOutput: DependencyIntelligenceNodeOutput | null,
  contextOutput: ContextNodeOutput | null,
  hydrationOutput: HydrationNodeOutput | null
): string => {
  const parts: string[] = [basePrompt.trim()];

  if (hydrationOutput?.hydratedContext) {
    const hydrated = hydrationOutput.hydratedContext;
    const componentHints = Array.isArray(hydrated.componentList) && hydrated.componentList.length > 0
      ? hydrated.componentList.join(', ')
      : 'none';
    const keyContentHints = Array.isArray(hydrated.keyContent) && hydrated.keyContent.length > 0
      ? hydrated.keyContent.join(', ')
      : 'none';
    const inferredIndustry = inferIndustryFromPrompt(`${basePrompt} ${hydrated.intent || ''}`);
    const industryVisualDNA = INDUSTRY_PROFILES[inferredIndustry]?.visualDNA || INDUSTRY_PROFILES.saas.visualDNA;
    const industryFonts = getIndustryFonts(inferredIndustry);
    parts.push(
      `HYDRATION_CONTEXT:\n- intent: ${hydrated.intent}\n- components: ${componentHints}\n- keyContent: ${keyContentHints}\n- needsSupabase: ${hydrated.needsSupabase ? 'yes' : 'no'}\n- colorScheme: ${hydrated.colorScheme}\n- complexity: ${hydrated.complexity}`
    );
    parts.push(
      `INDUSTRY_VISUAL_DNA:\n- industry: ${inferredIndustry}\n- heroSection: ${industryVisualDNA.heroSection}\n- heroHeading: ${industryVisualDNA.heroHeading}\n- heroSubtext: ${industryVisualDNA.heroSubtext}\n- primaryButton: ${industryVisualDNA.primaryButton}\n- secondaryButton: ${industryVisualDNA.secondaryButton}\n- sectionBg: ${industryVisualDNA.sectionBg.join(' | ')}\n- cardStyle: ${industryVisualDNA.cardStyle}\n- accentColor: ${industryVisualDNA.accentColor}\n- badge: ${industryVisualDNA.badge}`
    );
    parts.push(
      `INDUSTRY_TYPOGRAPHY:\n- headingFont: ${industryFonts.heading}\n- bodyFont: ${industryFonts.body}`
    );
  }

  if (styleOutput?.constraints?.length) {
    parts.push(`STYLE_CONSTRAINTS:\n- ${styleOutput.constraints.join('\n- ')}`);
  }

  if (depOutput?.inferredDependencies?.length) {
    parts.push(`DEPENDENCY_HINTS:\n- ${depOutput.inferredDependencies.join('\n- ')}`);
  }

  if (contextOutput) {
    parts.push(
      `CONTEXT_HINTS:\n- selected files: ${contextOutput.selectedPaths.length}\n- total chars: ${contextOutput.totalChars}`
    );
  }

  return parts.filter(Boolean).join('\n\n');
};

const COMPLETENESS_RULES = `COMPLETENESS RULES:
- A landing page MUST have at minimum: Navbar + Hero + Features + CTA + Footer
- A dashboard MUST have: Sidebar + Stats + at least one data section
- An e-commerce page MUST have: Navbar + ProductGrid + Footer
- NEVER generate a page with only 1-2 sections
- Every page must be fully scrollable with multiple distinct sections
- src/App.tsx must import and render ALL sections in logical order`;

const FILE_STRUCTURE_RULES = `FILE STRUCTURE RULES - mandatory for every project:

You MUST generate separate files for every component. Never put everything in App.tsx.

Required file structure:
src/
  App.tsx                          (only imports + renders pages/layout)
  main.tsx                         (entry point, never change this)
  components/
    layout/
      Navbar.tsx                   (navigation component)
      Footer.tsx                   (footer component)
    sections/
      HeroSection.tsx              (hero/banner)
      FeaturesSection.tsx          (features/benefits)
      PricingSection.tsx           (pricing if needed)
      TestimonialsSection.tsx      (social proof if needed)
      CTASection.tsx               (call to action)
      [other sections as needed]
    ui/                            (small reusable components)
      [any small reusable pieces]
  pages/
    HomePage.tsx                   (assembles all sections)
    [other pages if multi-page]
  lib/
    utils.ts                       (cn utility + helpers)
  types/
    index.ts                       (TypeScript interfaces)

App.tsx must look like this:
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import HomePage from './pages/HomePage'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path='/' element={<HomePage />} />
      </Routes>
    </BrowserRouter>
  )
}

HomePage.tsx must look like this:
import Navbar from '../components/layout/Navbar'
import HeroSection from '../components/sections/HeroSection'
import FeaturesSection from '../components/sections/FeaturesSection'
import Footer from '../components/layout/Footer'

export default function HomePage() {
  return (
    <main>
      <Navbar />
      <HeroSection />
      <FeaturesSection />
      <Footer />
    </main>
  )
}

Each section file must:
- Have a single default export
- Be fully self-contained
- Import only from @/components/ui/*, lucide-react, react
- Never import from other section files`;

const ROUTING_RULES = `ROUTING RULES:

Every project with more than 1 page MUST use React Router v6.

Standard routes to generate based on industry:
- Landing page / SaaS: / (home) only - single page with anchor links
- E-commerce: / (home), /products, /product/:id, /cart
- Portfolio: / (home), /work, /about, /contact
- Blog: / (home), /blog, /blog/:slug, /about
- Dashboard: /dashboard, /dashboard/analytics, /dashboard/settings
- Restaurant: / (home) - single page with sections

For multi-page projects, generate ALL page files.

Navbar must use React Router Link component for navigation:
import { Link, useLocation } from 'react-router-dom'

Active link styling:
const { pathname } = useLocation()
const isActive = pathname === href
className={isActive ? 'text-white font-semibold' : 'text-slate-400 hover:text-white'}

Mobile navigation must work with useState toggle.

Smooth scroll for single-page anchor links:
<a href='#features' onClick={(e) => {
  e.preventDefault()
  document.getElementById('features')?.scrollIntoView({ behavior: 'smooth' })
}}>

Add react-router-dom to dependencies automatically for multi-page projects.`;

const INTERACTIVITY_RULES = `INTERACTIVITY RULES - every project must have working functionality:

Contact Forms:
- Use useState for form fields: name, email, message
- Add validation: required fields, email format check
- Show success message after submit (simulate with setTimeout)
- Never use plain HTML forms without React state
Example:
const [form, setForm] = useState({ name: '', email: '', message: '' })
const [submitted, setSubmitted] = useState(false)
const handleSubmit = () => {
  if (!form.email.includes('@')) return
  setSubmitted(true)
}

FAQ/Accordion:
- Use shadcn Accordion component (never static HTML)
- Multiple items, one open at a time

Pricing toggle:
- Monthly/yearly with useState
- Show discounted prices for yearly

Mobile Navigation:
- Hamburger menu with useState open/close
- Smooth slide-down animation

Newsletter signup:
- Email input with useState
- Validation + success state

Image galleries:
- useState for selected image
- Click to expand/lightbox effect

Counters/Stats:
- Use useEffect + setInterval to count up numbers on mount
- e.g. count from 0 to 500 over 2 seconds

Dark/Light mode toggle (if requested):
- useEffect to save to localStorage
- Apply class to document.documentElement

Shopping cart (if ecommerce):
- useState for cart items array
- Add/remove/quantity functions
- Cart count in navbar badge

ALL useState and useEffect must be imported from 'react':
import { useState, useEffect, useRef } from 'react'`;

const MOBILE_FIRST_RULES = `MOBILE-FIRST RULES - strictly enforced:

Breakpoint strategy:
- Default (no prefix) = mobile (320px-767px)
- md: = tablet (768px-1023px)
- lg: = desktop (1024px+)

Grid layouts:
- ALWAYS start with 1 column: grid-cols-1
- Then scale up: grid-cols-1 md:grid-cols-2 lg:grid-cols-3
- NEVER write lg:grid-cols-3 without grid-cols-1 first

Typography scaling:
- ALWAYS scale: text-3xl md:text-5xl lg:text-7xl
- NEVER use lg: font sizes without mobile size first

Spacing scaling:
- Sections: py-12 md:py-20 lg:py-32
- Containers: px-4 md:px-6 lg:px-8

Navigation:
- Desktop nav MUST be hidden on mobile: hidden md:flex
- Mobile hamburger MUST be visible on mobile: flex md:hidden
- Mobile menu must be full-width overlay or slide-down

Images:
- Always use w-full on images
- Aspect ratios: aspect-video or aspect-square for consistency
- object-cover on all images

Flex layouts:
- Stack on mobile: flex-col md:flex-row
- NEVER flex-row without md: prefix unless always side-by-side is intended

Touch targets:
- All buttons minimum: min-h-[44px] min-w-[44px]
- Links in nav: py-3 for touch area

Cards:
- Full width on mobile: w-full
- Grid gap: gap-4 md:gap-6 lg:gap-8

VERIFICATION - before outputting check:
- Every grid starts with grid-cols-1
- Navbar has mobile hamburger menu
- All text has mobile size defined first
- No horizontal overflow on mobile (avoid fixed widths)
- All images are responsive`;

type IndustryFonts = {
  heading: string;
  body: string;
};

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const toGoogleFontToken = (font: string): string => encodeURIComponent(font).replace(/%20/g, '+');

const buildTypographyRules = (fonts: IndustryFonts): string => {
  return `TYPOGRAPHY RULES:
- Heading font: ${fonts.heading} - apply via font-['${fonts.heading}'] Tailwind class
- Body font: ${fonts.body} - already applied via CSS variable
- Heading sizes: h1=text-5xl to text-7xl, h2=text-3xl to text-5xl, h3=text-xl to text-2xl
- Always use font-bold or font-black for hero headlines
- Letter spacing: tracking-tight for large headings, tracking-normal for body
- Line height: leading-tight for headings, leading-relaxed for body text
- Never use default system fonts for headings`;
};

const buildIndexHtmlFontInjectionRule = (fonts: IndustryFonts): string => {
  const headingToken = toGoogleFontToken(fonts.heading);
  const bodyToken = toGoogleFontToken(fonts.body);
  const googleFontsHref = `https://fonts.googleapis.com/css2?family=${headingToken}:wght@400;600;700;900&family=${bodyToken}:wght@400;500;600&display=swap`;
  return `INDEX_HTML_FONT_INJECTION:
Inject the following tags into index.html <head> exactly:
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="${googleFontsHref}" rel="stylesheet">

Inject the following CSS into index.html <style>:
:root {
  --font-heading: '${fonts.heading}', sans-serif;
  --font-body: '${fonts.body}', sans-serif;
}
body { font-family: var(--font-body); }
h1,h2,h3,h4 { font-family: var(--font-heading); }`;
};

type ContentDomain = 'food' | 'beauty' | 'ecommerce' | 'dashboard' | 'blog' | 'saas' | 'generic';

interface DomainProfile {
  fallbackName: string;
  trustLine: string;
  productPrices: [string, string, string, string, string, string];
  heroPrice: string;
  pricingMonthly: [number, number, number];
  pricingYearly: [number, number, number];
  statsRow: [string, string, string, string];
  statsCards: [string, string, string, string];
}

export interface TemplateFallbackContext {
  productName: string;
  intentSummary: string;
  industry: HydrationIndustry;
  colorScheme: 'dark' | 'light' | 'colorful';
  profile: DomainProfile;
}

const DOMAIN_PROFILES: Record<ContentDomain, DomainProfile> = {
  food: {
    fallbackName: 'Bella Pizza',
    trustLine: 'Trusted by 120+ local teams',
    productPrices: ['EUR 12.90', 'EUR 19.90', 'EUR 16.90', 'EUR 11.90', 'EUR 8.90', 'EUR 6.90'],
    heroPrice: 'EUR 22.90',
    pricingMonthly: [29, 79, 199],
    pricingYearly: [23, 63, 159],
    statsRow: ['2.4k', '98.7%', '4.8/5', '37%'],
    statsCards: ['EUR 86k', '2,340', '1,120', '72%'],
  },
  beauty: {
    fallbackName: 'Studio Nova',
    trustLine: 'Trusted by 200+ beauty teams',
    productPrices: ['EUR 49', 'EUR 79', 'EUR 99', 'EUR 39', 'EUR 29', 'EUR 25'],
    heroPrice: 'EUR 89',
    pricingMonthly: [39, 99, 249],
    pricingYearly: [31, 79, 199],
    statsRow: ['4.1k', '99.2%', '4.9/5', '42%'],
    statsCards: ['EUR 128k', '4,120', '1,980', '68%'],
  },
  ecommerce: {
    fallbackName: 'Northstar Shop',
    trustLine: 'Trusted by 500+ teams',
    productPrices: ['EUR 69', 'EUR 129', 'EUR 99', 'EUR 39', 'EUR 29', 'EUR 25'],
    heroPrice: 'EUR 149',
    pricingMonthly: [29, 79, 199],
    pricingYearly: [23, 63, 159],
    statsRow: ['12k+', '99.9%', '4.9/5', '37%'],
    statsCards: ['EUR 186k', '6,920', '2,484', '64%'],
  },
  dashboard: {
    fallbackName: 'Northstar Analytics',
    trustLine: 'Trusted by 1,200+ teams',
    productPrices: ['USD 79', 'USD 129', 'USD 99', 'USD 39', 'USD 29', 'USD 25'],
    heroPrice: 'USD 149',
    pricingMonthly: [49, 129, 299],
    pricingYearly: [39, 103, 239],
    statsRow: ['28k+', '99.95%', '4.9/5', '44%'],
    statsCards: ['USD 428k', '12,420', '4,284', '71%'],
  },
  blog: {
    fallbackName: 'Northstar Journal',
    trustLine: 'Trusted by 800+ teams',
    productPrices: ['USD 39', 'USD 79', 'USD 59', 'USD 29', 'USD 19', 'USD 15'],
    heroPrice: 'USD 99',
    pricingMonthly: [19, 49, 129],
    pricingYearly: [15, 39, 99],
    statsRow: ['8.2k', '99.8%', '4.8/5', '31%'],
    statsCards: ['USD 168k', '8,120', '2,184', '59%'],
  },
  saas: {
    fallbackName: 'Acme Cloud',
    trustLine: 'Trusted by 500+ teams',
    productPrices: ['USD 79', 'USD 129', 'USD 99', 'USD 39', 'USD 29', 'USD 25'],
    heroPrice: 'USD 149',
    pricingMonthly: [19, 49, 129],
    pricingYearly: [15, 39, 99],
    statsRow: ['12k+', '99.9%', '4.9/5', '37%'],
    statsCards: ['USD 128k', '4,920', '1,284', '64%'],
  },
  generic: {
    fallbackName: 'Acme',
    trustLine: 'Trusted by 500+ teams',
    productPrices: ['USD 79', 'USD 129', 'USD 99', 'USD 39', 'USD 29', 'USD 25'],
    heroPrice: 'USD 149',
    pricingMonthly: [19, 49, 129],
    pricingYearly: [15, 39, 99],
    statsRow: ['12k+', '99.9%', '4.9/5', '37%'],
    statsCards: ['USD 128k', '4,920', '1,284', '64%'],
  },
};

const normalizeColorSchemeLabel = (value: string | undefined | null): 'dark' | 'light' | 'colorful' => {
  const lower = String(value || '').toLowerCase();
  if (/\blight|white|clean|minimal\b/.test(lower)) return 'light';
  if (/\bcolorful|vibrant|bold\b/.test(lower)) return 'colorful';
  return 'dark';
};

const detectIndustry = (prompt: string, hydratedContext: HydratedContext | null | undefined): HydrationIndustry => {
  return inferIndustryFromPrompt(`${prompt} ${hydratedContext?.intent || ''}`);
};

const ROUTER_DEP_NAME = 'react-router-dom';
const ROUTER_DEP_VERSION = '^6.28.0';
const SUPABASE_DEP_NAME = '@supabase/supabase-js';
const SUPABASE_DEP_VERSION = '^2.95.3';
const ROUTING_MULTI_PAGE_INDUSTRIES = new Set<HydrationIndustry>([
  'ecommerce',
  'portfolio',
  'education',
  'dashboard',
]);
const ROUTING_SINGLE_PAGE_INDUSTRIES = new Set<HydrationIndustry>([
  'restaurant',
  'saas',
]);

const needsRoutingProject = (
  prompt: string,
  hydratedContext: HydratedContext | null | undefined,
  currentFiles: Record<string, string> | undefined
): boolean => {
  const industry = detectIndustry(prompt, hydratedContext);
  if (ROUTING_MULTI_PAGE_INDUSTRIES.has(industry)) return true;

  const lower = `${prompt} ${hydratedContext?.intent || ''}`.toLowerCase();
  const explicitMultiPageSignal = /\b(multi[-\s]?page|routes?|pages?|\/products\b|\/product\/:id\b|\/cart\b|\/work\b|\/blog\b|\/about\b|\/contact\b|\/dashboard\b|analytics|settings)\b/.test(lower);
  if (explicitMultiPageSignal) return true;

  const existingPageFiles = Object.keys(currentFiles || {})
    .map((path) => String(path || '').replace(/\\/g, '/'))
    .filter((path) => path.startsWith('src/pages/') && /\.(tsx|ts|jsx|js)$/.test(path));
  if (existingPageFiles.length > 1) return true;

  if (ROUTING_SINGLE_PAGE_INDUSTRIES.has(industry)) return false;
  return false;
};

const isSupabaseConnected = (integration: SupabaseIntegrationContext): boolean =>
  Boolean(integration && typeof integration === 'object' && integration.connected);

const buildSupabaseSystemPromptBlock = (integration: SupabaseIntegrationContext): string => {
  if (!isSupabaseConnected(integration)) return '';
  const projectUrl =
    integration && typeof integration === 'object' && typeof integration.projectUrl === 'string' && integration.projectUrl.trim().length > 0
      ? integration.projectUrl.trim()
      : 'configured via VITE_SUPABASE_URL';

  return `SUPABASE INTEGRATION - this project uses Supabase:
Project URL: ${projectUrl}

When generating code that needs data/auth:
- Import supabase client: import { supabase } from '../lib/supabase'
- Always generate src/lib/supabase.ts:
  import { createClient } from '@supabase/supabase-js'
  export const supabase = createClient(
    import.meta.env.VITE_SUPABASE_URL,
    import.meta.env.VITE_SUPABASE_ANON_KEY
  )

Auth patterns to use:
- Sign up: await supabase.auth.signUp({ email, password })
- Sign in: await supabase.auth.signInWithPassword({ email, password })
- Sign out: await supabase.auth.signOut()
- Get user: supabase.auth.getUser()
- Auth state: supabase.auth.onAuthStateChange(...)

Database patterns:
- Fetch: const { data } = await supabase.from('table').select('*')
- Insert: await supabase.from('table').insert({ ... })
- Update: await supabase.from('table').update({ ... }).eq('id', id)
- Delete: await supabase.from('table').delete().eq('id', id)
- Realtime: supabase.channel('table').on('postgres_changes', ...).subscribe()

Always add @supabase/supabase-js to dependencies.
Always generate .env.example with VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.`;
};

const buildGitHubSystemPromptBlock = (integration: GitHubIntegrationContext): string => {
  const connected = Boolean(integration && typeof integration === 'object' && integration.connected);
  if (!connected) return '';

  const username =
    integration && typeof integration === 'object' && typeof integration.username === 'string'
      ? integration.username.trim()
      : '';
  const repoUrl =
    integration && typeof integration === 'object' && typeof integration.repoUrl === 'string'
      ? integration.repoUrl.trim()
      : '';

  return `GITHUB INTEGRATION - this project is synced with GitHub:
- connected: yes
- owner: ${username || 'current GitHub user'}
- repository: ${repoUrl || 'set during push'}

Always generate a complete README.md with:
- Project title and description
- Tech stack used
- Installation: npm install
- Development: npm run dev
- Build: npm run build`;
};

const buildScreenshotSystemPromptBlock = (enabled: boolean): string => {
  if (!enabled) return '';
  return `You are rebuilding a UI from a screenshot.
Rules:
- Match the layout exactly (grid, flex, positioning)
- Match colors as closely as possible with Tailwind classes
- Match typography sizes and weights
- Preserve all visible text content from the screenshot
- Use shadcn/ui components where appropriate
- Make it fully responsive
- Output complete multi-file structure as always`;
};

const mapIndustryToContentDomain = (industry: HydrationIndustry): ContentDomain => {
  if (industry === 'restaurant') return 'food';
  if (industry === 'ecommerce') return 'ecommerce';
  if (industry === 'dashboard') return 'dashboard';
  if (industry === 'fitness' || industry === 'wedding' || industry === 'photography') return 'beauty';
  if (industry === 'startup') return 'dashboard';
  if (industry === 'education') return 'blog';
  return 'saas';
};

const toTitleCase = (value: string): string =>
  value
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ');

const extractProductName = (prompt: string, hydratedContext: HydratedContext | null | undefined): string => {
  const source = String(prompt || '').trim();
  const candidates: RegExp[] = [
    /(?:for|f(?:u|ue|\u00fc)r|about|named|called)\s+([a-z0-9][a-z0-9&\-\s]{2,40})/i,
    /([a-z0-9][a-z0-9&\-\s]{2,40})\s+(?:website|webseite|landing page|landing|shop|store|dashboard)/i,
  ];
  const stopWords = /\b(website|webseite|landing|page|seite|app|shop|store|dashboard|with|mit|and|und)\b/gi;

  for (const pattern of candidates) {
    const match = source.match(pattern);
    const rawCandidate = String(match?.[1] || '').trim();
    if (!rawCandidate) continue;
    const cleaned = rawCandidate.replace(stopWords, ' ').replace(/\s+/g, ' ').trim();
    if (cleaned.length >= 2) return toTitleCase(cleaned);
  }

  const fromIntent = String(hydratedContext?.intent || '').trim().split(/\s+/).slice(0, 2).join(' ');
  if (fromIntent) return toTitleCase(fromIntent);
  return 'Acme';
};

const summarizeIntent = (value: string, max = 130): string => {
  const normalized = String(value || '').trim().replace(/\s+/g, ' ');
  if (!normalized) return 'A polished product experience designed for strong conversion and clarity.';
  if (normalized.length <= max) return normalized;
  return `${normalized.slice(0, Math.max(20, max - 3)).trimEnd()}...`;
};

export const buildTemplateFallbackContext = (
  prompt: string,
  hydratedContext: HydratedContext | null | undefined
): TemplateFallbackContext => {
  const industry = detectIndustry(prompt, hydratedContext);
  const domain = mapIndustryToContentDomain(industry);
  const profile = DOMAIN_PROFILES[domain];
  const extractedName = extractProductName(prompt, hydratedContext);
  const productName = extractedName && extractedName.length >= 2 ? extractedName : profile.fallbackName;

  return {
    productName,
    intentSummary: summarizeIntent(hydratedContext?.intent || prompt),
    industry,
    colorScheme: normalizeColorSchemeLabel(hydratedContext?.colorScheme || 'dark'),
    profile,
  };
};

export const personalizeTemplateCode = (
  code: string,
  context: TemplateFallbackContext
): string => {
  let next = String(code || '');
  const colorScheme = context.colorScheme;

  next = next.replace(/\bAcme\b/g, context.productName);
  next = next.replace(/Trusted by 500\+ teams/gi, context.profile.trustLine);

  const genericCopyPatterns: RegExp[] = [
    /Your subtitle goes here\. Keep it short and compelling\./gi,
    /A curated set of capabilities designed for modern product teams\./gi,
    /Everything you need to know before you get started\./gi,
    /Ship polished products faster with consistent section patterns\./gi,
    /Blend polished sections, strong copy, and conversion-first UX in one workflow\./gi,
    /A minimal, conversion-first foundation for teams who want speed without sacrificing quality\./gi,
    /See what customers say about their results\./gi,
    /Start with a polished foundation and customize every section for your brand\./gi,
    /Build something amazing/gi,
  ];
  for (const pattern of genericCopyPatterns) {
    next = next.replace(pattern, context.intentSummary);
  }

  const statsRowDefaults = ['12k+', '99.9%', '4.9/5', '37%'] as const;
  const statsCardDefaults = ['$128k', '4,920', '1,284', '64%'] as const;
  const productPriceDefaults = ['$79', '$129', '$99', '$39', '$29', '$25'] as const;
  next = next.replace(/\$149/g, context.profile.heroPrice);
  productPriceDefaults.forEach((token, index) => {
    next = next.replace(new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), context.profile.productPrices[index]);
  });
  statsRowDefaults.forEach((token, index) => {
    next = next.replace(new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), context.profile.statsRow[index]);
  });
  statsCardDefaults.forEach((token, index) => {
    next = next.replace(new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), context.profile.statsCards[index]);
  });

  next = next.replace(/monthly:\s*19/g, `monthly: ${context.profile.pricingMonthly[0]}`);
  next = next.replace(/monthly:\s*49/g, `monthly: ${context.profile.pricingMonthly[1]}`);
  next = next.replace(/monthly:\s*129/g, `monthly: ${context.profile.pricingMonthly[2]}`);
  next = next.replace(/yearly:\s*15/g, `yearly: ${context.profile.pricingYearly[0]}`);
  next = next.replace(/yearly:\s*39/g, `yearly: ${context.profile.pricingYearly[1]}`);
  next = next.replace(/yearly:\s*99/g, `yearly: ${context.profile.pricingYearly[2]}`);

  if (colorScheme === 'light') {
    next = next.replace(
      /bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900/g,
      'bg-gradient-to-br from-white via-slate-100 to-purple-100'
    );
    next = next.replace(/\btext-white\b/g, 'text-slate-900');
    next = next.replace(/\btext-slate-300\b/g, 'text-slate-600');
  } else if (colorScheme === 'colorful') {
    next = next.replace(
      /bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900/g,
      'bg-gradient-to-br from-fuchsia-950 via-purple-900 to-indigo-950'
    );
    next = next.replace(/\btext-purple-400\b/g, 'text-fuchsia-300');
  }

  return next;
};

const personalizeTemplateReferences = (
  references: Array<{ key: SectionTemplateKey; code: string }>,
  prompt: string,
  hydratedContext: HydratedContext | null | undefined
): Array<{ key: SectionTemplateKey; code: string }> => {
  if (!references.length) return references;
  const context = buildTemplateFallbackContext(prompt, hydratedContext);

  return references.map((entry) => {
    return { ...entry, code: personalizeTemplateCode(entry.code, context) };
  });
};

const selectSectionTemplateReferences = (
  hydratedContext: HydratedContext | null | undefined
): Array<{ key: SectionTemplateKey; code: string }> => {
  const componentHints = Array.isArray(hydratedContext?.componentList)
    ? hydratedContext.componentList
    : [];
  if (componentHints.length === 0) return [];

  const rawHints = componentHints
    .map((value) => String(value || '').toLowerCase().trim())
    .filter(Boolean);
  const compactHints = rawHints.map((value) => value.replace(/[^a-z0-9]+/g, ''));
  const colorScheme = String(hydratedContext?.colorScheme || '').toLowerCase();
  const isLightScheme = /\blight|white|minimal|clean|neutral\b/.test(colorScheme);
  const isDarkScheme = /\bdark|night|slate|midnight\b/.test(colorScheme);

  const hasHint = (...keywords: string[]): boolean => {
    return keywords.some((keyword) => {
      const rawNeedle = keyword.toLowerCase();
      const compactNeedle = rawNeedle.replace(/[^a-z0-9]+/g, '');
      return rawHints.some((hint) => hint.includes(rawNeedle))
        || compactHints.some((hint) => hint.includes(compactNeedle));
    });
  };

  const pickHeroTemplate = (): SectionTemplateKey => {
    if (isLightScheme) return 'HeroMinimal';
    if (isDarkScheme) return 'HeroWithVideo';
    return 'HeroWithGradient';
  };

  const pickFeatureTemplate = (): SectionTemplateKey => {
    if (isDarkScheme) return 'BentoGrid';
    if (isLightScheme) return 'FeatureAlternating';
    return 'FeatureGrid';
  };

  const pickStatsTemplate = (dashboardRequested: boolean): SectionTemplateKey => {
    if (dashboardRequested) return 'StatsCards';
    return isDarkScheme ? 'StatsRow' : 'StatsCards';
  };

  const pickCtaTemplate = (): SectionTemplateKey => (isLightScheme ? 'CTASimple' : 'CTABanner');

  const maxReferences = 3;
  const selected: SectionTemplateKey[] = [];
  const pushTemplate = (...keys: SectionTemplateKey[]) => {
    for (const key of keys) {
      if (selected.length >= maxReferences) return;
      if (!selected.includes(key)) selected.push(key);
    }
  };

  const hasDashboard = hasHint('dashboard', 'admin', 'analyticspanel');

  if (hasDashboard) pushTemplate('DashboardLayout', 'StatsCards');
  if (hasHint('hero')) pushTemplate(pickHeroTemplate());
  if (hasHint('navbar', 'navigation', 'nav', 'menu', 'header')) pushTemplate('NavbarSimple');
  if (hasHint('features', 'feature', 'benefit', 'grid')) pushTemplate(pickFeatureTemplate());
  if (hasHint('pricing', 'plan', 'tier')) pushTemplate('PricingCards');
  if (hasHint('testimonials', 'testimonial', 'review')) pushTemplate('TestimonialsGrid');
  if (hasHint('faq', 'questions', 'question')) pushTemplate('FAQAccordion');
  if (hasHint('footer')) pushTemplate('FooterMultiColumn');
  if (hasHint('stats', 'metrics', 'metric')) pushTemplate(pickStatsTemplate(hasDashboard));
  if (hasHint('how it works', 'steps', 'step')) pushTemplate('HowItWorks');
  if (hasHint('cta', 'call to action')) pushTemplate(pickCtaTemplate());
  if (hasHint('logos', 'logo', 'trusted', 'trust')) pushTemplate('LogoCloud');
  if (hasHint('team', 'about team')) pushTemplate('TeamGrid');
  if (hasHint('blog', 'article', 'content')) pushTemplate('BlogGrid');
  if (hasHint('contact', 'contactform', 'reach us')) pushTemplate('ContactSection');
  if (hasHint('login', 'auth', 'signin', 'signup', 'register')) pushTemplate('LoginPage');
  if (hasHint('products', 'product', 'shop', 'store', 'ecommerce')) pushTemplate('ProductGrid');
  if (hasHint('404', 'notfound', 'not found')) pushTemplate('NotFoundPage');

  return selected.slice(0, maxReferences).map((key) => ({ key, code: SECTION_TEMPLATES[key] }));
};

const appendSectionTemplateReferencesToPrompt = (
  prompt: string,
  references: Array<{ key: SectionTemplateKey; code: string }>
): string => {
  if (!references.length) return prompt;
  const referenceBlock = references
    .map((entry) => `// TEMPLATE: ${entry.key}\n${entry.code}`)
    .join('\n\n');
  return `${prompt}\n\nUse these exact component patterns as reference for your implementation:\n\n${referenceBlock}`;
};

const ensureStackConstraintInSystemPrompt = (
  baseSystemPrompt: string | undefined,
  hydratedContext: HydratedContext | null | undefined,
  prompt: string,
  supabaseIntegration?: SupabaseIntegrationContext,
  githubIntegration?: GitHubIntegrationContext,
  screenshotMode: boolean = false
): string => {
  const normalized = String(baseSystemPrompt || '').trim();
  const withStack = normalized.includes('You generate EXCLUSIVELY:')
    ? normalized
    : (normalized ? `${STACK_CONSTRAINT}\n\n${normalized}` : STACK_CONSTRAINT);

  const colorScheme = normalizeColorSchemeLabel(hydratedContext?.colorScheme || 'dark');
  const colorSchemeRule = `COLOR SCHEME: ${colorScheme} - apply consistently to ALL sections on the page.`;
  const industry = detectIndustry(prompt, hydratedContext);
  const industryFonts = getIndustryFonts(industry);
  const typographyRules = buildTypographyRules(industryFonts);
  const indexHtmlFontInjectionRule = buildIndexHtmlFontInjectionRule(industryFonts);
  const industryImages = INDUSTRY_IMAGES[industry] || INDUSTRY_IMAGES.saas;
  const finalChecklistHeader = 'FINAL CHECKLIST - before outputting, verify:';
  const finalChecklist = [
    finalChecklistHeader,
    '- Hero has real compelling headline specific to the product (NOT generic)',
    '- Every section background alternates (dark/light/dark or light/dark/light)',
    '- At least 4-5 full sections on every page (never less)',
    `- Real image URLs from this list are used: ${industryImages.join(', ')}`,
    '- Every card has hover state',
    '- All buttons have active:scale-95 transition',
    '- Color scheme is 100% consistent (no mixing of warm and cool accents)',
    "- No placeholder text anywhere (no 'Lorem ipsum', no 'Your title here')",
    '- Mobile responsive (all grids use responsive prefixes md: lg:)',
    '- Page looks like it costs $5000+ to design',
  ].join('\n');

  const includesCompleteness = withStack.includes('COMPLETENESS RULES:');
  const includesColorScheme = withStack.includes('COLOR SCHEME:');
  const includesFileStructure = withStack.includes('FILE STRUCTURE RULES - mandatory for every project:');
  const includesRoutingRules = withStack.includes('ROUTING RULES:');
  const includesInteractivityRules = withStack.includes('INTERACTIVITY RULES - every project must have working functionality:');
  const includesMobileFirstRules = withStack.includes('MOBILE-FIRST RULES - strictly enforced:');
  const includesTypographyRules = withStack.includes('TYPOGRAPHY RULES:');
  const includesIndexHtmlFontInjection = withStack.includes('INDEX_HTML_FONT_INJECTION:');
  const includesSupabaseBlock = withStack.includes('SUPABASE INTEGRATION - this project uses Supabase:');
  const includesGitHubBlock = withStack.includes('GITHUB INTEGRATION - this project is synced with GitHub:');
  const includesScreenshotBlock = withStack.includes('You are rebuilding a UI from a screenshot.');
  const supabaseBlock = buildSupabaseSystemPromptBlock(supabaseIntegration);
  const githubBlock = buildGitHubSystemPromptBlock(githubIntegration);
  const screenshotBlock = buildScreenshotSystemPromptBlock(screenshotMode);
  const withoutChecklist = withStack.replace(
    new RegExp(`${escapeRegExp(finalChecklistHeader)}[\\s\\S]*$`, 'm'),
    ''
  ).trim();

  if (
    includesCompleteness &&
    includesColorScheme &&
    includesFileStructure &&
    includesRoutingRules &&
      includesInteractivityRules &&
      includesMobileFirstRules &&
      includesTypographyRules &&
      includesIndexHtmlFontInjection &&
      (includesSupabaseBlock || !supabaseBlock) &&
      (includesGitHubBlock || !githubBlock) &&
      (includesScreenshotBlock || !screenshotBlock)
  ) {
    return `${withoutChecklist}\n\n${finalChecklist}`;
  }

  const blocks = [
    withoutChecklist,
    COMPLETENESS_RULES,
    FILE_STRUCTURE_RULES,
    ROUTING_RULES,
    INTERACTIVITY_RULES,
    MOBILE_FIRST_RULES,
    colorSchemeRule,
    typographyRules,
    indexHtmlFontInjectionRule,
    supabaseBlock,
    githubBlock,
    screenshotBlock,
    finalChecklist,
  ].filter(Boolean);
  return blocks.join('\n\n');
};

const injectDesignReferenceIntoPrompt = (userPrompt: string): string => {
  const normalizedPrompt = String(userPrompt || '').trim();
  const designBlock = `DESIGN_REFERENCE:\n${DESIGN_REFERENCE}\n\nMICRO_INTERACTIONS:\n${MICRO_INTERACTIONS}`;
  if (!normalizedPrompt) {
    return designBlock;
  }
  if (normalizedPrompt.includes('DESIGN_REFERENCE:') && normalizedPrompt.includes('MICRO_INTERACTIONS:')) {
    return normalizedPrompt;
  }
  return `${designBlock}\n\nUSER_PROMPT:\n${normalizedPrompt}`;
};

const selectContextFiles = (files: Record<string, string> | undefined): ContextNodeOutput => {
  if (!files || Object.keys(files).length === 0) {
    return {
      selectedFiles: {},
      selectedPaths: [],
      totalChars: 0,
    };
  }

  const entries = Object.entries(files);
  const scorePath = (path: string): number => {
    const normalized = path.replace(/\\/g, '/');
    if (normalized === 'src/App.tsx') return 1000;
    if (normalized === 'src/main.tsx') return 900;
    if (normalized.startsWith('src/components/sections/')) return 800;
    if (normalized.startsWith('src/components/')) return 700;
    if (normalized.startsWith('src/pages/')) return 650;
    if (normalized.startsWith('src/')) return 500;
    return 100;
  };

  const selectedEntries = entries
    .sort((a, b) => scorePath(b[0]) - scorePath(a[0]))
    .slice(0, 12);

  const selectedFiles = selectedEntries.reduce<Record<string, string>>((acc, [path, content]) => {
    acc[path] = content;
    return acc;
  }, {});

  const totalChars = selectedEntries.reduce((sum, [, content]) => sum + content.length, 0);
  return {
    selectedFiles,
    selectedPaths: selectedEntries.map(([path]) => path),
    totalChars,
  };
};

const createContextNode = (): Node<GenerateInput, ContextNodeOutput> => ({
  name: 'ContextNode',
  deps: [],
  run: async (_resolvedDeps, input) => selectContextFiles(input.currentFiles),
});

const createTokenBudgetNode = (): Node<GenerateInput, TokenBudgetNodeOutput> => ({
  name: 'TokenBudgetNode',
  deps: [],
  run: async (_resolvedDeps, input) => {
    const generationMaxTokens = Math.max(256, Number(input.maxTokens) || 1800);
    return {
      generationMaxTokens,
      repairMaxTokens: Math.max(256, Math.floor(generationMaxTokens / 2)),
    };
  },
});

const createHydrationNode = (): Node<GenerateInput, HydrationNodeOutput> => ({
  name: 'HydrationNode',
  deps: [],
  run: async (_resolvedDeps, input) => {
    if (input.hydratedContext) {
      return { hydratedContext: input.hydratedContext };
    }
    const hydratedContext = await hydratePrompt(input.prompt, input.currentFiles || {});
    return { hydratedContext };
  },
});

const createStyleDNANode = (): Node<GenerateInput, StyleDNANodeOutput> => ({
  name: 'StyleDNANode',
  deps: [],
  run: async (_resolvedDeps, input) => {
    const styleEnabled = Boolean(input.featureFlags?.phase3?.styleDNA);
    const constraints = buildStyleConstraints(input.prompt);
    if (!styleEnabled || !input.currentFiles || Object.keys(input.currentFiles).length === 0) {
      return {
        styleDNA: null,
        constraints,
      };
    }

    const styleDNA = await styleDNAInjector.extractStyleDNA(input.currentFiles);
    return {
      styleDNA,
      constraints,
    };
  },
});

const createDependencyIntelligenceNode = (): Node<GenerateInput, DependencyIntelligenceNodeOutput> => ({
  name: 'DependencyIntelligenceNode',
  deps: [],
  run: async (_resolvedDeps, input) => {
    const routingRequired = needsRoutingProject(input.prompt, input.hydratedContext || null, input.currentFiles);
    const supabaseConnected = isSupabaseConnected(input.supabaseIntegration);
    const supabaseHintedByHydration = Boolean(input.hydratedContext?.needsSupabase);
    const supabaseDependencyRequired = supabaseConnected || supabaseHintedByHydration;
    const fromPromptSet = new Set<string>(inferDepsFromPrompt(input.prompt));
    if (routingRequired) {
      fromPromptSet.add(ROUTER_DEP_NAME);
      fromPromptSet.add(`${ROUTER_DEP_NAME}@${ROUTER_DEP_VERSION}`);
    }
    if (supabaseDependencyRequired) {
      fromPromptSet.add(SUPABASE_DEP_NAME);
      fromPromptSet.add(`${SUPABASE_DEP_NAME}@${SUPABASE_DEP_VERSION}`);
    }
    const fromPrompt = [...fromPromptSet];
    const sourceFiles = input.currentFiles || {};
    const primaryFile =
      sourceFiles['src/App.tsx'] ||
      Object.entries(sourceFiles).find(([path]) => /\.(tsx|ts|jsx|js)$/.test(path))?.[1] ||
      '';

    if (!primaryFile) {
      return {
        analysis: null,
        inferredDependencies: fromPrompt,
      };
    }

    const analysis = await dependencyIntelligence.analyze(primaryFile, 'App.tsx');
    if (routingRequired) {
      const hasRouterDep = analysis.dependencies.some((dep) => dep.name === ROUTER_DEP_NAME);
      if (!hasRouterDep) {
        analysis.dependencies.push({
          name: ROUTER_DEP_NAME,
          version: ROUTER_DEP_VERSION,
          reason: 'Multi-page routing required by project route rules',
          category: 'routing',
        });
        analysis.recommendations.push({
          action: 'add',
          dependency: `${ROUTER_DEP_NAME}@${ROUTER_DEP_VERSION}`,
          reason: 'Auto-added for React Router v6 multi-page support',
        });
      }
    }
    if (supabaseDependencyRequired) {
      const hasSupabaseDep = analysis.dependencies.some((dep) => dep.name === SUPABASE_DEP_NAME);
      if (!hasSupabaseDep) {
        analysis.dependencies.push({
          name: SUPABASE_DEP_NAME,
          version: SUPABASE_DEP_VERSION,
          reason: supabaseConnected
            ? 'Project has an active Supabase integration'
            : 'Hydration detected Supabase-related auth/data intent',
          category: 'data',
        });
        analysis.recommendations.push({
          action: 'add',
          dependency: `${SUPABASE_DEP_NAME}@${SUPABASE_DEP_VERSION}`,
          reason: 'Auto-added for Supabase client generation patterns',
        });
      }
    }
    const merged = new Set<string>([
      ...fromPrompt,
      ...analysis.dependencies.map((dep) => dep.name),
    ]);
    if (routingRequired) {
      merged.add(`${ROUTER_DEP_NAME}@${ROUTER_DEP_VERSION}`);
    }
    if (supabaseDependencyRequired) {
      merged.add(`${SUPABASE_DEP_NAME}@${SUPABASE_DEP_VERSION}`);
    }

    return {
      analysis,
      inferredDependencies: [...merged],
    };
  },
});

const createGenerationNode = (): Node<GenerateInput, GenerationNodeOutput> => ({
  name: 'GenerationNode',
  deps: ['ContextNode', 'TokenBudgetNode', 'StyleDNANode', 'DependencyIntelligenceNode'],
  run: async (resolvedDeps, input) => {
    const contextOutput = asRecord(resolvedDeps.ContextNode) as unknown as ContextNodeOutput;
    const tokenBudgetOutput = asRecord(resolvedDeps.TokenBudgetNode) as unknown as TokenBudgetNodeOutput;
    const styleOutput = asRecord(resolvedDeps.StyleDNANode) as unknown as StyleDNANodeOutput;
    const depOutput = asRecord(resolvedDeps.DependencyIntelligenceNode) as unknown as DependencyIntelligenceNodeOutput;
    const hydrationOutput = asRecord(resolvedDeps.HydrationNode) as unknown as HydrationNodeOutput;

    const resolvedHydrationContext =
      hydrationOutput?.hydratedContext || input.hydratedContext || null;

    const effectivePromptBase = buildGenerationPrompt(
      input.prompt,
      styleOutput || null,
      depOutput || null,
      contextOutput || null,
      resolvedHydrationContext
        ? { hydratedContext: resolvedHydrationContext }
        : null
    );
    const selectedTemplateReferences = personalizeTemplateReferences(
      selectSectionTemplateReferences(resolvedHydrationContext),
      input.prompt,
      resolvedHydrationContext
    );
    const effectivePrompt = appendSectionTemplateReferencesToPrompt(
      effectivePromptBase,
      selectedTemplateReferences
    );
    const effectiveSystemPrompt = ensureStackConstraintInSystemPrompt(
      input.systemPrompt,
      resolvedHydrationContext,
      input.prompt,
      input.supabaseIntegration,
      input.githubIntegration,
      Boolean(input.screenshotBase64)
    );
    const promptWithDesignReference = injectDesignReferenceIntoPrompt(effectivePrompt);

    const response = await llmManager.generate({
      provider: input.provider,
      generationMode: input.generationMode,
      prompt: promptWithDesignReference,
      systemPrompt: effectiveSystemPrompt,
      temperature: input.temperature ?? 0.7,
      maxTokens: tokenBudgetOutput?.generationMaxTokens || input.maxTokens || 1800,
      stream: false,
      currentFiles: contextOutput?.selectedFiles || input.currentFiles,
      image: input.image,
      screenshotBase64: input.screenshotBase64,
      screenshotMimeType: input.screenshotMimeType,
      knowledgeBase: input.knowledgeBase,
      featureFlags: input.featureFlags,
      signal: input.signal,
    });

    if (typeof response === 'object' && response && 'content' in response && !('getReader' in response)) {
      return {
        rawCode: String((response as any).content || ''),
        rateLimit: (response as any).rateLimit,
        effectivePrompt: promptWithDesignReference,
      };
    }

    if (typeof response === 'string') {
      return {
        rawCode: response,
        effectivePrompt: promptWithDesignReference,
      };
    }

    throw new Error('LLM returned unexpected response format');
  },
});

const createFastGenerationNode = (): Node<GenerateInput, GenerationNodeOutput> => ({
  name: 'GenerationNode',
  deps: ['TokenBudgetNode', 'HydrationNode'],
  run: async (resolvedDeps, input) => {
    const tokenBudgetOutput = asRecord(resolvedDeps.TokenBudgetNode) as unknown as TokenBudgetNodeOutput;
    const hydrationOutput = asRecord(resolvedDeps.HydrationNode) as unknown as HydrationNodeOutput;
    const effectivePrompt = buildGenerationPrompt(
      input.prompt,
      null,
      null,
      null,
      hydrationOutput?.hydratedContext
        ? hydrationOutput
        : (input.hydratedContext ? { hydratedContext: input.hydratedContext } : null)
    );
    const resolvedHydrationContext = hydrationOutput?.hydratedContext || input.hydratedContext || null;
    const effectiveSystemPrompt = ensureStackConstraintInSystemPrompt(
      input.systemPrompt,
      resolvedHydrationContext,
      input.prompt,
      input.supabaseIntegration,
      input.githubIntegration,
      Boolean(input.screenshotBase64)
    );
    const promptWithDesignReference = injectDesignReferenceIntoPrompt(effectivePrompt);

    const response = await llmManager.generate({
      provider: input.provider,
      generationMode: input.generationMode,
      prompt: promptWithDesignReference,
      systemPrompt: effectiveSystemPrompt,
      temperature: input.temperature ?? 0.7,
      maxTokens: tokenBudgetOutput?.generationMaxTokens || input.maxTokens || 1800,
      stream: false,
      currentFiles: input.currentFiles,
      image: input.image,
      screenshotBase64: input.screenshotBase64,
      screenshotMimeType: input.screenshotMimeType,
      knowledgeBase: input.knowledgeBase,
      featureFlags: input.featureFlags,
      signal: input.signal,
    });

    if (typeof response === 'object' && response && 'content' in response && !('getReader' in response)) {
      return {
        rawCode: String((response as any).content || ''),
        rateLimit: (response as any).rateLimit,
        effectivePrompt: promptWithDesignReference,
      };
    }

    if (typeof response === 'string') {
      return {
        rawCode: response,
        effectivePrompt: promptWithDesignReference,
      };
    }

    throw new Error('LLM returned unexpected response format');
  },
});

const createASTRewriteNode = (): Node<GenerateInput, ASTRewriteNodeOutput> => ({
  name: 'ASTRewriteNode',
  deps: ['GenerationNode'],
  run: async (resolvedDeps, input) => {
    const generationOutput = asRecord(resolvedDeps.GenerationNode) as unknown as GenerationNodeOutput;
    const sourceCode = String(generationOutput?.rawCode || '');
    if (!sourceCode) {
      throw new Error('GenerationNode returned empty code');
    }

    const astRewriteEnabled = Boolean(input.featureFlags?.phase2?.astRewrite);
    if (!astRewriteEnabled) {
      return {
        code: sourceCode,
        rewriteResult: null,
      };
    }

    const rewriteResult = await astRewriter.rewrite(sourceCode, 'App.tsx');
    return {
      code: rewriteResult.code || sourceCode,
      rewriteResult,
    };
  },
});

const createQualityGateNode = (): Node<GenerateInput, QualityGateNodeOutput> => ({
  name: 'QualityGateNode',
  deps: ['ASTRewriteNode'],
  run: async (resolvedDeps, input) => {
    const astOutput = asRecord(resolvedDeps.ASTRewriteNode) as unknown as ASTRewriteNodeOutput;
    const sourceCode = String(astOutput?.code || '');
    if (!sourceCode) {
      throw new Error('ASTRewriteNode returned empty code');
    }

    const qualityEnabled = Boolean(input.featureFlags?.phase2?.qualityScoring);
    if (!qualityEnabled) {
      return {
        code: sourceCode,
        qualityScore: null,
      };
    }

    const qualityScore = await qualityScorer.score(sourceCode, 'App.tsx');
    return {
      code: sourceCode,
      qualityScore,
    };
  },
});

export function createDefaultNodes(): Node[] {
  return [
    createContextNode(),
    createTokenBudgetNode(),
    createStyleDNANode(),
    createDependencyIntelligenceNode(),
    createGenerationNode(),
    createASTRewriteNode(),
    createQualityGateNode(),
  ];
}

export function createFastPathNodes(): Node[] {
  return [
    createTokenBudgetNode(),
    createHydrationNode(),
    createFastGenerationNode(),
    createASTRewriteNode(),
  ];
}

export async function runNodeGraph(nodes: Node[], input: GenerateInput): Promise<GenerateResult> {
  if (!Array.isArray(nodes) || nodes.length === 0) {
    throw new Error('NodeGraph requires at least one node.');
  }

  const nodeMap = new Map<string, Node>();
  for (const node of nodes) {
    if (!node?.name || typeof node.name !== 'string') {
      throw new Error('NodeGraph node is missing a valid name.');
    }
    if (nodeMap.has(node.name)) {
      throw new Error(`Duplicate node name in NodeGraph: ${node.name}`);
    }
    nodeMap.set(node.name, node);
  }

  for (const node of nodes) {
    for (const dep of node.deps || []) {
      if (!nodeMap.has(dep)) {
        throw new Error(`Node "${node.name}" depends on missing node "${dep}"`);
      }
    }
  }

  const resolved = new Map<string, unknown>();
  const pending = new Set<string>(nodeMap.keys());

  while (pending.size > 0) {
    const ready = [...pending].filter((nodeName) => {
      const node = nodeMap.get(nodeName)!;
      return (node.deps || []).every((depName) => resolved.has(depName));
    });

    if (ready.length === 0) {
      throw new Error(`NodeGraph deadlock detected. Unresolved nodes: ${[...pending].join(', ')}`);
    }

    const batch = await Promise.all(
      ready.map(async (nodeName) => {
        const node = nodeMap.get(nodeName)!;
        const resolvedDeps: Record<string, unknown> = {};
        (node.deps || []).forEach((depName) => {
          resolvedDeps[depName] = resolved.get(depName);
        });
        const output = await node.run(resolvedDeps, input);
        return { nodeName, output };
      })
    );

    batch.forEach(({ nodeName, output }) => {
      resolved.set(nodeName, output);
      pending.delete(nodeName);
    });
  }

  const nodeOutputs = Object.fromEntries(resolved.entries());
  const contextOutput = asRecord(nodeOutputs.ContextNode) as unknown as ContextNodeOutput;
  const generationOutput = asRecord(nodeOutputs.GenerationNode) as unknown as GenerationNodeOutput;
  const astOutput = asRecord(nodeOutputs.ASTRewriteNode) as unknown as ASTRewriteNodeOutput;
  const qualityOutput = asRecord(nodeOutputs.QualityGateNode) as unknown as QualityGateNodeOutput;
  const styleOutput = asRecord(nodeOutputs.StyleDNANode) as unknown as StyleDNANodeOutput;
  const depOutput = asRecord(nodeOutputs.DependencyIntelligenceNode) as unknown as DependencyIntelligenceNodeOutput;
  const hydrationOutput = asRecord(nodeOutputs.HydrationNode) as unknown as HydrationNodeOutput;

  const finalCode =
    String(qualityOutput?.code || '') ||
    String(astOutput?.code || '') ||
    String(generationOutput?.rawCode || '');

  if (!finalCode || !finalCode.trim()) {
    throw new Error('NodeGraph produced empty generation output.');
  }

  return {
    code: finalCode,
    files: [],
    rateLimit: generationOutput?.rateLimit,
    nodeOutputs,
    metadata: {
      styleDNA: styleOutput?.styleDNA || null,
      dependencyAnalysis: depOutput?.analysis || null,
      qualityScore: qualityOutput?.qualityScore || null,
      selectedContextPaths: contextOutput?.selectedPaths || [],
      hydratedContext: hydrationOutput?.hydratedContext || input.hydratedContext || null,
    },
  };
}

