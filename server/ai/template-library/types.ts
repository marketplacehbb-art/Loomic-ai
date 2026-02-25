export type BlockCategory =
  | 'hero'
  | 'banner'
  | 'features'
  | 'testimonials'
  | 'team'
  | 'timeline'
  | 'blog'
  | 'gallery'
  | 'ecommerce'
  | 'social-proof'
  | 'pricing'
  | 'cta'
  | 'faq'
  | 'contact'
  | 'dashboard'
  | 'sidebar'
  | 'auth'
  | 'modal'
  | 'stats'
  | 'chart'
  | 'navbar'
  | 'footer';

export type TemplateBlockQualityTier = 'premium' | 'good' | 'draft';

export interface TemplateBlock {
  id: string;
  category: BlockCategory;
  style: string;
  mood: string;
  layout: string;
  supportsDarkMode: boolean;
  tags: string[];
  complexity: 1 | 2 | 3;
  qualityTier?: TemplateBlockQualityTier;
  componentName: string;
  filePath: string;
  code: string;
}

export interface TemplatePreset {
  id: string;
  name: string;
  description: string;
  mode: 'landing' | 'dashboard' | 'auth';
  tags: string[];
  defaultBlocks: string[];
}

export interface TemplateStyleKit {
  id: string;
  name: string;
  description: string;
  headingFont?: string;
  bodyFont?: string;
  colorHints: {
    primary?: string;
    accent?: string;
    background?: string;
  };
  buttonHints: {
    primary?: string;
    secondary?: string;
  };
  tags: string[];
}

export interface TemplateAnimationPreset {
  id: string;
  name: string;
  description: string;
  trigger: string;
  tags: string[];
}

export interface TemplateCatalog {
  presets: Array<Omit<TemplatePreset, 'defaultBlocks'> & { defaultBlocks: string[] }>;
  blockCount: number;
  categories: Record<BlockCategory, number>;
  externalBlockCount?: number;
  styleKitCount?: number;
  animationPresetCount?: number;
  externalLibrarySourcePath?: string | null;
}

export interface ComposedTemplateProject {
  preset: TemplatePreset;
  selectedBlocks: TemplateBlock[];
  projectName: string;
  files: Record<string, string>;
  compositionPrompt: string;
}
