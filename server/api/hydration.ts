import { getGroqApiKey } from '../utils/env-security.js';

export type FileMap = Record<string, string>;

export interface HydratedContext {
  intent: string;
  targetFiles: string[];
  componentList: string[];
  keyContent: string[];
  needsSupabase: boolean;
  colorScheme: string;
  complexity: 'simple' | 'moderate' | 'complex';
}

export type HydrationIndustry =
  | 'restaurant'
  | 'saas'
  | 'portfolio'
  | 'ecommerce'
  | 'dashboard'
  | 'wedding'
  | 'photography'
  | 'fitness'
  | 'medical'
  | 'realestate'
  | 'music'
  | 'education'
  | 'legal'
  | 'nonprofit'
  | 'startup';

const HYDRATION_TIMEOUT_MS = 1900;
const MAX_TARGET_FILES = 12;
const MAX_COMPONENTS = 16;

const REPAIR_OR_FIX_SIGNAL_REGEX = /\b(repair|fix|bugfix|hotfix|debug|resolve error|fehler beheben|issue fix)\b/i;
const EXPLICIT_COMPLEX_SIGNAL_REGEX = /\b(authentication|database|multi[-\s]?page app|real[-\s]?time features?|file uploads?)\b/i;
const SUPABASE_INTENT_REGEX = /\b(login|register|auth|user|database|save data|store|real[-\s]?time|backend)\b/i;

const COMPONENT_KEYWORDS: Array<{ regex: RegExp; components: string[] }> = [
  { regex: /\b(hero|landing|headline)\b/i, components: ['HeroSection'] },
  { regex: /\b(nav|navbar|menu|header)\b/i, components: ['NavBar'] },
  { regex: /\b(pricing|plan|tier)\b/i, components: ['PricingCard'] },
  { regex: /\b(feature|benefit)\b/i, components: ['FeatureGrid'] },
  { regex: /\b(testimonial|review)\b/i, components: ['Testimonials'] },
  { regex: /\b(faq|question)\b/i, components: ['FAQSection'] },
  { regex: /\b(contact|form|booking|termin)\b/i, components: ['ContactForm'] },
  { regex: /\b(footer)\b/i, components: ['Footer'] },
  { regex: /\b(gallery|portfolio|showcase)\b/i, components: ['GallerySection'] },
  { regex: /\b(card|grid|tile)\b/i, components: ['CardGrid'] },
];

export function inferIndustryFromPrompt(prompt: string): HydrationIndustry {
  const lower = String(prompt || '').toLowerCase();

  if (/\b(wedding|marriage|ceremony)\b/.test(lower)) return 'wedding';
  if (/\b(photography|photographer|photos|shots)\b/.test(lower)) return 'photography';
  if (/\b(medical|clinic|doctor|healthcare|dental)\b/.test(lower)) return 'medical';
  if (/\b(fitness|gym|workout|trainer|health)\b/.test(lower)) return 'fitness';
  if (/\b(real estate|property|apartment|house)\b/.test(lower)) return 'realestate';
  if (/\b(music|band|artist|concert|album)\b/.test(lower)) return 'music';
  if (/\b(dashboard|analytics|admin panel)\b/.test(lower)) return 'dashboard';
  if (/\b(education|course|learning|tutorial)\b/.test(lower)) return 'education';
  if (/\b(legal|lawyer|attorney|law firm)\b/.test(lower)) return 'legal';
  if (/\b(nonprofit|charity|donation)\b/.test(lower)) return 'nonprofit';
  if (/\b(startup|product launch|waitlist)\b/.test(lower)) return 'startup';

  if (/\b(restaurant|pizza|cafe|bistro|food)\b/.test(lower)) return 'restaurant';
  if (/\b(portfolio|showcase|agency|studio)\b/.test(lower)) return 'portfolio';
  if (/\b(ecommerce|e-commerce|shop|store|product)\b/.test(lower)) return 'ecommerce';

  return 'saas';
}

function truncate(input: string, max = 240): string {
  const normalized = String(input || '').trim().replace(/\s+/g, ' ');
  if (normalized.length <= max) return normalized;
  return `${normalized.slice(0, max - 3)}...`;
}

function summarizeFiles(files: FileMap): { paths: string[]; count: number } {
  const paths = Object.keys(files || {})
    .map((path) => String(path || '').trim().replace(/\\/g, '/'))
    .filter(Boolean)
    .sort((a, b) => {
      if (a === 'src/App.tsx') return -1;
      if (b === 'src/App.tsx') return 1;
      return a.localeCompare(b);
    })
    .slice(0, 40);

  return {
    paths,
    count: Object.keys(files || {}).length,
  };
}

function inferColorScheme(prompt: string): string {
  const lower = String(prompt || '').toLowerCase();
  if (/\b(dark|black|night|dunkel|nacht)\b/.test(lower)) return 'dark';
  if (/\b(light|white|clean|minimal|hell)\b/.test(lower)) return 'light';
  if (/\b(colorful|vibrant|bold|bunt)\b/.test(lower)) return 'colorful';
  return 'dark';
}

function normalizeColorScheme(value: unknown, fallback: string): string {
  const lower = String(value || '').toLowerCase();
  if (/\b(dark|black|night|dunkel|nacht)\b/.test(lower)) return 'dark';
  if (/\b(light|white|clean|minimal|hell)\b/.test(lower)) return 'light';
  if (/\b(colorful|vibrant|bold|bunt)\b/.test(lower)) return 'colorful';
  return inferColorScheme(fallback);
}

function inferComponents(prompt: string): string[] {
  const deduped = new Set<string>();
  const normalized = String(prompt || '');
  COMPONENT_KEYWORDS.forEach((entry) => {
    if (entry.regex.test(normalized)) {
      entry.components.forEach((component) => deduped.add(component));
    }
  });
  if (deduped.size === 0) {
    deduped.add('HeroSection');
    deduped.add('NavBar');
    deduped.add('CallToAction');
  }
  return [...deduped].slice(0, MAX_COMPONENTS);
}

function inferComplexity(prompt: string, files: FileMap): HydratedContext['complexity'] {
  const normalizedPrompt = String(prompt || '');
  const wordCount = normalizedPrompt.trim().split(/\s+/).filter(Boolean).length;
  const fileCount = Object.keys(files || {}).length;

  if (REPAIR_OR_FIX_SIGNAL_REGEX.test(normalizedPrompt)) return 'simple';
  if (wordCount < 150 && fileCount === 0) return 'simple';
  if (EXPLICIT_COMPLEX_SIGNAL_REGEX.test(normalizedPrompt)) return 'complex';

  if (fileCount > 0 || wordCount > 120) return 'moderate';
  return 'simple';
}

function detectNeedsSupabase(prompt: string): boolean {
  return SUPABASE_INTENT_REGEX.test(String(prompt || ''));
}

function inferKeyContent(prompt: string, componentList: string[]): string[] {
  const items = new Set<string>();
  const normalized = String(prompt || '').toLowerCase();
  if (/\b(nav|navbar|navigation|menu)\b/.test(normalized)) items.add('navigation');
  if (/\b(hero|landing)\b/.test(normalized)) items.add('hero');
  if (/\b(feature|benefit)\b/.test(normalized)) items.add('features');
  if (/\b(pricing|plan|tier)\b/.test(normalized)) items.add('pricing');
  if (/\b(testimonial|review)\b/.test(normalized)) items.add('testimonials');
  if (/\b(faq|question)\b/.test(normalized)) items.add('faq');
  if (/\b(contact|form)\b/.test(normalized)) items.add('contact');
  if (detectNeedsSupabase(prompt)) items.add('supabase');

  componentList.forEach((component) => {
    const lower = String(component || '').toLowerCase();
    if (lower.includes('hero')) items.add('hero');
    if (lower.includes('nav')) items.add('navigation');
    if (lower.includes('feature')) items.add('features');
    if (lower.includes('pricing')) items.add('pricing');
    if (lower.includes('faq')) items.add('faq');
    if (lower.includes('footer')) items.add('footer');
  });

  if (items.size === 0) {
    items.add('layout');
  }

  return [...items].slice(0, 12);
}

function buildFallbackContext(prompt: string, files: FileMap): HydratedContext {
  const summary = summarizeFiles(files);
  const componentList = inferComponents(prompt);
  const needsSupabase = detectNeedsSupabase(prompt);
  const keyContent = inferKeyContent(prompt, componentList);
  if (needsSupabase && !keyContent.includes('supabase')) {
    keyContent.push('supabase');
  }
  const targetFiles = summary.count === 0
    ? []
    : summary.paths
      .filter((path) => /^src\/.*\.(tsx|ts|jsx|js|css)$/.test(path))
      .slice(0, MAX_TARGET_FILES);

  return {
    intent: truncate(prompt || 'Generate a complete implementation for the request.', 140) || 'Generate implementation for the request.',
    targetFiles,
    componentList,
    keyContent,
    needsSupabase,
    colorScheme: inferColorScheme(prompt),
    complexity: inferComplexity(prompt, files),
  };
}

function sanitizeHydratedContext(raw: any, fallback: HydratedContext): HydratedContext {
  const intent = truncate(typeof raw?.intent === 'string' ? raw.intent : fallback.intent, 180) || fallback.intent;
  const rawTargets = Array.isArray(raw?.targetFiles) ? raw.targetFiles : fallback.targetFiles;
  const targetFiles = rawTargets
    .map((value: unknown) => String(value || '').trim().replace(/\\/g, '/'))
    .filter(Boolean)
    .slice(0, MAX_TARGET_FILES);
  const rawComponents = Array.isArray(raw?.componentList) ? raw.componentList : fallback.componentList;
  const componentList = rawComponents
    .map((value: unknown) => String(value || '').trim())
    .filter(Boolean)
    .slice(0, MAX_COMPONENTS);
  const rawKeyContent = Array.isArray(raw?.keyContent) ? raw.keyContent : fallback.keyContent;
  const keyContent = rawKeyContent
    .map((value: unknown) => String(value || '').trim().toLowerCase())
    .filter(Boolean)
    .slice(0, 12);
  const needsSupabase = Boolean(
    typeof raw?.needsSupabase === 'boolean'
      ? raw.needsSupabase
      : fallback.needsSupabase
  );
  if (needsSupabase && !keyContent.includes('supabase')) {
    keyContent.push('supabase');
  }
  const colorScheme = normalizeColorScheme(
    typeof raw?.colorScheme === 'string' ? raw.colorScheme : fallback.colorScheme,
    fallback.colorScheme
  );
  const complexityRaw = String(raw?.complexity || '').toLowerCase();
  const complexity: HydratedContext['complexity'] =
    complexityRaw === 'complex' || complexityRaw === 'moderate' || complexityRaw === 'simple'
      ? complexityRaw
      : fallback.complexity;

  return {
    intent,
    targetFiles,
    componentList: componentList.length > 0 ? componentList : fallback.componentList,
    keyContent: keyContent.length > 0 ? keyContent : fallback.keyContent,
    needsSupabase,
    colorScheme,
    complexity,
  };
}

function parseJsonObject(raw: string): any | null {
  const text = String(raw || '').trim();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    // Try to recover if model wrapped JSON in markdown/prose
    const firstBrace = text.indexOf('{');
    const lastBrace = text.lastIndexOf('}');
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      const sliced = text.slice(firstBrace, lastBrace + 1);
      try {
        return JSON.parse(sliced);
      } catch {
        return null;
      }
    }
    return null;
  }
}

async function callFastHydrationLLM(prompt: string, files: FileMap, signal: AbortSignal): Promise<HydratedContext | null> {
  const fallback = buildFallbackContext(prompt, files);
  const fileSummary = summarizeFiles(files);
  const requestPayload = {
    user_prompt: truncate(prompt, 1800),
    existing_file_count: fileSummary.count,
    existing_file_paths: fileSummary.paths,
  };

  const systemPrompt = [
    'You are a hydration preprocessor.',
    'Return ONLY valid JSON.',
    'No markdown. No prose. No code fences.',
    'Schema:',
    '{',
    '  "intent": "string (one sentence)",',
    '  "targetFiles": ["string"],',
    '  "componentList": ["string"],',
    '  "keyContent": ["string"],',
    '  "needsSupabase": "boolean",',
    '  "colorScheme": "string",',
    '  "complexity": "simple|moderate|complex"',
    '}',
    'Rules:',
    '- targetFiles must be empty array for new projects (when existing_file_count is 0).',
    '- Keep intent concise and implementation-oriented.',
    '- Keep componentList specific but short.',
    '- keyContent should contain important functional tags from prompt.',
    '- If prompt includes login/register/auth/user/database/save data/store/real-time/backend, add "supabase" to keyContent and set needsSupabase=true.',
    '- needsSupabase must be true only when backend/data/auth intent is explicit; otherwise false.',
    '- Infer industry internally from prompt keywords. Supported industries: wedding, photography, fitness, medical, realestate, music, education, legal, nonprofit, startup, dashboard, restaurant, portfolio, ecommerce, saas.',
    '- If industry is unclear, default to saas visual profile.',
    '- colorScheme must be exactly one of: dark, light, colorful.',
    '- Use colorScheme=dark when prompt mentions dark/black/night.',
    '- Use colorScheme=light when prompt mentions light/white/clean/minimal.',
    '- Use colorScheme=colorful when prompt mentions colorful/vibrant/bold.',
    '- Default colorScheme to dark when unclear.',
    '- For repair/fix requests, ALWAYS return complexity: "simple".',
    '- For prompts under 150 words with no existing files, ALWAYS return complexity: "simple".',
    '- Only return complexity: "complex" if the request explicitly mentions: authentication, database, multi-page app, real-time features, or file uploads.',
  ].join('\n');

  const userPrompt = `Hydrate this request:\n${JSON.stringify(requestPayload)}`;

  const groqKey = getGroqApiKey();
  if (groqKey) {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${groqKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'llama3-8b-8192',
        temperature: 0,
        max_tokens: 220,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
      }),
      signal,
    });

    if (response.ok) {
      const body: any = await response.json();
      const content = body?.choices?.[0]?.message?.content;
      const parsed = parseJsonObject(typeof content === 'string' ? content : '');
      if (parsed) return sanitizeHydratedContext(parsed, fallback);
    }
  }

  return null;
}

export async function hydratePrompt(prompt: string, files: FileMap): Promise<HydratedContext> {
  const fallback = buildFallbackContext(prompt, files);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), HYDRATION_TIMEOUT_MS);
  try {
    const hydrated = await callFastHydrationLLM(prompt, files, controller.signal);
    return hydrated || fallback;
  } catch {
    return fallback;
  } finally {
    clearTimeout(timeout);
  }
}
