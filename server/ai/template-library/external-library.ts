import fs from 'fs';
import path from 'path';
import type { BlockCategory, TemplateAnimationPreset, TemplateBlock, TemplateStyleKit } from './types.js';

interface RawComponentTags {
  industry?: string[];
  tone?: string[];
  theme?: string[];
  premium?: boolean;
}

interface RawComponentCode {
  framework?: string;
  styling?: string;
  snippet?: string;
}

interface RawComponent {
  id?: string;
  name?: string;
  category?: string;
  subcategory?: string;
  tags?: RawComponentTags;
  code?: RawComponentCode;
}

interface RawStyleKitFont {
  family?: string;
}

interface RawStyleKit {
  id?: string;
  name?: string;
  description?: string;
  fonts?: {
    heading?: RawStyleKitFont;
    body?: RawStyleKitFont;
  };
  colors?: Record<string, string>;
  buttons?: Record<string, string>;
}

interface RawAnimationPreset {
  id?: string;
  name?: string;
  description?: string;
  trigger?: string;
  tags?: string[];
}

interface RawExternalLibraryFile {
  components?: RawComponent[];
  styleKits?: RawStyleKit[];
  animationPresets?: RawAnimationPreset[];
}

interface LoadedExternalLibrarySource {
  cacheKey: string;
  sourcePath: string;
  parsed: RawExternalLibraryFile | null;
}

interface ExternalLibraryData {
  sourcePath: string | null;
  importedBlocks: TemplateBlock[];
  styleKits: TemplateStyleKit[];
  animationPresets: TemplateAnimationPreset[];
}

const CATEGORY_MAP: Record<string, BlockCategory> = {
  auth: 'auth',
  banner: 'banner',
  blog: 'blog',
  chart: 'chart',
  charts: 'chart',
  contact: 'contact',
  cta: 'cta',
  dashboard: 'dashboard',
  ecommerce: 'ecommerce',
  faq: 'faq',
  feature: 'features',
  features: 'features',
  footer: 'footer',
  gallery: 'gallery',
  header: 'navbar',
  hero: 'hero',
  modal: 'modal',
  nav: 'navbar',
  navbar: 'navbar',
  navigation: 'navbar',
  pricing: 'pricing',
  'social-proof': 'social-proof',
  socialproof: 'social-proof',
  stats: 'stats',
  team: 'team',
  testimonials: 'testimonials',
  timeline: 'timeline',
};

let cacheKey: string | null = null;
let cacheValue: ExternalLibraryData | null = null;

function toPascalCase(input: string): string {
  const words = input
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) return 'ImportedSection';
  return words
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join('');
}

function stripJsonComments(input: string): string {
  let output = '';
  let inString = false;
  let stringChar = '';
  let escaped = false;
  let inLineComment = false;
  let inBlockComment = false;

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    const next = input[index + 1];

    if (inLineComment) {
      if (char === '\n') {
        inLineComment = false;
        output += char;
      }
      continue;
    }

    if (inBlockComment) {
      if (char === '*' && next === '/') {
        inBlockComment = false;
        index += 1;
      }
      continue;
    }

    if (inString) {
      output += char;
      if (escaped) {
        escaped = false;
        continue;
      }
      if (char === '\\') {
        escaped = true;
        continue;
      }
      if (char === stringChar) {
        inString = false;
        stringChar = '';
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      stringChar = char;
      output += char;
      continue;
    }

    if (char === '/' && next === '/') {
      inLineComment = true;
      index += 1;
      continue;
    }

    if (char === '/' && next === '*') {
      inBlockComment = true;
      index += 1;
      continue;
    }

    output += char;
  }

  return output;
}

function removeTrailingCommas(input: string): string {
  let output = input;
  while (/,(\s*[}\]])/g.test(output)) {
    output = output.replace(/,(\s*[}\]])/g, '$1');
  }
  return output;
}

function normalizeCategory(rawCategory: string | undefined): BlockCategory | null {
  if (!rawCategory) return null;
  const key = rawCategory.trim().toLowerCase().replace(/\s+/g, '-');
  return CATEGORY_MAP[key] || null;
}

function flattenTags(tags?: RawComponentTags): string[] {
  if (!tags) return [];
  const values = new Set<string>();
  (tags.industry || []).forEach((tag) => values.add(String(tag).toLowerCase()));
  (tags.tone || []).forEach((tag) => values.add(String(tag).toLowerCase()));
  (tags.theme || []).forEach((tag) => values.add(String(tag).toLowerCase()));
  if (tags.premium) values.add('premium');
  return [...values];
}

function inferComplexity(tags?: RawComponentTags): 1 | 2 | 3 {
  if (tags?.premium) return 3;
  const tones = (tags?.tone || []).map((entry) => entry.toLowerCase());
  if (tones.some((tone) => ['bold', 'premium', 'modern', 'elegant'].includes(tone))) return 2;
  return 1;
}

function resolveFilePath(category: BlockCategory, componentName: string): string {
  if (category === 'dashboard' || category === 'stats' || category === 'chart' || category === 'sidebar') {
    return `src/components/dashboard/${componentName}.tsx`;
  }
  if (category === 'auth') return `src/components/auth/${componentName}.tsx`;
  if (category === 'modal') return `src/components/ui/${componentName}.tsx`;
  return `src/components/sections/${componentName}.tsx`;
}

function normalizeSnippet(snippet: string | undefined): string | null {
  if (!snippet || !snippet.trim()) return null;
  const trimmed = snippet.trim();

  const obviousPlaceholder =
    /paste your react/i.test(trimmed) ||
    /lorem ipsum/i.test(trimmed) ||
    /feature\s*\d+/i.test(trimmed) ||
    /placeholder/i.test(trimmed) ||
    /todo/i.test(trimmed) ||
    /className="\.\.\."/.test(trimmed) ||
    /\{\s*\/\*\s*\.\.\.\s*\*\/\s*\}/.test(trimmed);
  if (obviousPlaceholder) return null;

  if (/export\s+default\s+function/.test(trimmed)) return trimmed;
  if (/function\s+[A-Za-z][A-Za-z0-9_]*\s*\(/.test(trimmed)) {
    return trimmed.replace(/function\s+([A-Za-z][A-Za-z0-9_]*)\s*\(/, 'export default function $1(');
  }

  return null;
}

function safeText(input: string | undefined): string {
  return String(input || '')
    .replace(/\s+/g, ' ')
    .replace(/[`$\\'"]/g, '')
    .trim();
}

function safeOptionalString(input: unknown): string | undefined {
  if (typeof input !== 'string') return undefined;
  const trimmed = input.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function prettyName(name: string, id: string): string {
  const base = safeText(name) || safeText(id);
  const text = base
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
  return text || 'Modern Section';
}

function buildLeadText(tags: string[], fallback: string): string {
  const major = tags
    .filter((tag) => tag.length >= 3)
    .slice(0, 3)
    .map((tag) => tag.replace(/[-_]/g, ' '));
  if (major.length === 0) return fallback;
  return `Built for ${major.join(', ')} use cases with clean structure and responsive behavior.`;
}

function buildScaffoldCode(
  category: BlockCategory,
  componentName: string,
  displayName: string,
  tags: string[]
): string {
  const leadText = buildLeadText(tags, 'A polished section scaffold generated from your external library.');
  const featureA = safeText(tags[0]) || 'Fast setup';
  const featureB = safeText(tags[1]) || 'Responsive layout';
  const featureC = safeText(tags[2]) || 'Production-ready structure';

  if (category === 'navbar') {
    return `export default function ${componentName}() {
  return (
    <header className="sticky top-0 z-30 border-b border-slate-200/70 bg-white/85 backdrop-blur dark:border-slate-800 dark:bg-slate-950/85">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-6">
        <div className="text-lg font-semibold text-slate-900 dark:text-white">{{projectName}}</div>
        <nav className="hidden items-center gap-6 text-sm text-slate-600 dark:text-slate-300 md:flex">
          <a href="#features" className="hover:text-slate-900 dark:hover:text-white">Features</a>
          <a href="#pricing" className="hover:text-slate-900 dark:hover:text-white">Pricing</a>
          <a href="#contact" className="hover:text-slate-900 dark:hover:text-white">Contact</a>
        </nav>
      </div>
    </header>
  );
}
`;
  }

  if (category === 'hero') {
    return `export default function ${componentName}() {
  return (
    <section id="hero" className="px-6 py-24">
      <div className="mx-auto max-w-5xl space-y-6 text-center">
        <span className="inline-flex rounded-full border border-slate-300 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-slate-600 dark:border-slate-700 dark:text-slate-300">
          ${safeText(displayName)}
        </span>
        <h1 className="text-4xl font-bold tracking-tight text-slate-900 dark:text-white md:text-6xl">
          ${safeText(displayName)}
        </h1>
        <p className="mx-auto max-w-2xl text-base text-slate-600 dark:text-slate-300 md:text-lg">
          ${safeText(leadText)}
        </p>
        <div className="pt-2">
          <button className="rounded-lg bg-slate-900 px-6 py-3 text-sm font-semibold text-white transition hover:bg-slate-700 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200">
            Get started
          </button>
        </div>
      </div>
    </section>
  );
}
`;
  }

  if (category === 'features') {
    return `const ITEMS = [
  { title: '${featureA}', text: '${safeText(leadText)}' },
  { title: '${featureB}', text: 'Composable block structure for faster edits and regeneration.' },
  { title: '${featureC}', text: 'Optimized spacing, hierarchy and accessible markup.' },
];

export default function ${componentName}() {
  return (
    <section id="features" className="px-6 py-20">
      <div className="mx-auto max-w-6xl">
        <h2 className="text-3xl font-bold text-slate-900 dark:text-white">Key features</h2>
        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {ITEMS.map((item) => (
            <article key={item.title} className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white">{item.title}</h3>
              <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{item.text}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
`;
  }

  if (category === 'pricing') {
    return `const PLANS = [
  { name: 'Starter', price: '$19', points: ['Core features', 'Email support'] },
  { name: 'Growth', price: '$49', points: ['Advanced tools', 'Priority support'], featured: true },
  { name: 'Scale', price: '$99', points: ['Unlimited access', 'Dedicated onboarding'] },
];

export default function ${componentName}() {
  return (
    <section id="pricing" className="px-6 py-20">
      <div className="mx-auto max-w-6xl">
        <h2 className="text-3xl font-bold text-slate-900 dark:text-white">Pricing</h2>
        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {PLANS.map((plan) => (
            <article key={plan.name} className={\`rounded-xl border p-6 \${plan.featured ? 'border-slate-900 bg-slate-900 text-white dark:border-slate-100 dark:bg-slate-100 dark:text-slate-900' : 'border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 dark:text-white'}\`}>
              <h3 className="text-lg font-semibold">{plan.name}</h3>
              <p className="mt-2 text-3xl font-bold">{plan.price}</p>
              <ul className="mt-4 space-y-2 text-sm opacity-90">
                {plan.points.map((point) => <li key={point}>{point}</li>)}
              </ul>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
`;
  }

  if (category === 'cta') {
    return `export default function ${componentName}() {
  return (
    <section className="px-6 py-20">
      <div className="mx-auto flex w-full max-w-5xl flex-col items-start gap-4 rounded-2xl border border-slate-200 bg-white p-8 dark:border-slate-800 dark:bg-slate-900">
        <h2 className="text-3xl font-bold text-slate-900 dark:text-white">${safeText(displayName)}</h2>
        <p className="max-w-2xl text-sm text-slate-600 dark:text-slate-300">${safeText(leadText)}</p>
        <button className="rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-700 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200">
          Start now
        </button>
      </div>
    </section>
  );
}
`;
  }

  if (category === 'testimonials' || category === 'social-proof') {
    return `const TESTIMONIALS = [
  { name: 'Alex', role: 'Founder', quote: '${safeText(leadText)}' },
  { name: 'Mina', role: 'Product Lead', quote: 'Great balance between design quality and delivery speed.' },
  { name: 'Sam', role: 'Operations', quote: 'Reliable structure that scales across multiple pages.' },
];

export default function ${componentName}() {
  return (
    <section className="px-6 py-20">
      <div className="mx-auto max-w-6xl">
        <h2 className="text-3xl font-bold text-slate-900 dark:text-white">Loved by teams</h2>
        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {TESTIMONIALS.map((item) => (
            <article key={item.name} className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
              <p className="text-sm text-slate-600 dark:text-slate-300">"{item.quote}"</p>
              <div className="mt-4">
                <p className="text-sm font-semibold text-slate-900 dark:text-white">{item.name}</p>
                <p className="text-xs text-slate-500">{item.role}</p>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
`;
  }

  if (category === 'faq') {
    return `const FAQ = [
  { q: 'How quickly can we launch?', a: 'Most teams ship a polished first version in days, not weeks.' },
  { q: 'Can we customize sections?', a: 'Yes. All sections are modular and easy to update.' },
  { q: 'Is it responsive?', a: 'Yes, layout and spacing adapt to mobile, tablet and desktop.' },
];

export default function ${componentName}() {
  return (
    <section id="faq" className="px-6 py-20">
      <div className="mx-auto max-w-4xl">
        <h2 className="text-3xl font-bold text-slate-900 dark:text-white">FAQ</h2>
        <div className="mt-8 space-y-3">
          {FAQ.map((entry) => (
            <details key={entry.q} className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
              <summary className="cursor-pointer text-sm font-semibold text-slate-900 dark:text-white">{entry.q}</summary>
              <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{entry.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
`;
  }

  if (category === 'team') {
    return `const TEAM = [
  { name: 'Lea Carter', role: 'Creative Director' },
  { name: 'Noah Kim', role: 'Lead Engineer' },
  { name: 'Sara Miles', role: 'Product Strategist' },
];

export default function ${componentName}() {
  return (
    <section className="px-6 py-20">
      <div className="mx-auto max-w-6xl">
        <h2 className="text-3xl font-bold text-slate-900 dark:text-white">Our team</h2>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 md:grid-cols-3">
          {TEAM.map((member) => (
            <article key={member.name} className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
              <div className="h-24 rounded-lg bg-slate-100 dark:bg-slate-800" />
              <h3 className="mt-4 text-sm font-semibold text-slate-900 dark:text-white">{member.name}</h3>
              <p className="text-xs text-slate-500">{member.role}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
`;
  }

  if (category === 'timeline') {
    return `const STEPS = [
  { title: 'Discover', detail: 'Understand goals, users and business constraints.' },
  { title: 'Build', detail: 'Compose scalable UI blocks and reusable flows.' },
  { title: 'Launch', detail: 'Ship with QA checks and clean handoff.' },
];

export default function ${componentName}() {
  return (
    <section className="px-6 py-20">
      <div className="mx-auto max-w-4xl">
        <h2 className="text-3xl font-bold text-slate-900 dark:text-white">Timeline</h2>
        <ol className="mt-8 space-y-4">
          {STEPS.map((step, index) => (
            <li key={step.title} className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Step {index + 1}</p>
              <h3 className="mt-1 text-base font-semibold text-slate-900 dark:text-white">{step.title}</h3>
              <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{step.detail}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
`;
  }

  if (category === 'banner') {
    return `export default function ${componentName}() {
  return (
    <section className="border-y border-slate-200 bg-slate-50 px-6 py-3 text-center text-sm text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200">
      ${safeText(leadText)}
    </section>
  );
}
`;
  }

  if (category === 'contact') {
    return `export default function ${componentName}() {
  return (
    <section id="contact" className="px-6 py-20">
      <div className="mx-auto grid w-full max-w-5xl gap-6 rounded-2xl border border-slate-200 bg-white p-8 dark:border-slate-800 dark:bg-slate-900 md:grid-cols-2">
        <div>
          <h2 className="text-3xl font-bold text-slate-900 dark:text-white">${safeText(displayName)}</h2>
          <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">${safeText(leadText)}</p>
        </div>
        <form className="space-y-3">
          <input className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950" placeholder="Name" />
          <input className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950" placeholder="Email" />
          <textarea className="h-24 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950" placeholder="Message" />
          <button type="button" className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white dark:bg-white dark:text-slate-950">
            Send message
          </button>
        </form>
      </div>
    </section>
  );
}
`;
  }

  if (category === 'blog') {
    return `const POSTS = [
  { title: '${featureA}', excerpt: '${safeText(leadText)}' },
  { title: '${featureB}', excerpt: 'Practical tactics and design decisions for shipping faster.' },
  { title: '${featureC}', excerpt: 'Patterns for maintainable UI systems and better UX quality.' },
];

export default function ${componentName}() {
  return (
    <section className="px-6 py-20">
      <div className="mx-auto max-w-6xl">
        <h2 className="text-3xl font-bold text-slate-900 dark:text-white">Latest articles</h2>
        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {POSTS.map((post) => (
            <article key={post.title} className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
              <h3 className="text-base font-semibold text-slate-900 dark:text-white">{post.title}</h3>
              <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{post.excerpt}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
`;
  }

  if (category === 'gallery') {
    return `const ITEMS = ['One', 'Two', 'Three', 'Four', 'Five', 'Six'];

export default function ${componentName}() {
  return (
    <section className="px-6 py-20">
      <div className="mx-auto max-w-6xl">
        <h2 className="text-3xl font-bold text-slate-900 dark:text-white">Gallery</h2>
        <div className="mt-8 grid gap-3 sm:grid-cols-2 md:grid-cols-3">
          {ITEMS.map((item) => (
            <div key={item} className="aspect-[4/3] rounded-xl border border-slate-200 bg-slate-100 dark:border-slate-800 dark:bg-slate-800" />
          ))}
        </div>
      </div>
    </section>
  );
}
`;
  }

  if (category === 'ecommerce') {
    return `const PRODUCTS = [
  { name: '${featureA}', price: '$29' },
  { name: '${featureB}', price: '$49' },
  { name: '${featureC}', price: '$79' },
];

export default function ${componentName}() {
  return (
    <section className="px-6 py-20">
      <div className="mx-auto max-w-6xl">
        <h2 className="text-3xl font-bold text-slate-900 dark:text-white">Products</h2>
        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {PRODUCTS.map((product) => (
            <article key={product.name} className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
              <div className="aspect-[4/3] rounded-lg bg-slate-100 dark:bg-slate-800" />
              <h3 className="mt-4 text-base font-semibold text-slate-900 dark:text-white">{product.name}</h3>
              <div className="mt-3 flex items-center justify-between">
                <span className="text-sm text-slate-600 dark:text-slate-300">{product.price}</span>
                <button className="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white dark:bg-white dark:text-slate-950">Add to cart</button>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
`;
  }

  if (category === 'footer') {
    return `export default function ${componentName}() {
  return (
    <footer id="contact" className="border-t border-slate-200 px-6 py-10 dark:border-slate-800">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 text-sm text-slate-600 dark:text-slate-300 md:flex-row md:items-center md:justify-between">
        <div className="font-semibold text-slate-900 dark:text-white">{{projectName}}</div>
        <p>Built with structured components and adaptive design tokens.</p>
      </div>
    </footer>
  );
}
`;
  }

  if (category === 'dashboard') {
    return `const METRICS = [
  { label: 'Revenue', value: '$84.2k', trend: '+12%' },
  { label: 'Users', value: '12,480', trend: '+8%' },
  { label: 'Conversion', value: '5.8%', trend: '+1.2%' },
];

export default function ${componentName}() {
  return (
    <section className="grid gap-4 md:grid-cols-3">
      {METRICS.map((metric) => (
        <article key={metric.label} className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <p className="text-xs uppercase tracking-wide text-slate-500">{metric.label}</p>
          <p className="mt-2 text-2xl font-semibold text-slate-900 dark:text-white">{metric.value}</p>
          <p className="mt-1 text-sm text-emerald-500">{metric.trend}</p>
        </article>
      ))}
    </section>
  );
}
`;
  }

  if (category === 'sidebar') {
    return `const ITEMS = ['Overview', 'Analytics', 'Orders', 'Settings'];

export default function ${componentName}() {
  return (
    <aside className="w-64 shrink-0 border-r border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950">
      <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-500">Workspace</h2>
      <nav className="space-y-1">
        {ITEMS.map((item) => (
          <button key={item} className="w-full rounded-lg px-3 py-2 text-left text-sm text-slate-700 transition hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800">
            {item}
          </button>
        ))}
      </nav>
    </aside>
  );
}
`;
  }

  if (category === 'auth') {
    return `export default function ${componentName}() {
  return (
    <section className="mx-auto w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Welcome back</h2>
      <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">${safeText(leadText)}</p>
      <form className="mt-6 space-y-4">
        <input className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-white" placeholder="Email" />
        <input type="password" className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-white" placeholder="Password" />
        <button type="button" className="w-full rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white dark:bg-white dark:text-slate-950">
          Sign in
        </button>
      </form>
    </section>
  );
}
`;
  }

  if (category === 'stats') {
    return `const STATS = [
  { label: 'Projects', value: '240+' },
  { label: 'Satisfaction', value: '98%' },
  { label: 'Response time', value: '2h' },
];

export default function ${componentName}() {
  return (
    <section className="grid gap-4 md:grid-cols-3">
      {STATS.map((entry) => (
        <article key={entry.label} className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <p className="text-xs uppercase tracking-wide text-slate-500">{entry.label}</p>
          <p className="mt-2 text-2xl font-semibold text-slate-900 dark:text-white">{entry.value}</p>
        </article>
      ))}
    </section>
  );
}
`;
  }

  if (category === 'chart') {
    return `const BARS = [72, 48, 91, 63, 84, 58, 76];

export default function ${componentName}() {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
      <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Performance</h3>
      <div className="mt-6 flex h-40 items-end gap-2">
        {BARS.map((value, index) => (
          <div key={index} className="flex-1 rounded-t bg-slate-900/80 dark:bg-slate-100/80" style={{ height: \`\${value}%\` }} />
        ))}
      </div>
    </section>
  );
}
`;
  }

  if (category === 'modal') {
    return `export default function ${componentName}() {
  return (
    <section className="mx-auto w-full max-w-lg rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <h3 className="text-lg font-semibold text-slate-900 dark:text-white">${safeText(displayName)}</h3>
      <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">${safeText(leadText)}</p>
      <div className="mt-5 flex gap-3">
        <button type="button" className="rounded-lg border border-slate-300 px-4 py-2 text-sm dark:border-slate-700">Cancel</button>
        <button type="button" className="rounded-lg bg-slate-900 px-4 py-2 text-sm text-white dark:bg-white dark:text-slate-950">Confirm</button>
      </div>
    </section>
  );
}
`;
  }

  return `export default function ${componentName}() {
  return (
    <section className="px-6 py-16">
      <div className="mx-auto max-w-4xl rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
        <h2 className="text-2xl font-bold text-slate-900 dark:text-white">${safeText(displayName)}</h2>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">${safeText(leadText)}</p>
      </div>
    </section>
  );
}
`;
}

function parseStyleKits(raw: RawStyleKit[] | undefined): TemplateStyleKit[] {
  if (!raw || raw.length === 0) return [];
  const kits: TemplateStyleKit[] = [];
  raw.forEach((entry) => {
    const id = safeOptionalString(entry.id);
    const name = safeOptionalString(entry.name);
    if (!id || !name) return;

    const description = safeOptionalString(entry.description) || '';
    const headingFont = safeOptionalString(entry.fonts?.heading?.family);
    const bodyFont = safeOptionalString(entry.fonts?.body?.family);

    const colorHints = {
      primary: safeOptionalString(entry.colors?.primary),
      accent: safeOptionalString(entry.colors?.accent),
      background: safeOptionalString(entry.colors?.background),
    };
    const buttonHints = {
      primary: safeOptionalString(entry.buttons?.primary),
      secondary: safeOptionalString(entry.buttons?.secondary),
    };

    const tags = [description, name]
      .map((value) => value.toLowerCase().trim())
      .filter(Boolean);

    kits.push({
      id,
      name,
      description,
      headingFont,
      bodyFont,
      colorHints,
      buttonHints,
      tags,
    });
  });
  return kits;
}

function parseAnimationPresets(raw: RawAnimationPreset[] | undefined): TemplateAnimationPreset[] {
  if (!raw || raw.length === 0) return [];
  return raw
    .map((entry) => {
      if (!entry.id || !entry.name) return null;
      return {
        id: String(entry.id),
        name: String(entry.name),
        description: String(entry.description || ''),
        trigger: String(entry.trigger || ''),
        tags: (entry.tags || []).map((tag) => String(tag).toLowerCase()),
      } satisfies TemplateAnimationPreset;
    })
    .filter((entry): entry is TemplateAnimationPreset => Boolean(entry));
}

function parseImportedBlocks(raw: RawComponent[] | undefined): TemplateBlock[] {
  if (!raw || raw.length === 0) return [];

  const parsed: TemplateBlock[] = [];
  raw.forEach((component) => {
    const id = String(component.id || '').trim();
    const category = normalizeCategory(component.category);
    if (!id || !category) return;

    const componentName = toPascalCase(component.name || id);
    const tags = flattenTags(component.tags);
    const normalizedSnippet = normalizeSnippet(component.code?.snippet);
    if (!normalizedSnippet) {
      // Strict quality policy: block scaffold/placeholder-only external snippets.
      void buildScaffoldCode(category, componentName, prettyName(component.name || '', id), tags);
      return;
    }
    const displayName = prettyName(component.name || '', id);
    const code = normalizedSnippet;
    const qualityTier = tags.includes('premium') ? 'premium' : 'good';
    const finalTags = tags.filter((tag) => tag !== 'scaffolded');
    parsed.push({
      id: `ext-${id}`,
      category,
      style: String(component.subcategory || 'external').toLowerCase(),
      mood: tags.includes('premium') ? 'premium' : (tags.find((tag) => ['modern', 'minimal', 'bold', 'clean'].includes(tag)) || 'custom'),
      layout: String(component.subcategory || 'custom'),
      supportsDarkMode: tags.includes('dark') || tags.includes('theme:dark') || tags.includes('premium'),
      tags: finalTags,
      complexity: inferComplexity(component.tags),
      qualityTier,
      componentName,
      filePath: resolveFilePath(category, componentName),
      code,
    });
  });

  return parsed;
}

function tryParseExternalLibrary(rawSource: string): RawExternalLibraryFile | null {
  try {
    return JSON.parse(rawSource) as RawExternalLibraryFile;
  } catch {
    // Ignore and retry with relaxed parsing.
  }

  try {
    const noComments = stripJsonComments(rawSource);
    const noTrailingCommas = removeTrailingCommas(noComments);
    return JSON.parse(noTrailingCommas) as RawExternalLibraryFile;
  } catch (error) {
    console.warn('[TemplateLibrary] Failed to parse external UI schema:', error);
    return null;
  }
}

function buildCandidatePaths(): string[] {
  const candidates = new Set<string>();
  const envPath = process.env.UI_COMPONENT_LIBRARY_PATH?.trim();
  if (envPath) candidates.add(path.resolve(envPath));

  candidates.add(path.resolve(process.cwd(), 'data', 'ui-library'));
  candidates.add(path.resolve(process.cwd(), 'ui-component-library-schema.json'));
  candidates.add(path.resolve(process.cwd(), 'data', 'ui-component-library-schema.json'));

  const userHome = process.env.USERPROFILE || process.env.HOME;
  if (userHome) {
    candidates.add(path.resolve(userHome, 'Downloads', 'ui-component-library-schema.json'));
  }

  return [...candidates];
}

function listJsonFiles(dirPath: string): string[] {
  if (!fs.existsSync(dirPath)) return [];
  return fs.readdirSync(dirPath)
    .filter((entry) => entry.toLowerCase().endsWith('.json'))
    .sort()
    .map((entry) => path.join(dirPath, entry));
}

function parseRawExternalChunk(rawSource: string): RawExternalLibraryFile | null {
  return tryParseExternalLibrary(rawSource);
}

function appendChunk(target: RawExternalLibraryFile, chunk: RawExternalLibraryFile | null): void {
  if (!chunk) return;
  if (Array.isArray(chunk.components) && chunk.components.length > 0) {
    target.components = [...(target.components || []), ...chunk.components];
  }
  if (Array.isArray(chunk.styleKits) && chunk.styleKits.length > 0) {
    target.styleKits = [...(target.styleKits || []), ...chunk.styleKits];
  }
  if (Array.isArray(chunk.animationPresets) && chunk.animationPresets.length > 0) {
    target.animationPresets = [...(target.animationPresets || []), ...chunk.animationPresets];
  }
}

function loadModularExternalLibrary(dirPath: string): LoadedExternalLibrarySource | null {
  const componentFiles = listJsonFiles(path.join(dirPath, 'components'));
  const styleKitFiles = listJsonFiles(path.join(dirPath, 'style-kits'));
  const animationFiles = listJsonFiles(path.join(dirPath, 'animations'));
  const rootFiles = listJsonFiles(dirPath)
    .filter((filePath) => {
      const name = path.basename(filePath).toLowerCase();
      return name === 'index.json' || name === 'meta.json';
    });

  const allFiles = [...rootFiles, ...componentFiles, ...styleKitFiles, ...animationFiles];
  if (allFiles.length === 0) return null;

  const aggregated: RawExternalLibraryFile = {
    components: [],
    styleKits: [],
    animationPresets: [],
  };

  const keyParts = [dirPath];
  allFiles.forEach((filePath) => {
    const stats = fs.statSync(filePath);
    keyParts.push(`${path.relative(dirPath, filePath)}:${stats.mtimeMs}:${stats.size}`);
    const source = fs.readFileSync(filePath, 'utf8');
    appendChunk(aggregated, parseRawExternalChunk(source));
  });

  return {
    cacheKey: keyParts.join('|'),
    sourcePath: dirPath,
    parsed: aggregated,
  };
}

function loadSingleExternalLibraryFile(filePath: string): LoadedExternalLibrarySource | null {
  if (!fs.existsSync(filePath)) return null;
  const stats = fs.statSync(filePath);
  if (!stats.isFile()) return null;
  const source = fs.readFileSync(filePath, 'utf8');
  return {
    cacheKey: `${filePath}:${stats.mtimeMs}:${stats.size}`,
    sourcePath: filePath,
    parsed: tryParseExternalLibrary(source),
  };
}

function loadExternalLibraryData(): ExternalLibraryData {
  const candidates = buildCandidatePaths();
  for (const candidatePath of candidates) {
    if (!fs.existsSync(candidatePath)) continue;
    const stats = fs.statSync(candidatePath);
    const loadedSource = stats.isDirectory()
      ? loadModularExternalLibrary(candidatePath)
      : loadSingleExternalLibraryFile(candidatePath);
    if (!loadedSource) continue;
    const nextKey = loadedSource.cacheKey;
    if (cacheKey === nextKey && cacheValue) {
      return cacheValue;
    }

    const parsed = loadedSource.parsed;
    if (!parsed) {
      cacheKey = nextKey;
      cacheValue = {
        sourcePath: loadedSource.sourcePath,
        importedBlocks: [],
        styleKits: [],
        animationPresets: [],
      };
      return cacheValue;
    }

    const loaded: ExternalLibraryData = {
      sourcePath: loadedSource.sourcePath,
      importedBlocks: parseImportedBlocks(parsed.components),
      styleKits: parseStyleKits(parsed.styleKits),
      animationPresets: parseAnimationPresets(parsed.animationPresets),
    };
    cacheKey = nextKey;
    cacheValue = loaded;
    return loaded;
  }

  const empty: ExternalLibraryData = {
    sourcePath: null,
    importedBlocks: [],
    styleKits: [],
    animationPresets: [],
  };
  cacheKey = 'none';
  cacheValue = empty;
  return empty;
}

export function getImportedTemplateBlocks(): TemplateBlock[] {
  return loadExternalLibraryData().importedBlocks;
}

export function getTemplateStyleKits(): TemplateStyleKit[] {
  return loadExternalLibraryData().styleKits;
}

export function getTemplateAnimationPresets(): TemplateAnimationPreset[] {
  return loadExternalLibraryData().animationPresets;
}

export function getExternalLibrarySourcePath(): string | null {
  return loadExternalLibraryData().sourcePath;
}
