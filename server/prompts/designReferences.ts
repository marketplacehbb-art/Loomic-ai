export const STACK_CONSTRAINT = `You generate EXCLUSIVELY:
- React 18 + TypeScript (tsx files only)
- Tailwind CSS utility classes only (NO inline styles, NO CSS modules, NO styled-components)
- shadcn/ui for all UI components (Button, Card, Dialog, Input, etc.)
- lucide-react for all icons
- React Router v6 for navigation
NEVER use: Bootstrap, Material UI, Chakra, Ant Design, emotion, CSS files`;

export const DESIGN_REFERENCE = `Use these concrete Tailwind patterns as visual reference:
1. Hero gradient shell: bg-gradient-to-br from-slate-900 via-slate-800 to-slate-700 text-white
2. Section container rhythm: mx-auto max-w-7xl px-6 py-16 md:px-8 md:py-24
3. Premium card base: rounded-2xl border border-slate-200 bg-white p-6 shadow-lg
4. Elevated dark card: rounded-2xl border border-slate-700/50 bg-slate-900/70 p-6 shadow-xl backdrop-blur
5. Primary CTA button: inline-flex items-center justify-center rounded-xl bg-blue-600 px-6 py-3 text-sm font-semibold text-white transition hover:bg-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-2
6. Secondary/ghost button: inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white px-6 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-100
7. Grid spacing scale: grid gap-4 md:gap-6 lg:gap-8 with consistent internal spacing space-y-4 / space-y-6
8. Headline hierarchy: text-4xl font-bold tracking-tight md:text-5xl
9. Supporting copy hierarchy: text-base leading-7 text-slate-600 and text-sm text-muted-foreground
10. Form controls rhythm: rounded-xl border border-slate-300 px-4 py-3 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20`;

