export interface ContentPolishResult {
  files: Record<string, string>;
  changes: string[];
  domain: string;
}

interface DomainCopySet {
  heroTitle: string;
  heroSubtitle: string;
  ctaPrimary: string;
  featureTitlePrefix: string;
  footerTagline: string;
}

const DOMAIN_COPY: Record<string, DomainCopySet> = {
  ecommerce: {
    heroTitle: 'Discover products your customers will love',
    heroSubtitle: 'Launch a high-converting storefront with clear navigation, trust signals and a polished checkout flow.',
    ctaPrimary: 'Shop now',
    featureTitlePrefix: 'Shopping',
    footerTagline: 'A storefront crafted for conversion and repeat orders.',
  },
  restaurant: {
    heroTitle: 'Crafted flavors, delivered with consistency',
    heroSubtitle: 'Present your menu, story and ordering flow in a premium experience across all devices.',
    ctaPrimary: 'View menu',
    featureTitlePrefix: 'Menu',
    footerTagline: 'Fresh ingredients, hot delivery, and a seamless ordering experience.',
  },
  saas: {
    heroTitle: 'Ship product experiences that convert',
    heroSubtitle: 'Structure your pages with reusable sections and keep quality high with deterministic planning.',
    ctaPrimary: 'Start free',
    featureTitlePrefix: 'Product',
    footerTagline: 'Design-forward product experiences.',
  },
  agency: {
    heroTitle: 'Design systems that move your brand forward',
    heroSubtitle: 'Showcase services, proof and outcomes with sharp hierarchy and modern interaction patterns.',
    ctaPrimary: 'Book a call',
    featureTitlePrefix: 'Service',
    footerTagline: 'Creative execution with measurable business outcomes.',
  },
  default: {
    heroTitle: 'Build a modern digital experience',
    heroSubtitle: 'Combine structure, clarity and motion to create a polished interface with real business impact.',
    ctaPrimary: 'Get started',
    featureTitlePrefix: 'Feature',
    footerTagline: 'Design-forward product experiences.',
  },
};

function detectDomain(prompt: string): keyof typeof DOMAIN_COPY {
  const lower = prompt.toLowerCase();
  if (/shop|store|ecommerce|commerce|checkout|cart|product|produkte|warenkorb|einkaufswagen/.test(lower)) return 'ecommerce';
  if (/restaurant|pizza|coffee|cafe|food|menu/.test(lower)) return 'restaurant';
  if (/agency|studio|portfolio|branding|creative/.test(lower)) return 'agency';
  if (/saas|startup|dashboard|analytics|product/.test(lower)) return 'saas';
  return 'default';
}

function replaceAllSafe(input: string, pattern: RegExp, replacement: string): { next: string; changed: boolean } {
  const next = input.replace(pattern, replacement);
  return { next, changed: next !== input };
}

function polishSingleFile(content: string, copy: DomainCopySet, brand: string): { content: string; changes: string[] } {
  let next = content;
  const changes: string[] = [];

  const replacements: Array<{ pattern: RegExp; replacement: string; label: string }> = [
    { pattern: /BuilderKit/g, replacement: brand, label: 'brand_replaced' },
    { pattern: /Lorem ipsum[^"'<\n]*/gi, replacement: copy.heroSubtitle, label: 'lorem_removed' },
    { pattern: /\bFeature\s+[0-9]+\b/g, replacement: `${copy.featureTitlePrefix}`, label: 'generic_feature_name' },
    { pattern: /Welcome to\s+[A-Za-z0-9 _-]+/g, replacement: copy.heroTitle, label: 'generic_hero_title' },
    { pattern: /Design and launch polished products faster\./gi, replacement: copy.heroTitle, label: 'hero_template_replaced' },
    { pattern: /Curated sections \+ AI customization\. Keep full control over code and structure\./gi, replacement: copy.heroSubtitle, label: 'hero_subtitle_template_replaced' },
    { pattern: /Design-forward product experiences\./gi, replacement: copy.footerTagline, label: 'footer_copy_replaced' },
    { pattern: /\bFast setup\b/gi, replacement: `${copy.featureTitlePrefix} setup`, label: 'feature_title_replaced' },
    { pattern: /\bReusable sections\b/gi, replacement: `${copy.featureTitlePrefix} modules`, label: 'feature_title_replaced' },
    { pattern: /\bConversion focus\b/gi, replacement: `${copy.featureTitlePrefix} conversion`, label: 'feature_title_replaced' },
    { pattern: /\bGet started\b/gi, replacement: copy.ctaPrimary, label: 'cta_upgraded' },
    { pattern: /\bLearn more\b/gi, replacement: copy.ctaPrimary, label: 'cta_upgraded' },
    { pattern: /\bStart free\b/gi, replacement: copy.ctaPrimary, label: 'cta_upgraded' },
  ];

  replacements.forEach(({ pattern, replacement, label }) => {
    const result = replaceAllSafe(next, pattern, replacement);
    if (result.changed) {
      next = result.next;
      changes.push(label);
    }
  });

  const subtitleCandidateRegex = /(Discover|Entdecke|Explore|Start from)[^"'<\n]{8,140}/i;
  if (subtitleCandidateRegex.test(next) && /Feature 1|Feature 2|Feature 3/.test(next)) {
    next = next.replace(/Feature 1/g, `${copy.featureTitlePrefix} strategy`);
    next = next.replace(/Feature 2/g, `${copy.featureTitlePrefix} execution`);
    next = next.replace(/Feature 3/g, `${copy.featureTitlePrefix} growth`);
    changes.push('feature_triplet_rewritten');
  }

  return { content: next, changes };
}

function injectMotionUtility(content: string): { content: string; changed: boolean } {
  let next = content;
  let changed = false;

  const classRegex = /className="([^"]+)"/g;
  next = next.replace(classRegex, (full, classes: string) => {
    const hasButtonShape = /\b(px-\d+|py-\d+|rounded)/.test(classes);
    const hasCardShape = /\b(border|shadow|rounded)/.test(classes);
    const hasTransition = /\btransition/.test(classes);
    if (!hasTransition && (hasButtonShape || hasCardShape)) {
      changed = true;
      return `className="${classes} transition-all duration-300"`;
    }
    return full;
  });

  return { content: next, changed };
}

export function polishGeneratedContent(input: {
  files: Record<string, string>;
  prompt: string;
  brand: string;
  injectMotion?: boolean;
}): ContentPolishResult {
  const domain = detectDomain(input.prompt);
  const copy = DOMAIN_COPY[domain];
  const output: Record<string, string> = {};
  const allChanges = new Set<string>();

  Object.entries(input.files).forEach(([path, content]) => {
    if (typeof content !== 'string') {
      output[path] = content;
      return;
    }
    if (!/\.(tsx|ts|jsx|js|html)$/i.test(path)) {
      output[path] = content;
      return;
    }

    const polished = polishSingleFile(content, copy, input.brand);
    let finalContent = polished.content;
    polished.changes.forEach((change) => allChanges.add(change));

    if (input.injectMotion) {
      const motion = injectMotionUtility(finalContent);
      finalContent = motion.content;
      if (motion.changed) allChanges.add('motion_utilities_injected');
    }

    output[path] = finalContent;
  });

  return {
    files: output,
    changes: [...allChanges],
    domain,
  };
}
