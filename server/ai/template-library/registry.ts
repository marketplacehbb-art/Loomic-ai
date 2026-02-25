import { TEMPLATE_BLOCKS } from './blocks.js';
import {
  getExternalLibrarySourcePath,
  getImportedTemplateBlocks,
  getTemplateAnimationPresets as getImportedAnimationPresets,
  getTemplateStyleKits as getImportedStyleKits,
} from './external-library.js';
import {
  BlockCategory,
  TemplateAnimationPreset,
  TemplateBlock,
  TemplateCatalog,
  TemplatePreset,
  TemplateStyleKit,
} from './types.js';

export const TEMPLATE_PRESETS: TemplatePreset[] = [
  {
    id: 'landing-ai',
    name: 'AI Startup Landing',
    description: 'Modern marketing page for AI/SaaS products.',
    mode: 'landing',
    tags: ['landing', 'ai', 'saas', 'marketing'],
    defaultBlocks: ['navbar-saas-01', 'hero-ai-modern-01', 'features-grid-icons-01', 'pricing-three-tier-01', 'footer-simple-01'],
  },
  {
    id: 'landing-minimal',
    name: 'Minimal Landing',
    description: 'Lean product landing with minimal visual noise.',
    mode: 'landing',
    tags: ['landing', 'minimal', 'portfolio'],
    defaultBlocks: ['navbar-saas-01', 'hero-centered-gradient-01', 'features-bento-01', 'pricing-minimal-dark-01', 'footer-simple-01'],
  },
  {
    id: 'landing-commerce',
    name: 'Commerce Landing',
    description: 'Conversion-focused landing for stores, food brands and ecommerce.',
    mode: 'landing',
    tags: ['landing', 'commerce', 'shop', 'restaurant', 'ecommerce'],
    defaultBlocks: ['navbar-commerce-02', 'hero-commerce-showcase-02', 'features-cards-soft-02', 'pricing-highlight-cards-02', 'footer-newsletter-02'],
  },
  {
    id: 'landing-commerce-bold',
    name: 'Commerce Bold Landing',
    description: 'High-energy commerce template for campaigns and launches.',
    mode: 'landing',
    tags: ['landing', 'commerce', 'shop', 'restaurant', 'ecommerce', 'bold', 'conversion'],
    defaultBlocks: ['navbar-neon-04', 'hero-commerce-showcase-02', 'features-showcase-panels-04', 'pricing-contrast-cards-04', 'footer-columns-brand-04'],
  },
  {
    id: 'landing-commerce-minimal',
    name: 'Commerce Minimal Landing',
    description: 'Calm commerce layout with minimal visuals and clean hierarchy.',
    mode: 'landing',
    tags: ['landing', 'commerce', 'shop', 'ecommerce', 'minimal'],
    defaultBlocks: ['navbar-commerce-02', 'hero-centered-gradient-01', 'features-cards-soft-02', 'pricing-minimal-stack-03', 'footer-minimal-center-03'],
  },
  {
    id: 'landing-editorial',
    name: 'Editorial Landing',
    description: 'Premium editorial style with calm typography and spacing.',
    mode: 'landing',
    tags: ['landing', 'premium', 'editorial', 'luxury'],
    defaultBlocks: ['navbar-editorial-03', 'hero-editorial-premium-03', 'features-timeline-03', 'pricing-minimal-stack-03', 'footer-minimal-center-03'],
  },
  {
    id: 'landing-bold',
    name: 'Bold Conversion Landing',
    description: 'High-contrast conversion layout for energetic consumer brands.',
    mode: 'landing',
    tags: ['landing', 'bold', 'conversion', 'creative'],
    defaultBlocks: ['navbar-neon-04', 'hero-gradient-orbit-04', 'features-showcase-panels-04', 'pricing-contrast-cards-04', 'footer-columns-brand-04'],
  },
  {
    id: 'landing-bold-mix',
    name: 'Bold Mix Landing',
    description: 'Bold visual direction with mixed editorial and conversion sections.',
    mode: 'landing',
    tags: ['landing', 'bold', 'creative', 'premium'],
    defaultBlocks: ['navbar-neon-04', 'hero-ai-modern-01', 'features-timeline-03', 'pricing-highlight-cards-02', 'footer-columns-brand-04'],
  },
  {
    id: 'landing-corporate',
    name: 'Corporate B2B Landing',
    description: 'Structured enterprise-friendly landing for serious B2B products.',
    mode: 'landing',
    tags: ['landing', 'corporate', 'b2b', 'enterprise', 'finance'],
    defaultBlocks: ['navbar-corporate-05', 'hero-corporate-clean-05', 'features-checklist-05', 'pricing-enterprise-grid-05', 'footer-legal-05'],
  },
  {
    id: 'dashboard-enterprise',
    name: 'Enterprise Dashboard',
    description: 'Sidebar dashboard with stats and analytics panels.',
    mode: 'dashboard',
    tags: ['dashboard', 'admin', 'analytics', 'enterprise'],
    defaultBlocks: ['sidebar-enterprise-01', 'dashboard-overview-grid-01', 'stats-cards-01', 'chart-area-mock-01', 'footer-enterprise-01'],
  },
  {
    id: 'dashboard-ops',
    name: 'Operations Dashboard',
    description: 'Operational dashboard with compact monitoring-focused UI.',
    mode: 'dashboard',
    tags: ['dashboard', 'operations', 'monitoring', 'analytics', 'enterprise'],
    defaultBlocks: ['sidebar-ops-03', 'dashboard-kpi-ribbon-03', 'stats-tiles-03', 'chart-line-mock-03', 'footer-legal-05'],
  },
  {
    id: 'auth-starter',
    name: 'Auth Starter',
    description: 'Authentication focused starter with polished forms.',
    mode: 'auth',
    tags: ['auth', 'login', 'register'],
    defaultBlocks: ['auth-split-card-01', 'auth-minimal-01', 'footer-simple-01'],
  },
  {
    id: 'auth-modern',
    name: 'Modern Auth',
    description: 'Modern auth shell with split panel and clean legal footer.',
    mode: 'auth',
    tags: ['auth', 'login', 'register', 'modern'],
    defaultBlocks: ['auth-split-minimal-04', 'modal-confirm-clean-02', 'footer-legal-05'],
  },
  {
    id: 'blank-react',
    name: 'Blank React Base',
    description: 'Clean baseline with only core app files.',
    mode: 'landing',
    tags: ['blank', 'base'],
    defaultBlocks: [],
  },
];

function mergeTemplateBlocks(): TemplateBlock[] {
  const baseBlocks = TEMPLATE_BLOCKS;
  const externalBlocks = getImportedTemplateBlocks();
  if (externalBlocks.length === 0) return baseBlocks;

  const merged = new Map<string, TemplateBlock>();
  baseBlocks.forEach((block) => merged.set(block.id, block));
  externalBlocks.forEach((block) => {
    if (!merged.has(block.id)) merged.set(block.id, block);
  });
  return [...merged.values()];
}

export function getAllTemplateBlocks(): TemplateBlock[] {
  return mergeTemplateBlocks();
}

export function getTemplatePreset(templateId: string): TemplatePreset | undefined {
  return TEMPLATE_PRESETS.find((preset) => preset.id === templateId);
}

export function getBlockById(blockId: string): TemplateBlock | undefined {
  return mergeTemplateBlocks().find((block) => block.id === blockId);
}

export function inferPresetFromPrompt(prompt: string): TemplatePreset {
  const lower = prompt.toLowerCase();
  if (/dashboard|analytics|admin|kpi|metrics/.test(lower)) {
    if (/ops|operation|monitor|status/.test(lower)) {
      return getTemplatePreset('dashboard-ops')!;
    }
    return getTemplatePreset('dashboard-enterprise')!;
  }
  if (/shop|store|ecommerce|pizza|restaurant|coffee|cafe|produkte|products|cart|checkout/.test(lower)) {
    return getTemplatePreset('landing-commerce')!;
  }
  if (/corporate|b2b|enterprise|finance|law|consulting/.test(lower)) {
    return getTemplatePreset('landing-corporate')!;
  }
  if (/bold|creative|neon|vibrant|fashion|streetwear|gaming/.test(lower)) {
    return getTemplatePreset('landing-bold')!;
  }
  if (/premium|luxury|editorial|elegant/.test(lower)) {
    return getTemplatePreset('landing-editorial')!;
  }
  if (/auth|login|register|signup|signin/.test(lower)) {
    if (/modern|clean|minimal/.test(lower)) {
      return getTemplatePreset('auth-modern')!;
    }
    return getTemplatePreset('auth-starter')!;
  }
  if (/minimal|clean/.test(lower)) {
    return getTemplatePreset('landing-minimal')!;
  }
  return getTemplatePreset('landing-ai')!;
}

export function getTemplateCatalog(): TemplateCatalog {
  const mergedBlocks = mergeTemplateBlocks();
  const categories = mergedBlocks.reduce<Record<BlockCategory, number>>((acc, block) => {
    acc[block.category] = (acc[block.category] || 0) + 1;
    return acc;
  }, {} as Record<BlockCategory, number>);

  const externalBlocks = getImportedTemplateBlocks();
  const styleKits = getImportedStyleKits();
  const animationPresets = getImportedAnimationPresets();

  return {
    presets: TEMPLATE_PRESETS.map((preset) => ({
      ...preset,
      defaultBlocks: [...preset.defaultBlocks],
    })),
    blockCount: mergedBlocks.length,
    categories,
    externalBlockCount: externalBlocks.length,
    styleKitCount: styleKits.length,
    animationPresetCount: animationPresets.length,
    externalLibrarySourcePath: getExternalLibrarySourcePath(),
  };
}

export function getTemplateStyleKits(): TemplateStyleKit[] {
  return getImportedStyleKits();
}

export function getTemplateAnimationPresets(): TemplateAnimationPreset[] {
  return getImportedAnimationPresets();
}
