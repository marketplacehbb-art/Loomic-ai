export const STACK_CONSTRAINT = `You generate EXCLUSIVELY:
- React 18 + TypeScript (tsx files only)
- Tailwind CSS utility classes only (NO inline styles, NO CSS modules, NO styled-components)
- shadcn/ui for all UI components (Button, Card, Dialog, Input, etc.)
- lucide-react for all icons
- React Router v6 for navigation
NEVER use: Bootstrap, Material UI, Chakra, Ant Design, emotion, CSS files`;

export const DESIGN_REFERENCE = `VISUAL QUALITY RULES - follow these strictly:

Typography:
- Headlines: text-4xl to text-7xl font-bold tracking-tight
- Always use proper hierarchy: h1 > h2 > h3
- Body text: text-base text-slate-600 (light) or text-slate-300 (dark)
- Never use default font sizes without customization

Spacing:
- Section padding: py-20 to py-32
- Container: max-w-6xl mx-auto px-6
- Card internal padding: p-6 to p-8
- Gap between grid items: gap-6 to gap-8

Colors:
- Never use plain white backgrounds for hero sections
- Dark themes: slate-900/slate-950 base, purple-600 accent
- Light themes: white base, slate-900 text, purple-600 accent
- Always add subtle gradient or pattern to hero backgrounds
- Accent color must be consistent throughout the page

Borders & Shadows:
- Cards: rounded-2xl border border-slate-200 (light) or border-slate-700 (dark)
- Hover states: always add hover:shadow-lg or hover:border-purple-500
- Buttons: rounded-xl, never rounded-none

Animation:
- Add transition-all duration-200 to all interactive elements
- Hover states on every clickable element
- Use group/group-hover for card hover effects

Layout:
- NEVER just stack everything vertically with no visual interest
- Use grid layouts: grid-cols-2, grid-cols-3 with proper gaps
- Break monotony: alternate section backgrounds (dark/light/dark)
- Add visual separators between sections

Components:
- Use shadcn Badge for labels/tags
- Use shadcn Card for all card-like elements
- Import and use lucide-react icons everywhere (never text-only labels)
- Every button must have a hover state

Quality checklist (mentally verify before outputting):
[ ] Does the page have a clear visual hierarchy?
[ ] Is every section background different from adjacent sections?
[ ] Do all interactive elements have hover states?
[ ] Are there icons/visuals to break up text?
[ ] Does the overall page look like a real $50k+ website?`;

export const MICRO_INTERACTIONS = `MICRO-INTERACTIONS - add to every interactive element:
- All buttons: transition-all duration-200 active:scale-95
- All cards: transition-all duration-300 hover:-translate-y-1 hover:shadow-xl
- All links: transition-colors duration-150
- Hero sections: add scroll indicator (animated bounce arrow at bottom)
- Images: overflow-hidden rounded-2xl with hover:scale-105 transition-transform duration-500 on the img tag
- Page load: add opacity-0 animate-fade-in to main sections (use Tailwind animate)
- Nav items: relative after:absolute after:bottom-0 after:left-0 after:w-0 hover:after:w-full after:h-0.5 after:bg-purple-400 after:transition-all`;
