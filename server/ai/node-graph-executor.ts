import { llmManager, type LLMRequest } from '../api/llm/manager.js';
import type { FeatureFlags } from '../config/feature-flags.js';
import { astRewriter, type RewriteResult } from './processor-evolution/ast-rewriter.js';
import { qualityScorer, type QualityScore } from './processor-evolution/quality-scorer.js';
import { styleDNAInjector, type StyleDNA } from './elite-features/style-dna-injector.js';
import { dependencyIntelligence, type DependencyAnalysis } from './elite-features/dependency-intelligence.js';
import { DESIGN_REFERENCE, MICRO_INTERACTIONS, STACK_CONSTRAINT } from '../prompts/designReferences.js';
import {
  hydratePrompt,
  inferDatabaseTablesFromPrompt,
  inferIndustryFromPrompt,
  type HydratedContext,
  type HydrationIndustry,
} from '../api/hydration.js';
import { INDUSTRY_PROFILES, getIndustryFonts } from '../prompts/industryProfiles.js';
import { INDUSTRY_IMAGES } from '../prompts/imageLibrary.js';
import { AVAILABLE_COMPONENT_LIST, SECTION_TEMPLATES, type SectionTemplateKey } from '../templates/sections/index.js';
import type { ComponentLibraryEntry } from '../templates/components/shared.js';
import { getAppTypeBlueprintByName } from '../templates/appTypes/index.js';
import {
  buildEditTypePrompt,
  buildExistingProjectContextBlock,
  buildProjectContextSnapshotPrompt,
  type EditHistoryEntry,
  type EditInstructionType,
  type ProjectContextSnapshot,
} from '../api/edit-system.js';

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
  requestMode?: 'generate' | 'repair' | 'visual-edit';
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
  visualEditContext?: {
    targetElement?: {
      tagName?: string;
      className?: string;
      textContent?: string;
    };
    editInstruction?: string;
  };
  projectContext?: ProjectContextSnapshot | null;
  editType?: EditInstructionType;
  recentEdits?: EditHistoryEntry[];
  editInstruction?: string;
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

interface TableDefinition {
  name: string;
  columns: string[];
}

interface SchemaNodeOutput {
  sql: string;
  tables: TableDefinition[];
  databaseTables: string[];
}

interface ComplexAppNodeOutput {
  enabled: boolean;
  appType: string | null;
  needsAuth: boolean;
  needsDatabase: boolean;
  needsApi: boolean;
  databaseTables: string[];
  steps: {
    schemaSql: string;
    databaseTypes: string;
    supabaseHooks: string;
    authSystem: string;
    apiLayer: string;
    uiComponents: string;
  } | null;
  orchestrationPromptBlock: string;
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
    supabaseSchema?: string;
    databaseTables?: string[];
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
    const databaseTables = Array.isArray(hydrated.databaseTables) && hydrated.databaseTables.length > 0
      ? hydrated.databaseTables.join(', ')
      : 'none';
    const appTypeName = hydrated.appType || 'none';
    const mustHaveComponents = Array.isArray(hydrated.mustHaveComponents) && hydrated.mustHaveComponents.length > 0
      ? hydrated.mustHaveComponents.join(', ')
      : 'none';
    parts.push(
      `HYDRATION_CONTEXT:\n- intent: ${hydrated.intent}\n- appType: ${appTypeName}\n- components: ${componentHints}\n- mustHaveComponents: ${mustHaveComponents}\n- keyContent: ${keyContentHints}\n- needsSupabase: ${hydrated.needsSupabase ? 'yes' : 'no'}\n- needsDatabase: ${hydrated.needsDatabase ? 'yes' : 'no'}\n- needsAuth: ${hydrated.needsAuth ? 'yes' : 'no'}\n- needsApi: ${hydrated.needsApi ? 'yes' : 'no'}\n- authType: ${hydrated.authType}\n- databaseTables: ${databaseTables}\n- colorScheme: ${hydrated.colorScheme}\n- complexity: ${hydrated.complexity}`
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

const buildEditContextBlocks = (input: GenerateInput): {
  promptBlock: string;
  systemBlock: string;
} => {
  if (input.generationMode !== 'edit') {
    return { promptBlock: '', systemBlock: '' };
  }

  const instruction = String(input.editInstruction || input.prompt || '').trim();
  const context = input.projectContext || null;
  const recentEdits = Array.isArray(input.recentEdits) ? input.recentEdits : [];
  const editType = input.editType || null;
  const contextBlock = buildExistingProjectContextBlock({
    projectContext: context,
    instruction,
    editType,
    recentEdits,
  });
  const snapshotBlock = buildProjectContextSnapshotPrompt(context);
  const editTypeBlock = editType ? buildEditTypePrompt(editType) : '';

  return {
    promptBlock: snapshotBlock,
    systemBlock: [contextBlock, editTypeBlock].filter(Boolean).join('\n\n'),
  };
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

const FORBIDDEN_PATTERNS_RULES = `FORBIDDEN PATTERNS - never generate these:
- Plain gray placeholder boxes for images
- Lorem ipsum or any placeholder text
- Empty sections with just a title
- Default browser button styles
- Tables without styling
- Forms without proper spacing
- Text without proper line-height
- Cards without hover states
- Pages with only 1-2 sections
- Hardcoded data arrays instead of Supabase hooks
- console.log statements
- TODO comments in generated code
- Any inline styles (style={{...}})
- className strings longer than 10 classes (extract to component)`;

const REQUIRED_VISUAL_PATTERNS_RULES = `REQUIRED PATTERNS - always include:
Images: use real Unsplash URLs based on industry:
- restaurants: https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=800&q=80
- food items: https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=800&q=80
- technology: https://images.unsplash.com/photo-1518770660439-4636190af475?w=800&q=80
- people/team: https://images.unsplash.com/photo-1522071820081-009f0129c71c?w=800&q=80
- office: https://images.unsplash.com/photo-1497366216548-37526070297c?w=800&q=80
- fitness: https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=800&q=80
- wedding: https://images.unsplash.com/photo-1519741497674-611481863552?w=800&q=80
- Use object-cover w-full h-full on all images.

Gradients:
- Hero backgrounds must use gradients (never solid-only).
- Cards must use subtle gradient hover overlays.
- Primary CTA buttons must use gradient styling.

Animations:
- Page load: animate-fade-in on main sections.
- Counters: count up from 0 on scroll into view.
- Cards: hover:-translate-y-1 transition-all duration-300.
- Images: hover:scale-105 transition-transform duration-500.

Typography scale:
- Display: text-6xl md:text-8xl font-black tracking-tighter
- H1: text-4xl md:text-6xl font-bold tracking-tight
- H2: text-3xl md:text-4xl font-bold
- Body: text-base leading-relaxed text-slate-600
- Caption: text-sm text-slate-400

Spacing scale:
- Sections: py-24 md:py-32
- Container: max-w-7xl mx-auto px-4 md:px-8
- Between elements: space-y-6 or gap-6 minimum`;

const TAILWIND_ANIMATION_RULES = `TAILWIND ANIMATION CONFIG - always include in generated tailwind.config.js:
module.exports = {
  theme: {
    extend: {
      animation: {
        'fade-in': 'fadeIn 0.6s ease-out',
        'slide-up': 'slideUp 0.5s ease-out',
        'count-up': 'countUp 1s ease-out',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(30px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
    },
  },
}

Apply animate-fade-in on every major section.`;

const EDIT_MODE_RULES = `EDIT MODE RULES:
- You are making TARGETED changes to existing code
- Only modify what the user explicitly asked to change
- Keep ALL other code exactly as-is
- Do not reorganize, rename, or refactor anything not mentioned
- Do not add new sections unless explicitly asked
- Return the COMPLETE modified file, not just the changed lines
- If changing a color: find and change ALL instances of that color
- If adding a section: add it in the logical position in the page`;

const buildVisualEditModeRules = (
  context: GenerateInput['visualEditContext']
): string => {
  const tagName = String(context?.targetElement?.tagName || 'element').trim().toLowerCase();
  const className = String(context?.targetElement?.className || '').trim();
  const textContent = String(context?.targetElement?.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 160);
  const instruction = String(context?.editInstruction || '').replace(/\s+/g, ' ').trim();
  return `VISUAL EDIT MODE:
Target element: ${tagName} with className='${className || 'n/a'}'
containing text='${textContent || 'n/a'}'
Edit instruction: ${instruction || 'apply the requested change'}

Rules:
- Find this EXACT element in the code by its className or text content
- Apply ONLY the requested change to this element
- Do not change anything else
- Return the complete modified file`;
};

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

const normalizeTableNames = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  const deduped = new Set<string>();
  value.forEach((entry) => {
    const normalized = String(entry || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, '')
      .slice(0, 48);
    if (normalized) deduped.add(normalized);
  });
  return [...deduped].slice(0, 5);
};

const stripSqlCodeFence = (value: string): string => {
  const text = String(value || '').trim();
  if (!text) return '';
  const fenced = text.match(/```(?:sql|postgresql)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) return fenced[1].trim();
  return text;
};

const parseTableDefinitionsFromSql = (sql: string): TableDefinition[] => {
  const tableDefinitions: TableDefinition[] = [];
  const createTableRegex = /create\s+table\s+(?:if\s+not\s+exists\s+)?("?[\w.]+"?)\s*\(([\s\S]*?)\);/gi;
  let match: RegExpExecArray | null = null;

  while ((match = createTableRegex.exec(sql)) !== null) {
    const rawName = String(match[1] || '').replace(/"/g, '').trim();
    const tableName = rawName.includes('.') ? rawName.split('.').pop() || rawName : rawName;
    const body = String(match[2] || '');
    const columns = body
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line && !/^constraint\b/i.test(line) && !/^primary\s+key\b/i.test(line) && !/^foreign\s+key\b/i.test(line))
      .map((line) => line.replace(/,$/, '').split(/\s+/)[0])
      .map((column) => String(column || '').replace(/"/g, '').trim())
      .filter((column) => /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(column));
    if (!tableName) continue;
    tableDefinitions.push({
      name: tableName,
      columns: [...new Set(columns)],
    });
  }

  return tableDefinitions;
};

const buildDeterministicSchemaFallback = (tables: string[]): string => {
  const safeTables = normalizeTableNames(tables).slice(0, 5);
  if (safeTables.length === 0) return '';

  const statements: string[] = [
    '-- Deterministic fallback schema',
    'create extension if not exists "pgcrypto";',
  ];

  safeTables.forEach((table) => {
    statements.push(
      `create table if not exists public.${table} (`,
      '  id uuid primary key default gen_random_uuid(),',
      '  name text not null,',
      '  status text default \'active\',',
      '  metadata jsonb default \'{}\'::jsonb,',
      '  created_at timestamptz not null default now()',
      ');',
      `alter table public.${table} enable row level security;`,
      `create policy if not exists "${table}_select_authenticated" on public.${table} for select to authenticated using (true);`,
      `create policy if not exists "${table}_insert_authenticated" on public.${table} for insert to authenticated with check (true);`,
      `create policy if not exists "${table}_update_authenticated" on public.${table} for update to authenticated using (true) with check (true);`,
      `create policy if not exists "${table}_delete_authenticated" on public.${table} for delete to authenticated using (true);`,
      `insert into public.${table} (name, status, metadata) values`,
      `  ('Sample ${table} 1', 'active', '{"seed":1}'::jsonb),`,
      `  ('Sample ${table} 2', 'active', '{"seed":2}'::jsonb),`,
      `  ('Sample ${table} 3', 'active', '{"seed":3}'::jsonb)`,
      'on conflict do nothing;',
      ''
    );
  });

  return statements.join('\n').trim();
};

type SqlColumnDefinition = {
  name: string;
  sqlType: string;
  nullable: boolean;
  tsType: string;
};

const AUTH_CONTEXT_TEMPLATE = [
  "src/contexts/AuthContext.tsx:",
  "import { createContext, useContext, useEffect, useState } from 'react'",
  "import { User } from '@supabase/supabase-js'",
  "import { supabase } from '../lib/supabase'",
  "",
  "interface AuthContextType {",
  "  user: User | null",
  "  loading: boolean",
  "  signIn: (email: string, password: string) => Promise<void>",
  "  signUp: (email: string, password: string, name: string) => Promise<void>",
  "  signOut: () => Promise<void>",
  "}",
  "",
  "const AuthContext = createContext<AuthContextType>({} as AuthContextType)",
  "",
  "export function AuthProvider({ children }: { children: React.ReactNode }) {",
  "  const [user, setUser] = useState<User | null>(null)",
  "  const [loading, setLoading] = useState(true)",
  "",
  "  useEffect(() => {",
  "    supabase.auth.getSession().then(({ data: { session } }) => {",
  "      setUser(session?.user ?? null)",
  "      setLoading(false)",
  "    })",
  "",
  "    const { data: { subscription } } = supabase.auth.onAuthStateChange(",
  "      (_event, session) => setUser(session?.user ?? null)",
  "    )",
  "    return () => subscription.unsubscribe()",
  "  }, [])",
  "",
  "  const signIn = async (email: string, password: string) => {",
  "    const { error } = await supabase.auth.signInWithPassword({ email, password })",
  "    if (error) throw error",
  "  }",
  "",
  "  const signUp = async (email: string, password: string, name: string) => {",
  "    const { error } = await supabase.auth.signUp({",
  "      email, password,",
  "      options: { data: { full_name: name } }",
  "    })",
  "    if (error) throw error",
  "  }",
  "",
  "  const signOut = async () => {",
  "    await supabase.auth.signOut()",
  "  }",
  "",
  "  return (",
  "    <AuthContext.Provider value={{ user, loading, signIn, signUp, signOut }}>",
  "      {children}",
  "    </AuthContext.Provider>",
  "  )",
  "}",
  "",
  "export const useAuth = () => useContext(AuthContext)",
].join('\n');

const PROTECTED_ROUTE_TEMPLATE = [
  "src/components/ProtectedRoute.tsx:",
  "import { Navigate } from 'react-router-dom'",
  "import { useAuth } from '../contexts/AuthContext'",
  "",
  "export function ProtectedRoute({ children }: { children: React.ReactNode }) {",
  "  const { user, loading } = useAuth()",
  "",
  "  if (loading) return (",
  "    <div className=\"min-h-screen flex items-center justify-center bg-slate-900\">",
  "      <div className=\"animate-spin h-8 w-8 border-2 border-purple-500 border-t-transparent rounded-full\" />",
  "    </div>",
  "  )",
  "",
  "  return user ? <>{children}</> : <Navigate to=\"/login\" replace />",
  "}",
  "",
  "Wrap protected routes in App.tsx:",
  "<Route path=\"/dashboard\" element={",
  "  <ProtectedRoute><Dashboard /></ProtectedRoute>",
  "} />",
].join('\n');

const API_LAYER_TEMPLATE = [
  "src/lib/api.ts:",
  "import { supabase } from './supabase'",
  "",
  "export async function apiCall<T>(",
  "  table: string,",
  "  operation: 'select' | 'insert' | 'update' | 'delete',",
  "  options?: {",
  "    select?: string",
  "    match?: Record<string, unknown>",
  "    data?: Record<string, unknown>",
  "    order?: { column: string; ascending?: boolean }",
  "    limit?: number",
  "  }",
  "): Promise<T[]> {",
  "  let query = supabase.from(table)",
  "",
  "  try {",
  "    switch (operation) {",
  "      case 'select': {",
  "        let q = (query as any).select(options?.select || '*')",
  "        if (options?.match) {",
  "          Object.entries(options.match).forEach(([k, v]) => {",
  "            q = q.eq(k, v)",
  "          })",
  "        }",
  "        if (options?.order) q = q.order(options.order.column, { ascending: options.order.ascending ?? true })",
  "        if (options?.limit) q = q.limit(options.limit)",
  "        const { data, error } = await q",
  "        if (error) throw error",
  "        return data || []",
  "      }",
  "      case 'insert': {",
  "        const { data, error } = await (query as any).insert(options?.data).select()",
  "        if (error) throw error",
  "        return data || []",
  "      }",
  "      case 'update': {",
  "        let q = (query as any).update(options?.data)",
  "        if (options?.match) {",
  "          Object.entries(options.match).forEach(([k, v]) => {",
  "            q = q.eq(k, v)",
  "          })",
  "        }",
  "        const { data, error } = await q.select()",
  "        if (error) throw error",
  "        return data || []",
  "      }",
  "      case 'delete': {",
  "        let q = (query as any).delete()",
  "        if (options?.match) {",
  "          Object.entries(options.match).forEach(([k, v]) => {",
  "            q = q.eq(k, v)",
  "          })",
  "        }",
  "        const { error } = await q",
  "        if (error) throw error",
  "        return []",
  "      }",
  "    }",
  "  } catch (error) {",
  "    console.error(`API Error [${operation} ${table}]:`, error)",
  "    throw error",
  "  }",
  "}",
].join('\n');

const TOAST_SYSTEM_TEMPLATE = [
  "Toast notification system - always required:",
  "- Generate src/components/ui/Toast.tsx",
  "- Generate src/hooks/useToast.ts",
  "- useToast must expose success(message), error(message), info(message), warning(message)",
  "- Auto-dismiss after 4 seconds",
  "- Support stacked toasts",
  "- Use toast in ALL async operations",
  "",
  "Usage pattern:",
  "try {",
  "  await addItem(formData)",
  "  toast.success('Item added successfully!')",
  "} catch (error) {",
  "  toast.error('Failed to add item. Please try again.')",
  "}",
].join('\n');

const VALIDATION_TEMPLATE = [
  "Form validation system - always required:",
  "- Generate src/lib/validation.ts",
  "",
  "export const validators = {",
  "  required: (value: string) => value.trim() ? null : 'This field is required',",
  "  email: (value: string) =>",
  "    /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(value) ? null : 'Invalid email address',",
  "  minLength: (min: number) => (value: string) =>",
  "    value.length >= min ? null : `Must be at least ${min} characters`,",
  "  maxLength: (max: number) => (value: string) =>",
  "    value.length <= max ? null : `Must be less than ${max} characters`,",
  "  phone: (value: string) =>",
  "    /^\\+?[\\d\\s-()]{8,}$/.test(value) ? null : 'Invalid phone number',",
  "  url: (value: string) => {",
  "    try { new URL(value); return null }",
  "    catch { return 'Invalid URL' }",
  "  }",
  "}",
  "",
  "export function validate(value: string, rules: Array<(v: string) => string | null>) {",
  "  for (const rule of rules) {",
  "    const error = rule(value)",
  "    if (error) return error",
  "  }",
  "  return null",
  "}",
  "",
  "Use inline errors below inputs:",
  "{errors.email && (",
  "  <p className=\"text-red-400 text-sm mt-1\">{errors.email}</p>",
  ")}",
].join('\n');

const toPascalCaseIdentifier = (value: string): string => {
  const pascal = String(value || '')
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join('');
  if (!pascal) return 'Record';
  return /^[A-Za-z_$]/.test(pascal) ? pascal : `T${pascal}`;
};

const singularizeTableName = (tableName: string): string => {
  const lower = String(tableName || '').toLowerCase();
  if (lower.endsWith('ies')) return `${lower.slice(0, -3)}y`;
  if (lower.endsWith('ses')) return lower.slice(0, -2);
  if (lower.endsWith('s') && lower.length > 3) return lower.slice(0, -1);
  return lower;
};

const inferTsTypeFromColumn = (columnName: string, sqlType: string): string => {
  const col = String(columnName || '').toLowerCase();
  const type = String(sqlType || '').toLowerCase();

  if (/\b(uuid|text|varchar|char|citext|date|time|timestamp|timestamptz)\b/.test(type)) return 'string';
  if (/\b(bool|boolean)\b/.test(type) || /^is_/.test(col) || /^has_/.test(col)) return 'boolean';
  if (/\b(int|numeric|decimal|float|double|real|serial)\b/.test(type)) return 'number';
  if (/\b(json|jsonb)\b/.test(type) || /(metadata|payload|config|data)$/.test(col)) return 'Record<string, unknown>';
  if (/\[\]$/.test(type) || /\barray\b/.test(type)) return 'unknown[]';

  if (/(count|total|amount|price|cost|qty|quantity|tokens|latency)/.test(col)) return 'number';
  if (/(email|phone|url|name|title|description|status|slug)/.test(col)) return 'string';
  if (/(created_at|updated_at|deleted_at|starts_at|ends_at|due_date)/.test(col)) return 'string';

  return 'unknown';
};

const parseSchemaColumnDefinitions = (sql: string): Record<string, SqlColumnDefinition[]> => {
  const definitions: Record<string, SqlColumnDefinition[]> = {};
  const createTableRegex = /create\s+table\s+(?:if\s+not\s+exists\s+)?("?[\w.]+"?)\s*\(([\s\S]*?)\);/gi;
  let match: RegExpExecArray | null = null;

  while ((match = createTableRegex.exec(sql)) !== null) {
    const rawName = String(match[1] || '').replace(/"/g, '').trim();
    const tableName = rawName.includes('.') ? rawName.split('.').pop() || rawName : rawName;
    const body = String(match[2] || '');
    const columns: SqlColumnDefinition[] = [];

    body
      .split('\n')
      .map((line) => line.trim())
      .filter((line) =>
        Boolean(line) &&
        !/^constraint\b/i.test(line) &&
        !/^primary\s+key\b/i.test(line) &&
        !/^foreign\s+key\b/i.test(line) &&
        !/^unique\b/i.test(line)
      )
      .forEach((line) => {
        const normalized = line.replace(/,$/, '');
        const parts = normalized.split(/\s+/);
        if (parts.length < 2) return;
        const columnName = String(parts[0] || '').replace(/"/g, '').trim();
        if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(columnName)) return;
        const sqlType = String(parts[1] || '').trim();
        const nullable = !/\bnot\s+null\b/i.test(normalized);
        columns.push({
          name: columnName,
          sqlType,
          nullable,
          tsType: inferTsTypeFromColumn(columnName, sqlType),
        });
      });

    if (columns.length > 0) {
      definitions[tableName] = columns;
    }
  }

  return definitions;
};

const buildDatabaseTypesFromSchema = (schemaSql: string, tables: TableDefinition[]): string => {
  const columnMap = parseSchemaColumnDefinitions(schemaSql);
  const tableNames = normalizeTableNames(
    tables.map((table) => table.name).length > 0
      ? tables.map((table) => table.name)
      : Object.keys(columnMap)
  );

  const interfaces = tableNames.map((tableName) => {
    const interfaceName = toPascalCaseIdentifier(singularizeTableName(tableName));
    const columns = columnMap[tableName] || [
      { name: 'id', sqlType: 'uuid', nullable: false, tsType: 'string' },
      { name: 'created_at', sqlType: 'timestamptz', nullable: false, tsType: 'string' },
    ];
    const fields = columns.map((column) => {
      const optional = column.nullable && column.name !== 'id' ? '?' : '';
      return `  ${column.name}${optional}: ${column.tsType};`;
    });
    return `export interface ${interfaceName} {\n${fields.join('\n')}\n}`;
  });

  const tableRegistry = tableNames
    .map((tableName) => {
      const typeName = toPascalCaseIdentifier(singularizeTableName(tableName));
      return `  ${tableName}: ${typeName};`;
    })
    .join('\n');

  return [
    "src/lib/database.types.ts:",
    interfaces.join('\n\n'),
    '',
    'export interface DatabaseTables {',
    tableRegistry || '  [key: string]: unknown;',
    '}',
  ].join('\n');
};

const buildSupabaseClientAndHooksBlueprint = (databaseTables: string[], databaseTypes: string): string => {
  const hookSnippets = normalizeTableNames(databaseTables).slice(0, 5).map((tableName) => {
    const typeName = toPascalCaseIdentifier(singularizeTableName(tableName));
    const hookName = `use${toPascalCaseIdentifier(tableName)}`;
    return [
      `src/hooks/${hookName}.ts:`,
      "import { useEffect, useState } from 'react'",
      "import { supabase } from '../lib/supabase'",
      `import type { ${typeName} } from '../lib/database.types'`,
      '',
      `export function ${hookName}() {`,
      `  const [items, setItems] = useState<${typeName}[]>([])`,
      '  const [loading, setLoading] = useState(true)',
      '  const [error, setError] = useState<Error | null>(null)',
      '',
      '  useEffect(() => {',
      '    supabase.from(\'' + tableName + '\').select(\'*\')',
      '      .then(({ data, error }) => {',
      '        if (error) { setError(error as Error); return }',
      `        setItems((data || []) as ${typeName}[])`,
      '      })',
      '      .finally(() => setLoading(false))',
      '  }, [])',
      '',
      '  return { items, loading, error, setItems }',
      '}',
    ].join('\n');
  });

  return [
    "src/lib/supabase.ts:",
    "import { createClient } from '@supabase/supabase-js'",
    "const supabaseUrl = import.meta.env.VITE_SUPABASE_URL",
    "const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY",
    "export const supabase = createClient(supabaseUrl, supabaseKey)",
    '',
    databaseTypes,
    '',
    hookSnippets.join('\n\n'),
  ].join('\n');
};

const buildComplexUiIntegrationRules = (appType: string | null, databaseTables: string[], needsAuth: boolean): string => {
  const normalizedTables = normalizeTableNames(databaseTables);
  const dataHooks = normalizedTables.map((tableName) => `use${toPascalCaseIdentifier(tableName)}()`).join(', ');
  return [
    `UI integration for app type: ${appType || 'custom'}`,
    '- UI components must consume data from generated hooks, never hardcoded arrays.',
    '- All async actions must use toast.success / toast.error feedback.',
    '- All forms must use validation.ts validators and inline error messages.',
    needsAuth
      ? '- Protected pages must be wrapped with <ProtectedRoute> and AuthProvider at app root.'
      : '- Auth is optional, but API/data calls still need loading/error/empty states.',
    `- Required data hooks in UI: ${dataHooks || 'use generated table hooks'}.`,
    '- Every list view must include loading spinner, empty state text, and error fallback card.',
  ].join('\n');
};

const buildComplexAppPromptBlock = (output: ComplexAppNodeOutput): string => {
  if (!output.enabled || !output.steps) return '';
  return [
    'COMPLEX APP ORCHESTRATION (STRICT ORDER):',
    `- appType: ${output.appType || 'custom'}`,
    `- needsAuth: ${output.needsAuth ? 'true' : 'false'}`,
    `- needsDatabase: ${output.needsDatabase ? 'true' : 'false'}`,
    `- needsApi: ${output.needsApi ? 'true' : 'false'}`,
    '',
    'STEP 1 - Database schema SQL:',
    output.steps.schemaSql,
    '',
    'STEP 2 - TypeScript types generated from schema:',
    output.steps.databaseTypes,
    '',
    'STEP 3 - Supabase client + hooks generated from types:',
    output.steps.supabaseHooks,
    '',
    'STEP 4 - Auth context + protected routes:',
    output.steps.authSystem,
    '',
    'STEP 5 - API layer:',
    output.steps.apiLayer,
    '',
    'STEP 6 - UI components integration:',
    output.steps.uiComponents,
    '',
    'You must generate files in this exact dependency order and wire each next step to previous outputs.',
  ].join('\n');
};

const buildFullStackSystemPromptBlock = (hydratedContext: HydratedContext | null | undefined): string => {
  const tableList = Array.isArray(hydratedContext?.databaseTables) && hydratedContext?.databaseTables.length > 0
    ? hydratedContext.databaseTables.join(', ')
    : inferDatabaseTablesFromPrompt(String(hydratedContext?.intent || '')).join(', ');
  const authType = hydratedContext?.authType || 'none';
  const needsDatabase = Boolean(hydratedContext?.needsDatabase);
  const needsAuth = Boolean(hydratedContext?.needsAuth);
  const needsApi = Boolean(hydratedContext?.needsApi);

  const authRequiredBlock = needsAuth
    ? `AUTH SYSTEM TEMPLATE - mandatory when needsAuth=true:
${AUTH_CONTEXT_TEMPLATE}

${PROTECTED_ROUTE_TEMPLATE}`
    : 'AUTH SYSTEM: needsAuth=false (auth files optional unless requested by prompt).';

  const apiRequiredBlock = needsApi || needsDatabase
    ? `API LAYER TEMPLATE - mandatory when needsApi=true or needsDatabase=true:
${API_LAYER_TEMPLATE}`
    : 'API LAYER: needsApi=false (generate only if explicitly required by prompt).';

  return `FULL-STACK RULES - this app uses Supabase for backend:
- needsDatabase: ${needsDatabase ? 'true' : 'false'}
- needsAuth: ${needsAuth ? 'true' : 'false'}
- needsApi: ${needsApi ? 'true' : 'false'}
- authType: ${authType}
- databaseTables: ${tableList}

REQUIRED FILES to generate:
src/lib/supabase.ts:
  import { createClient } from '@supabase/supabase-js'
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
  const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY
  export const supabase = createClient(supabaseUrl, supabaseKey)

src/lib/database.types.ts:
  Generate TypeScript interfaces for every table listed above.

src/hooks/use{TableName}.ts (one per table):
  Create hooks for fetch + create + update + delete with Supabase.
  Do not hardcode arrays; use Supabase queries only.
  Always include loading, empty, and error states.

REALTIME requirement:
  For dashboard/live screens, subscribe with supabase.channel(...postgres_changes...).

${authRequiredBlock}

${apiRequiredBlock}

TOAST SYSTEM - mandatory for async UX:
${TOAST_SYSTEM_TEMPLATE}

FORM VALIDATION SYSTEM - mandatory for every form:
${VALIDATION_TEMPLATE}

Implementation enforcement:
- Use toast.success/toast.error in ALL async create/update/delete/auth handlers.
- Use validators + validate(...) on ALL forms before submit.
- Show inline validation errors below each field.
- Protected pages must use <ProtectedRoute> when auth is required.
- Keep Auth + DB + API wired together with shared types and hooks.

Environment + docs requirement:
  Always generate .env.example containing:
  VITE_SUPABASE_URL=https://your-project.supabase.co
  VITE_SUPABASE_ANON_KEY=your-anon-key-here

  README.md must include:
  ## Setup
  1. Create a Supabase project at supabase.com
  2. Copy your project URL and anon key
  3. Create .env from .env.example and fill in values
  4. Run the SQL schema in Supabase SQL Editor
  5. npm install && npm run dev`;
};

const buildAppTypeSystemPromptBlock = (hydratedContext: HydratedContext | null | undefined): string => {
  const appTypeBlueprint = getAppTypeBlueprintByName(hydratedContext?.appType || '');
  if (!appTypeBlueprint) return '';

  const requiredComponents = appTypeBlueprint.mustHaveComponents.join(', ');
  const requiredFeatures = appTypeBlueprint.features.join(', ');
  const requiredPages = appTypeBlueprint.pages.join(', ');
  const visualStyleRule = appTypeBlueprint.visualStyle
    ? `Visual style: ${appTypeBlueprint.visualStyle}`
    : '';
  const specialInstructionsRule = appTypeBlueprint.specialInstructions
    ? `Special instructions: ${appTypeBlueprint.specialInstructions}`
    : '';
  const gameDevelopmentRules = appTypeBlueprint.name === 'game'
    ? `GAME DEVELOPMENT RULES:
- Use useRef for game state, never useState for rapidly changing values
- Use requestAnimationFrame for smooth game loops
- Implement keyboard controls with useEffect cleanup
- Always handle game states: 'idle' | 'playing' | 'paused' | 'gameover'
- Score must persist to localStorage
- Mobile: add touch/swipe controls alongside keyboard`
    : '';

  return `APP TYPE: ${appTypeBlueprint.name}
You MUST generate ALL of these components: ${requiredComponents}
You MUST implement ALL of these features: ${requiredFeatures}
Required pages: ${requiredPages}
${visualStyleRule}
${specialInstructionsRule}
${gameDevelopmentRules}
This must be a COMPLETE, FUNCTIONAL application - not a prototype.`;
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

const tokenizeComponentKeywords = (value: string): string[] => {
  const tokens = String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 3);
  return Array.from(new Set(tokens));
};

const APP_TYPE_CATEGORY_BOOSTS: Record<string, string[]> = {
  restaurant: ['form', 'card', 'layout'],
  'saas-dashboard': ['dashboard', 'data-display', 'navigation'],
  ecommerce: ['ecommerce', 'card', 'form', 'pricing'],
  'todo-app': ['dashboard', 'data-display', 'layout'],
  blog: ['card', 'layout', 'social-proof'],
  booking: ['form', 'layout', 'data-display'],
  'mobile-app': ['navigation', 'layout', 'media', 'feedback'],
  game: ['layout', 'feedback', 'data-display'],
  'ai-tool': ['form', 'data-display', 'feedback'],
  social: ['social-proof', 'media', 'dashboard', 'feedback'],
  marketplace: ['ecommerce', 'form', 'dashboard', 'media'],
  'saas-tool': ['form', 'data-display', 'feedback'],
};

const scoreComponentReference = (
  component: ComponentLibraryEntry,
  tokens: string[],
  boostedCategories: Set<string>,
  mustHaveComponents: Set<string>,
  supabaseLikely: boolean
): number => {
  let score = 0;
  const normalizedName = component.name.toLowerCase();
  const normalizedDescription = component.description.toLowerCase();
  const normalizedTags = component.tags.map((tag) => tag.toLowerCase());

  if (mustHaveComponents.has(normalizedName)) {
    score += 40;
  }

  for (const token of tokens) {
    if (normalizedName.includes(token)) score += 10;
    if (normalizedDescription.includes(token)) score += 3;
    if (normalizedTags.some((tag) => tag.includes(token))) score += 6;
  }

  if (boostedCategories.has(component.category)) {
    score += 12;
  }

  if (component.supabaseRequired && supabaseLikely) {
    score += 4;
  } else if (component.supabaseRequired && !supabaseLikely) {
    score -= 2;
  }

  return score;
};

const selectComponentLibraryReferences = (
  prompt: string,
  hydratedContext: HydratedContext | null | undefined
): ComponentLibraryEntry[] => {
  const componentHints = Array.isArray(hydratedContext?.componentList) ? hydratedContext.componentList : [];
  const keyContent = Array.isArray(hydratedContext?.keyContent) ? hydratedContext.keyContent : [];
  const mustHaveComponents = new Set(
    (Array.isArray(hydratedContext?.mustHaveComponents) ? hydratedContext.mustHaveComponents : [])
      .map((value) => String(value || '').toLowerCase().trim())
      .filter(Boolean)
  );
  const mergedKeywordSource = [
    prompt,
    hydratedContext?.intent || '',
    componentHints.join(' '),
    keyContent.join(' '),
    hydratedContext?.appType || '',
  ].join(' ');
  const tokens = tokenizeComponentKeywords(mergedKeywordSource);
  const appType = String(hydratedContext?.appType || '').toLowerCase();
  const boostedCategories = new Set(APP_TYPE_CATEGORY_BOOSTS[appType] || []);
  const supabaseLikely = Boolean(
    hydratedContext?.needsSupabase
      || hydratedContext?.needsDatabase
      || hydratedContext?.needsAuth
      || hydratedContext?.needsApi
  );

  const scored = AVAILABLE_COMPONENT_LIST.map((component) => ({
    component,
    score: scoreComponentReference(component, tokens, boostedCategories, mustHaveComponents, supabaseLikely),
  }));

  const filtered = scored
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.component.name.localeCompare(b.component.name));

  if (!filtered.length) {
    return AVAILABLE_COMPONENT_LIST.slice(0, 5);
  }

  return filtered.slice(0, 5).map((entry) => entry.component);
};

const appendComponentLibraryReferencesToPrompt = (
  prompt: string,
  references: ComponentLibraryEntry[]
): string => {
  if (!references.length) return prompt;

  const referenceBlock = references
    .map((component, index) => {
      return [
        `COMPONENT ${index + 1}: ${component.name}`,
        `Category: ${component.category}`,
        `Description: ${component.description}`,
        `Tags: ${component.tags.join(', ') || 'none'}`,
        `DefaultProps: ${JSON.stringify(component.defaultProps)}`,
        `SupabaseRequired: ${component.supabaseRequired ? 'yes' : 'no'}`,
        'Structure Reference:',
        component.structure,
      ].join('\n');
    })
    .join('\n\n');

  return `${prompt}\n\nCOMPONENT_LIBRARY_REFERENCES:\n- Use these patterns for structure, styling, and composition.\n- Pick the most relevant ones and adapt to the product context.\n- Keep generated code production-ready and fully wired.\n\n${referenceBlock}`;
};

const ensureStackConstraintInSystemPrompt = (
  baseSystemPrompt: string | undefined,
  hydratedContext: HydratedContext | null | undefined,
  prompt: string,
  generationMode: 'new' | 'edit',
  requestMode: GenerateInput['requestMode'],
  visualEditContext: GenerateInput['visualEditContext'],
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
  const includesEditModeRules = withStack.includes('EDIT MODE RULES:');
  const includesVisualEditBlock = withStack.includes('VISUAL EDIT MODE:');
  const includesForbiddenPatterns = withStack.includes('FORBIDDEN PATTERNS - never generate these:');
  const includesRequiredPatterns = withStack.includes('REQUIRED PATTERNS - always include:');
  const includesTailwindAnimationRules = withStack.includes('TAILWIND ANIMATION CONFIG - always include in generated tailwind.config.js:');
  const includesAppTypeBlock = withStack.includes('APP TYPE:');
  const includesFullStackBlock = withStack.includes('FULL-STACK RULES - this app uses Supabase for backend:');
  const includesSupabaseBlock = withStack.includes('SUPABASE INTEGRATION - this project uses Supabase:');
  const includesGitHubBlock = withStack.includes('GITHUB INTEGRATION - this project is synced with GitHub:');
  const includesScreenshotBlock = withStack.includes('You are rebuilding a UI from a screenshot.');
  const editModeBlock = generationMode === 'edit' ? EDIT_MODE_RULES : '';
  const visualEditBlock = requestMode === 'visual-edit' ? buildVisualEditModeRules(visualEditContext) : '';
  const appTypeBlock = buildAppTypeSystemPromptBlock(hydratedContext);
  const fullStackRequired = Boolean(
    hydratedContext?.needsDatabase ||
    hydratedContext?.needsAuth ||
    hydratedContext?.needsApi
  );
  const fullStackBlock = fullStackRequired ? buildFullStackSystemPromptBlock(hydratedContext) : '';
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
      (includesEditModeRules || !editModeBlock) &&
      (includesVisualEditBlock || !visualEditBlock) &&
      includesForbiddenPatterns &&
      includesRequiredPatterns &&
      includesTailwindAnimationRules &&
      (includesAppTypeBlock || !appTypeBlock) &&
      (includesFullStackBlock || !fullStackBlock) &&
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
    FORBIDDEN_PATTERNS_RULES,
    REQUIRED_VISUAL_PATTERNS_RULES,
    TAILWIND_ANIMATION_RULES,
    editModeBlock,
    visualEditBlock,
    appTypeBlock,
    fullStackBlock,
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

const createSchemaNode = (): Node<GenerateInput, SchemaNodeOutput> => ({
  name: 'SchemaNode',
  deps: [],
  run: async (_resolvedDeps, input) => {
    const hydratedContext = input.hydratedContext || await hydratePrompt(input.prompt, input.currentFiles || {});
    const needsDatabase = Boolean(hydratedContext?.needsDatabase);
    const databaseTables = normalizeTableNames(
      hydratedContext?.databaseTables && hydratedContext.databaseTables.length > 0
        ? hydratedContext.databaseTables
        : inferDatabaseTablesFromPrompt(input.prompt)
    );

    if (!needsDatabase || databaseTables.length === 0) {
      return {
        sql: '',
        tables: [],
        databaseTables,
      };
    }

    const systemPrompt = [
      'Generate PostgreSQL/Supabase SQL only.',
      'Return ONLY valid SQL, no explanations, no markdown.',
      'Requirements:',
      '- Create all requested tables with id uuid primary key default gen_random_uuid().',
      '- Include created_at timestamptz default now() on every table.',
      '- Add relevant columns and sensible types.',
      '- Enable RLS on every table.',
      '- Add policies for authenticated select/insert/update/delete.',
      '- Add seed inserts with 3-5 rows per table.',
    ].join('\n');

    const schemaPrompt = `Generate PostgreSQL/Supabase SQL for these tables: ${databaseTables.join(', ')}.
Include id (uuid), created_at, relevant columns, RLS policies, and seed data (3-5 rows per table).
Return ONLY valid SQL.`;

    try {
      const response = await llmManager.generate({
        provider: input.provider,
        generationMode: 'new',
        prompt: schemaPrompt,
        systemPrompt,
        temperature: 0.1,
        maxTokens: 2400,
        stream: false,
        signal: input.signal,
      });

      const rawSql = typeof response === 'string'
        ? response
        : String((response as any)?.content || '');
      const sql = stripSqlCodeFence(rawSql);
      if (!sql) {
        const fallbackSql = buildDeterministicSchemaFallback(databaseTables);
        return {
          sql: fallbackSql,
          tables: parseTableDefinitionsFromSql(fallbackSql),
          databaseTables,
        };
      }

      const tables = parseTableDefinitionsFromSql(sql);
      return {
        sql,
        tables,
        databaseTables,
      };
    } catch {
      const fallbackSql = buildDeterministicSchemaFallback(databaseTables);
      return {
        sql: fallbackSql,
        tables: parseTableDefinitionsFromSql(fallbackSql),
        databaseTables,
      };
    }
  },
});

const createComplexAppNode = (): Node<GenerateInput, ComplexAppNodeOutput> => ({
  name: 'ComplexAppNode',
  deps: ['HydrationNode', 'SchemaNode'],
  run: async (resolvedDeps, input) => {
    const hydrationOutput = asRecord(resolvedDeps.HydrationNode) as unknown as HydrationNodeOutput;
    const schemaOutput = asRecord(resolvedDeps.SchemaNode) as unknown as SchemaNodeOutput;
    const hydratedContext = hydrationOutput?.hydratedContext || input.hydratedContext || null;

    const appType = hydratedContext?.appType || null;
    const needsAuth = Boolean(hydratedContext?.needsAuth);
    const needsDatabase = Boolean(hydratedContext?.needsDatabase);
    const needsApi = Boolean(hydratedContext?.needsApi);
    const databaseTables = normalizeTableNames(
      schemaOutput?.databaseTables && schemaOutput.databaseTables.length > 0
        ? schemaOutput.databaseTables
        : (hydratedContext?.databaseTables || inferDatabaseTablesFromPrompt(input.prompt))
    );
    const isComplexApp = Boolean(appType && needsAuth && needsDatabase);

    if (!isComplexApp) {
      return {
        enabled: false,
        appType,
        needsAuth,
        needsDatabase,
        needsApi,
        databaseTables,
        steps: null,
        orchestrationPromptBlock: '',
      };
    }

    // Step 1: schema SQL.
    const schemaSql = String(schemaOutput?.sql || '').trim() || buildDeterministicSchemaFallback(databaseTables);
    const resolvedTables = schemaOutput?.tables && schemaOutput.tables.length > 0
      ? schemaOutput.tables
      : parseTableDefinitionsFromSql(schemaSql);

    // Step 2: types generated from schema SQL.
    const databaseTypes = buildDatabaseTypesFromSchema(schemaSql, resolvedTables);

    // Step 3: supabase client + hooks generated from types.
    const supabaseHooks = buildSupabaseClientAndHooksBlueprint(databaseTables, databaseTypes);

    // Step 4: auth context + protected routes generated using prior type/hook context.
    const authSystem = `${AUTH_CONTEXT_TEMPLATE}\n\n${PROTECTED_ROUTE_TEMPLATE}`;

    // Step 5: API layer scaffold generated to operate on the same tables/types.
    const apiLayer = API_LAYER_TEMPLATE;

    // Step 6: UI integration rules that wire auth + hooks + API + toasts + validation.
    const uiComponents = buildComplexUiIntegrationRules(appType, databaseTables, needsAuth);

    const output: ComplexAppNodeOutput = {
      enabled: true,
      appType,
      needsAuth,
      needsDatabase,
      needsApi,
      databaseTables,
      steps: {
        schemaSql,
        databaseTypes,
        supabaseHooks,
        authSystem,
        apiLayer,
        uiComponents,
      },
      orchestrationPromptBlock: '',
    };
    output.orchestrationPromptBlock = buildComplexAppPromptBlock(output);
    return output;
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
  deps: ['HydrationNode'],
  run: async (resolvedDeps, input) => {
    const hydrationOutput = asRecord(resolvedDeps.HydrationNode) as unknown as HydrationNodeOutput;
    const resolvedHydrationContext = hydrationOutput?.hydratedContext || input.hydratedContext || null;
    const routingRequired = needsRoutingProject(input.prompt, resolvedHydrationContext, input.currentFiles);
    const supabaseConnected = isSupabaseConnected(input.supabaseIntegration);
    const supabaseHintedByHydration = Boolean(
      resolvedHydrationContext?.needsSupabase ||
      resolvedHydrationContext?.needsDatabase ||
      resolvedHydrationContext?.needsAuth ||
      resolvedHydrationContext?.needsApi
    );
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
  deps: ['ContextNode', 'TokenBudgetNode', 'HydrationNode', 'ComplexAppNode', 'StyleDNANode', 'DependencyIntelligenceNode'],
  run: async (resolvedDeps, input) => {
    const contextOutput = asRecord(resolvedDeps.ContextNode) as unknown as ContextNodeOutput;
    const tokenBudgetOutput = asRecord(resolvedDeps.TokenBudgetNode) as unknown as TokenBudgetNodeOutput;
    const styleOutput = asRecord(resolvedDeps.StyleDNANode) as unknown as StyleDNANodeOutput;
    const depOutput = asRecord(resolvedDeps.DependencyIntelligenceNode) as unknown as DependencyIntelligenceNodeOutput;
    const hydrationOutput = asRecord(resolvedDeps.HydrationNode) as unknown as HydrationNodeOutput;
    const complexAppOutput = asRecord(resolvedDeps.ComplexAppNode) as unknown as ComplexAppNodeOutput;

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
    const editContextBlocks = buildEditContextBlocks(input);
    const promptWithEditContext = editContextBlocks.promptBlock
      ? `${effectivePromptBase}\n\n${editContextBlocks.promptBlock}`
      : effectivePromptBase;
    const promptWithComplexContext = complexAppOutput?.enabled && complexAppOutput.orchestrationPromptBlock
      ? `${promptWithEditContext}\n\n${complexAppOutput.orchestrationPromptBlock}`
      : promptWithEditContext;
    const selectedTemplateReferences = personalizeTemplateReferences(
      selectSectionTemplateReferences(resolvedHydrationContext),
      input.prompt,
      resolvedHydrationContext
    );
    const promptWithSectionTemplates = appendSectionTemplateReferencesToPrompt(
      promptWithComplexContext,
      selectedTemplateReferences
    );
    const selectedComponentReferences = selectComponentLibraryReferences(
      input.prompt,
      resolvedHydrationContext
    );
    const effectivePrompt = appendComponentLibraryReferencesToPrompt(
      promptWithSectionTemplates,
      selectedComponentReferences
    );
    let effectiveSystemPrompt = ensureStackConstraintInSystemPrompt(
      input.systemPrompt,
      resolvedHydrationContext,
      input.prompt,
      input.generationMode,
      input.requestMode,
      input.visualEditContext,
      input.supabaseIntegration,
      input.githubIntegration,
      Boolean(input.screenshotBase64)
    );
    if (editContextBlocks.systemBlock) {
      effectiveSystemPrompt = `${effectiveSystemPrompt}\n\n${editContextBlocks.systemBlock}`;
    }
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
  deps: ['TokenBudgetNode', 'HydrationNode', 'ComplexAppNode'],
  run: async (resolvedDeps, input) => {
    const tokenBudgetOutput = asRecord(resolvedDeps.TokenBudgetNode) as unknown as TokenBudgetNodeOutput;
    const hydrationOutput = asRecord(resolvedDeps.HydrationNode) as unknown as HydrationNodeOutput;
    const complexAppOutput = asRecord(resolvedDeps.ComplexAppNode) as unknown as ComplexAppNodeOutput;
    const effectivePrompt = buildGenerationPrompt(
      input.prompt,
      null,
      null,
      null,
      hydrationOutput?.hydratedContext
        ? hydrationOutput
        : (input.hydratedContext ? { hydratedContext: input.hydratedContext } : null)
    );
    const editContextBlocks = buildEditContextBlocks(input);
    const promptWithEditContext = editContextBlocks.promptBlock
      ? `${effectivePrompt}\n\n${editContextBlocks.promptBlock}`
      : effectivePrompt;
    const promptWithComplexContext = complexAppOutput?.enabled && complexAppOutput.orchestrationPromptBlock
      ? `${promptWithEditContext}\n\n${complexAppOutput.orchestrationPromptBlock}`
      : promptWithEditContext;
    const resolvedHydrationContext = hydrationOutput?.hydratedContext || input.hydratedContext || null;
    let effectiveSystemPrompt = ensureStackConstraintInSystemPrompt(
      input.systemPrompt,
      resolvedHydrationContext,
      input.prompt,
      input.generationMode,
      input.requestMode,
      input.visualEditContext,
      input.supabaseIntegration,
      input.githubIntegration,
      Boolean(input.screenshotBase64)
    );
    if (editContextBlocks.systemBlock) {
      effectiveSystemPrompt = `${effectiveSystemPrompt}\n\n${editContextBlocks.systemBlock}`;
    }
    const promptWithDesignReference = injectDesignReferenceIntoPrompt(promptWithComplexContext);

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
    createHydrationNode(),
    createSchemaNode(),
    createComplexAppNode(),
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
    createSchemaNode(),
    createComplexAppNode(),
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
  const schemaOutput = asRecord(nodeOutputs.SchemaNode) as unknown as SchemaNodeOutput;

  const finalCode =
    String(qualityOutput?.code || '') ||
    String(astOutput?.code || '') ||
    String(generationOutput?.rawCode || '');

  if (!finalCode || !finalCode.trim()) {
    throw new Error('NodeGraph produced empty generation output.');
  }

  const resolvedDatabaseTables = normalizeTableNames(
    schemaOutput?.databaseTables && schemaOutput.databaseTables.length > 0
      ? schemaOutput.databaseTables
      : (schemaOutput?.tables || []).map((table) => table.name)
  );

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
      supabaseSchema: String(schemaOutput?.sql || '').trim() || undefined,
      databaseTables: resolvedDatabaseTables.length > 0 ? resolvedDatabaseTables : undefined,
    },
  };
}

