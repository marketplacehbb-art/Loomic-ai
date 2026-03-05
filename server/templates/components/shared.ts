export type ComponentCategory =
  | 'navigation'
  | 'hero'
  | 'feature'
  | 'social-proof'
  | 'pricing'
  | 'form'
  | 'card'
  | 'data-display'
  | 'layout'
  | 'media'
  | 'feedback'
  | 'ecommerce'
  | 'dashboard'
  | 'marketing';

export interface ComponentSeed {
  name: string;
  description: string;
  tags: string[];
  defaultProps?: Record<string, unknown>;
  supabaseRequired?: boolean;
  structure?: string;
}

export interface ComponentLibraryEntry {
  name: string;
  description: string;
  category: ComponentCategory;
  tags: string[];
  defaultProps: Record<string, unknown>;
  supabaseRequired: boolean;
  structure: string;
}

const CATEGORY_STYLES: Record<ComponentCategory, string> = {
  navigation: 'border-b border-slate-800 bg-slate-950/85 backdrop-blur',
  hero: 'relative overflow-hidden bg-gradient-to-br from-slate-950 via-slate-900 to-purple-950 py-24',
  feature: 'bg-slate-950 py-20',
  'social-proof': 'bg-slate-900 py-16',
  pricing: 'bg-slate-950 py-20',
  form: 'bg-slate-950 py-16',
  card: 'rounded-2xl border border-slate-800 bg-slate-900 p-6',
  'data-display': 'rounded-2xl border border-slate-800 bg-slate-900 p-6',
  layout: 'py-16',
  media: 'py-16',
  feedback: 'rounded-xl border border-slate-800 bg-slate-900 p-4',
  ecommerce: 'bg-slate-950 py-16',
  dashboard: 'rounded-2xl border border-slate-800 bg-slate-900 p-6',
  marketing: 'bg-slate-950 py-16',
};

const CATEGORY_LABELS: Record<ComponentCategory, string> = {
  navigation: 'Navigation',
  hero: 'Hero',
  feature: 'Feature',
  'social-proof': 'Social Proof',
  pricing: 'Pricing',
  form: 'Form',
  card: 'Card',
  'data-display': 'Data Display',
  layout: 'Layout',
  media: 'Media',
  feedback: 'Feedback',
  ecommerce: 'E-Commerce',
  dashboard: 'Dashboard',
  marketing: 'Marketing',
};

const buildDefaultStructure = (name: string, description: string, category: ComponentCategory): string => {
  const categoryLabel = CATEGORY_LABELS[category];
  const rootClass = CATEGORY_STYLES[category];

  return [
    `export function ${name}(props: Record<string, unknown>) {`,
    '  return (',
    `    <section className="${rootClass}">`,
    '      <div className="mx-auto max-w-6xl px-4 md:px-6">',
    '        <div className="rounded-2xl border border-slate-800/80 bg-slate-900/70 p-6 shadow-lg shadow-black/25">',
    `          <p className="text-xs font-medium uppercase tracking-[0.14em] text-purple-300">${categoryLabel} component</p>`,
    `          <h2 className="mt-2 text-2xl font-semibold text-white">${name}</h2>`,
    `          <p className="mt-3 text-sm leading-relaxed text-slate-300">${description}</p>`,
    '          <div className="mt-6 rounded-xl border border-dashed border-slate-700 p-4 text-sm text-slate-400">',
    '            Extend this scaffold with concrete fields, data bindings, and interactions.',
    '          </div>',
    '        </div>',
    '      </div>',
    '    </section>',
    '  );',
    '}',
  ].join('\n');
};

export const buildComponentLibrary = (
  category: ComponentCategory,
  seeds: ComponentSeed[]
): ComponentLibraryEntry[] => {
  return seeds.map((seed) => ({
    name: seed.name,
    description: seed.description,
    category,
    tags: Array.from(new Set(seed.tags.map((tag) => tag.toLowerCase()))),
    defaultProps: seed.defaultProps ?? {},
    supabaseRequired: Boolean(seed.supabaseRequired),
    structure: seed.structure ?? buildDefaultStructure(seed.name, seed.description, category),
  }));
};
