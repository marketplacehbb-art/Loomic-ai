import type { HydrationIndustry } from '../api/hydration.js';

export interface IndustryVisualDNA {
  heroSection: string;
  heroHeading: string;
  heroSubtext: string;
  primaryButton: string;
  secondaryButton: string;
  sectionBg: [string, string, string];
  cardStyle: string;
  accentColor: string;
  badge: string;
}

export interface IndustryProfile {
  colorPalette: [string, string, string, string];
  visualDNA: IndustryVisualDNA;
  fonts: {
    heading: string;
    body: string;
  };
}

export const INDUSTRY_PROFILES: Record<HydrationIndustry, IndustryProfile> = {
  restaurant: {
    colorPalette: ['from-stone-900', 'via-amber-950', 'to-stone-900', 'text-amber-400'],
    fonts: { heading: 'Playfair Display', body: 'Inter' },
    visualDNA: {
      heroSection: 'bg-gradient-to-br from-stone-900 via-amber-950 to-stone-900',
      heroHeading: 'text-6xl font-bold text-amber-100 tracking-tight font-serif',
      heroSubtext: 'text-xl text-amber-200/70',
      primaryButton: 'bg-amber-600 hover:bg-amber-500 text-white px-8 py-3 rounded-xl font-semibold',
      secondaryButton: 'border border-amber-600/50 text-amber-200 hover:border-amber-400 px-8 py-3 rounded-xl',
      sectionBg: ['bg-stone-950', 'bg-amber-950/20', 'bg-stone-900'],
      cardStyle: 'bg-stone-800/60 border border-amber-900/40 rounded-2xl hover:border-amber-600/60',
      accentColor: 'text-amber-400',
      badge: 'bg-amber-900/50 text-amber-300 border border-amber-700/50',
    },
  },
  saas: {
    colorPalette: ['from-slate-950', 'via-purple-950', 'to-slate-950', 'text-purple-400'],
    fonts: { heading: 'Inter', body: 'Inter' },
    visualDNA: {
      heroSection: 'bg-gradient-to-br from-slate-950 via-purple-950 to-slate-950',
      heroHeading: 'text-6xl font-bold text-white tracking-tight',
      heroSubtext: 'text-xl text-slate-400',
      primaryButton: 'bg-purple-600 hover:bg-purple-500 text-white px-8 py-3 rounded-xl font-semibold shadow-lg shadow-purple-900/30',
      secondaryButton: 'border border-slate-700 text-slate-300 hover:border-purple-500 px-8 py-3 rounded-xl',
      sectionBg: ['bg-slate-950', 'bg-slate-900', 'bg-purple-950/20'],
      cardStyle: 'bg-slate-800/50 border border-slate-700 rounded-2xl hover:border-purple-500/50 transition-all',
      accentColor: 'text-purple-400',
      badge: 'bg-purple-900/50 text-purple-300 border border-purple-700/50',
    },
  },
  portfolio: {
    colorPalette: ['bg-zinc-950', 'bg-zinc-900', 'text-zinc-200', 'text-white'],
    fonts: { heading: 'Space Grotesk', body: 'Inter' },
    visualDNA: {
      heroSection: 'bg-zinc-950',
      heroHeading: 'text-7xl font-black text-white tracking-tighter',
      heroSubtext: 'text-lg text-zinc-400',
      primaryButton: 'bg-white text-zinc-900 hover:bg-zinc-100 px-8 py-3 rounded-xl font-semibold',
      secondaryButton: 'border border-zinc-700 text-zinc-300 hover:border-white px-8 py-3 rounded-xl',
      sectionBg: ['bg-zinc-950', 'bg-zinc-900', 'bg-zinc-950'],
      cardStyle: 'bg-zinc-900 border border-zinc-800 rounded-2xl hover:border-zinc-600 transition-all group',
      accentColor: 'text-white',
      badge: 'bg-zinc-800 text-zinc-300 border border-zinc-700',
    },
  },
  ecommerce: {
    colorPalette: ['bg-white', 'bg-slate-50', 'text-slate-900', 'text-emerald-700'],
    fonts: { heading: 'Inter', body: 'Inter' },
    visualDNA: {
      heroSection: 'bg-white',
      heroHeading: 'text-6xl font-bold text-slate-900 tracking-tight',
      heroSubtext: 'text-xl text-slate-500',
      primaryButton: 'bg-slate-900 hover:bg-slate-800 text-white px-8 py-3 rounded-xl font-semibold',
      secondaryButton: 'border border-slate-300 text-slate-700 hover:border-slate-500 px-8 py-3 rounded-xl',
      sectionBg: ['bg-white', 'bg-slate-50', 'bg-white'],
      cardStyle: 'bg-white border border-slate-200 rounded-2xl hover:shadow-xl transition-all',
      accentColor: 'text-slate-900',
      badge: 'bg-emerald-100 text-emerald-700 border border-emerald-200',
    },
  },
  fitness: {
    colorPalette: ['from-zinc-950', 'via-orange-950', 'to-zinc-950', 'text-orange-400'],
    fonts: { heading: 'Barlow Condensed', body: 'Inter' },
    visualDNA: {
      heroSection: 'bg-gradient-to-br from-zinc-950 via-orange-950 to-zinc-950',
      heroHeading: 'text-7xl font-black text-white tracking-tighter uppercase',
      heroSubtext: 'text-xl text-orange-200/70',
      primaryButton: 'bg-orange-500 hover:bg-orange-400 text-white px-8 py-3 rounded-xl font-bold uppercase tracking-wide',
      secondaryButton: 'border border-orange-500/50 text-orange-300 px-8 py-3 rounded-xl',
      sectionBg: ['bg-zinc-950', 'bg-zinc-900', 'bg-orange-950/20'],
      cardStyle: 'bg-zinc-800/60 border border-orange-900/40 rounded-2xl hover:border-orange-500/60',
      accentColor: 'text-orange-400',
      badge: 'bg-orange-900/50 text-orange-300 border border-orange-700/50',
    },
  },
  wedding: {
    colorPalette: ['from-rose-50', 'via-pink-50', 'to-rose-100', 'text-rose-500'],
    fonts: { heading: 'Cormorant Garamond', body: 'Lato' },
    visualDNA: {
      heroSection: 'bg-gradient-to-br from-rose-50 via-pink-50 to-rose-100',
      heroHeading: 'text-6xl font-bold text-rose-900 tracking-tight font-serif',
      heroSubtext: 'text-xl text-rose-600/70',
      primaryButton: 'bg-rose-600 hover:bg-rose-700 text-white px-8 py-3 rounded-full font-semibold',
      secondaryButton: 'border border-rose-300 text-rose-700 hover:border-rose-500 px-8 py-3 rounded-full',
      sectionBg: ['bg-white', 'bg-rose-50', 'bg-pink-50/50'],
      cardStyle: 'bg-white border border-rose-100 rounded-3xl hover:shadow-lg hover:shadow-rose-100 transition-all',
      accentColor: 'text-rose-500',
      badge: 'bg-rose-100 text-rose-600 border border-rose-200',
    },
  },
  startup: {
    colorPalette: ['bg-black', 'bg-zinc-950', 'text-zinc-200', 'text-purple-400'],
    fonts: { heading: 'Cal Sans', body: 'Inter' },
    visualDNA: {
      heroSection: 'bg-black',
      heroHeading: 'text-7xl font-black tracking-tighter bg-gradient-to-r from-white via-purple-200 to-purple-400 bg-clip-text text-transparent',
      heroSubtext: 'text-xl text-zinc-400',
      primaryButton: 'bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white px-8 py-3 rounded-xl font-semibold shadow-lg',
      secondaryButton: 'border border-zinc-800 text-zinc-300 hover:border-purple-500 px-8 py-3 rounded-xl',
      sectionBg: ['bg-black', 'bg-zinc-950', 'bg-black'],
      cardStyle: 'bg-zinc-900/50 border border-zinc-800 rounded-2xl hover:border-purple-500/50 backdrop-blur-sm transition-all',
      accentColor: 'text-purple-400',
      badge: 'bg-gradient-to-r from-purple-900/50 to-pink-900/50 text-purple-300 border border-purple-700/50',
    },
  },
  photography: {
    colorPalette: ['bg-zinc-950', 'bg-zinc-900', 'text-zinc-200', 'text-sky-300'],
    fonts: { heading: 'Space Grotesk', body: 'Inter' },
    visualDNA: {
      heroSection: 'bg-zinc-950',
      heroHeading: 'text-7xl font-black text-white tracking-tight',
      heroSubtext: 'text-xl text-zinc-400',
      primaryButton: 'bg-sky-500 hover:bg-sky-400 text-white px-8 py-3 rounded-xl font-semibold',
      secondaryButton: 'border border-zinc-700 text-zinc-200 hover:border-sky-400 px-8 py-3 rounded-xl',
      sectionBg: ['bg-zinc-950', 'bg-zinc-900', 'bg-zinc-950'],
      cardStyle: 'bg-zinc-900/70 border border-zinc-700 rounded-2xl hover:border-sky-500/60 transition-all',
      accentColor: 'text-sky-300',
      badge: 'bg-sky-900/40 text-sky-200 border border-sky-700/40',
    },
  },
  medical: {
    colorPalette: ['from-slate-950', 'via-cyan-950', 'to-slate-950', 'text-cyan-300'],
    fonts: { heading: 'Inter', body: 'Inter' },
    visualDNA: {
      heroSection: 'bg-gradient-to-br from-slate-950 via-cyan-950 to-slate-950',
      heroHeading: 'text-6xl font-bold text-white tracking-tight',
      heroSubtext: 'text-xl text-cyan-100/70',
      primaryButton: 'bg-cyan-600 hover:bg-cyan-500 text-white px-8 py-3 rounded-xl font-semibold',
      secondaryButton: 'border border-cyan-700/50 text-cyan-200 hover:border-cyan-500 px-8 py-3 rounded-xl',
      sectionBg: ['bg-slate-950', 'bg-cyan-950/20', 'bg-slate-900'],
      cardStyle: 'bg-slate-800/60 border border-cyan-900/40 rounded-2xl hover:border-cyan-500/60 transition-all',
      accentColor: 'text-cyan-300',
      badge: 'bg-cyan-900/50 text-cyan-200 border border-cyan-700/50',
    },
  },
  realestate: {
    colorPalette: ['from-slate-950', 'via-emerald-950', 'to-slate-950', 'text-emerald-300'],
    fonts: { heading: 'Playfair Display', body: 'Inter' },
    visualDNA: {
      heroSection: 'bg-gradient-to-br from-slate-950 via-emerald-950 to-slate-950',
      heroHeading: 'text-6xl font-bold text-white tracking-tight',
      heroSubtext: 'text-xl text-emerald-100/70',
      primaryButton: 'bg-emerald-600 hover:bg-emerald-500 text-white px-8 py-3 rounded-xl font-semibold',
      secondaryButton: 'border border-emerald-700/50 text-emerald-200 hover:border-emerald-500 px-8 py-3 rounded-xl',
      sectionBg: ['bg-slate-950', 'bg-emerald-950/20', 'bg-slate-900'],
      cardStyle: 'bg-slate-800/60 border border-emerald-900/40 rounded-2xl hover:border-emerald-500/60 transition-all',
      accentColor: 'text-emerald-300',
      badge: 'bg-emerald-900/50 text-emerald-200 border border-emerald-700/50',
    },
  },
  music: {
    colorPalette: ['from-zinc-950', 'via-fuchsia-950', 'to-zinc-950', 'text-fuchsia-300'],
    fonts: { heading: 'Space Grotesk', body: 'Inter' },
    visualDNA: {
      heroSection: 'bg-gradient-to-br from-zinc-950 via-fuchsia-950 to-zinc-950',
      heroHeading: 'text-7xl font-black text-white tracking-tighter uppercase',
      heroSubtext: 'text-xl text-fuchsia-100/70',
      primaryButton: 'bg-fuchsia-600 hover:bg-fuchsia-500 text-white px-8 py-3 rounded-xl font-semibold',
      secondaryButton: 'border border-fuchsia-700/50 text-fuchsia-200 hover:border-fuchsia-500 px-8 py-3 rounded-xl',
      sectionBg: ['bg-zinc-950', 'bg-fuchsia-950/20', 'bg-zinc-900'],
      cardStyle: 'bg-zinc-800/60 border border-fuchsia-900/40 rounded-2xl hover:border-fuchsia-500/60 transition-all',
      accentColor: 'text-fuchsia-300',
      badge: 'bg-fuchsia-900/50 text-fuchsia-200 border border-fuchsia-700/50',
    },
  },
  education: {
    colorPalette: ['from-slate-950', 'via-indigo-950', 'to-slate-950', 'text-indigo-300'],
    fonts: { heading: 'Inter', body: 'Inter' },
    visualDNA: {
      heroSection: 'bg-gradient-to-br from-slate-950 via-indigo-950 to-slate-950',
      heroHeading: 'text-6xl font-bold text-white tracking-tight',
      heroSubtext: 'text-xl text-indigo-100/70',
      primaryButton: 'bg-indigo-600 hover:bg-indigo-500 text-white px-8 py-3 rounded-xl font-semibold',
      secondaryButton: 'border border-indigo-700/50 text-indigo-200 hover:border-indigo-500 px-8 py-3 rounded-xl',
      sectionBg: ['bg-slate-950', 'bg-indigo-950/20', 'bg-slate-900'],
      cardStyle: 'bg-slate-800/60 border border-indigo-900/40 rounded-2xl hover:border-indigo-500/60 transition-all',
      accentColor: 'text-indigo-300',
      badge: 'bg-indigo-900/50 text-indigo-200 border border-indigo-700/50',
    },
  },
  legal: {
    colorPalette: ['from-slate-950', 'via-blue-950', 'to-slate-950', 'text-blue-300'],
    fonts: { heading: 'Playfair Display', body: 'Inter' },
    visualDNA: {
      heroSection: 'bg-gradient-to-br from-slate-950 via-blue-950 to-slate-950',
      heroHeading: 'text-6xl font-bold text-white tracking-tight',
      heroSubtext: 'text-xl text-blue-100/70',
      primaryButton: 'bg-blue-600 hover:bg-blue-500 text-white px-8 py-3 rounded-xl font-semibold',
      secondaryButton: 'border border-blue-700/50 text-blue-200 hover:border-blue-500 px-8 py-3 rounded-xl',
      sectionBg: ['bg-slate-950', 'bg-blue-950/20', 'bg-slate-900'],
      cardStyle: 'bg-slate-800/60 border border-blue-900/40 rounded-2xl hover:border-blue-500/60 transition-all',
      accentColor: 'text-blue-300',
      badge: 'bg-blue-900/50 text-blue-200 border border-blue-700/50',
    },
  },
  nonprofit: {
    colorPalette: ['from-slate-950', 'via-teal-950', 'to-slate-950', 'text-teal-300'],
    fonts: { heading: 'Inter', body: 'Inter' },
    visualDNA: {
      heroSection: 'bg-gradient-to-br from-slate-950 via-teal-950 to-slate-950',
      heroHeading: 'text-6xl font-bold text-white tracking-tight',
      heroSubtext: 'text-xl text-teal-100/70',
      primaryButton: 'bg-teal-600 hover:bg-teal-500 text-white px-8 py-3 rounded-xl font-semibold',
      secondaryButton: 'border border-teal-700/50 text-teal-200 hover:border-teal-500 px-8 py-3 rounded-xl',
      sectionBg: ['bg-slate-950', 'bg-teal-950/20', 'bg-slate-900'],
      cardStyle: 'bg-slate-800/60 border border-teal-900/40 rounded-2xl hover:border-teal-500/60 transition-all',
      accentColor: 'text-teal-300',
      badge: 'bg-teal-900/50 text-teal-200 border border-teal-700/50',
    },
  },
};

const SUPPLEMENTAL_INDUSTRY_FONT_PRESETS = {
  agency: { heading: 'Space Grotesk', body: 'Inter' },
  blog: { heading: 'Merriweather', body: 'Inter' },
} as const;

export function getIndustryFonts(industry: HydrationIndustry | string | null | undefined): {
  heading: string;
  body: string;
} {
  const normalized = String(industry || '').toLowerCase();
  const knownProfile = INDUSTRY_PROFILES[normalized as HydrationIndustry];
  if (knownProfile?.fonts) {
    return knownProfile.fonts;
  }
  const supplemental = SUPPLEMENTAL_INDUSTRY_FONT_PRESETS[normalized as keyof typeof SUPPLEMENTAL_INDUSTRY_FONT_PRESETS];
  if (supplemental) {
    return supplemental;
  }
  return INDUSTRY_PROFILES.saas.fonts;
}
