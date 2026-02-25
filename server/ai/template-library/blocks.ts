import { TemplateBlock } from './types.js';

export const TEMPLATE_BLOCKS: TemplateBlock[] = [
  {
    id: 'navbar-saas-01',
    category: 'navbar',
    style: 'saas-modern',
    mood: 'clean',
    layout: 'inline-nav',
    supportsDarkMode: true,
    tags: ['startup', 'saas', 'ai'],
    complexity: 1,
    componentName: 'NavbarSaas',
    filePath: 'src/components/sections/NavbarSaas.tsx',
    code: `import { Sparkles } from 'lucide-react';

export default function NavbarSaas() {
  return (
    <header className="sticky top-0 z-20 border-b border-slate-200/70 bg-white/80 backdrop-blur dark:border-slate-800 dark:bg-slate-950/80">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-6">
        <div className="flex items-center gap-2 font-semibold text-slate-900 dark:text-white">
          <Sparkles className="h-4 w-4 text-cyan-500" />
          {{projectName}}
        </div>
        <nav className="hidden items-center gap-6 text-sm text-slate-600 dark:text-slate-300 md:flex">
          <a href="#features" className="hover:text-cyan-500">Features</a>
          <a href="#pricing" className="hover:text-cyan-500">Pricing</a>
          <a href="#faq" className="hover:text-cyan-500">FAQ</a>
        </nav>
      </div>
    </header>
  );
}
`,
  },
  {
    id: 'hero-ai-modern-01',
    category: 'hero',
    style: 'ai-modern',
    mood: 'bold',
    layout: 'split',
    supportsDarkMode: true,
    tags: ['ai', 'startup', 'landing'],
    complexity: 2,
    componentName: 'HeroAIModern',
    filePath: 'src/components/sections/HeroAIModern.tsx',
    code: `import { ArrowRight, Brain, Sparkles } from 'lucide-react';

export default function HeroAIModern() {
  return (
    <section className="relative overflow-hidden border-b border-slate-200/70 bg-gradient-to-br from-cyan-50 via-white to-indigo-100 px-6 py-20 dark:border-slate-800 dark:from-slate-950 dark:via-slate-950 dark:to-slate-900">
      <div className="mx-auto grid w-full max-w-6xl gap-10 md:grid-cols-2">
        <div className="space-y-6">
          <span className="inline-flex items-center gap-2 rounded-full border border-cyan-300/70 bg-cyan-100/70 px-3 py-1 text-xs font-semibold text-cyan-800 dark:border-cyan-500/30 dark:bg-cyan-500/10 dark:text-cyan-300">
            <Sparkles className="h-3.5 w-3.5" />
            AI-first product building
          </span>
          <h1 className="text-4xl font-bold tracking-tight text-slate-900 dark:text-white md:text-5xl">
            Ship product pages and dashboards in minutes.
          </h1>
          <p className="max-w-xl text-slate-600 dark:text-slate-300">
            Start from curated sections, then let AI adapt copy, structure, and interactions to your use case.
          </p>
          <button className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-700 dark:bg-cyan-500 dark:hover:bg-cyan-400">
            Build now <ArrowRight className="h-4 w-4" />
          </button>
        </div>
        <div className="rounded-2xl border border-slate-200/70 bg-white/70 p-6 shadow-xl dark:border-slate-800 dark:bg-slate-900/70">
          <div className="flex items-center gap-3 text-sm font-medium text-slate-700 dark:text-slate-200">
            <Brain className="h-4 w-4 text-cyan-500" />
            Composition Engine
          </div>
          <div className="mt-5 space-y-3 text-sm">
            <div className="rounded-lg bg-slate-100 p-3 text-slate-700 dark:bg-slate-800 dark:text-slate-200">hero-ai-modern-01</div>
            <div className="rounded-lg bg-slate-100 p-3 text-slate-700 dark:bg-slate-800 dark:text-slate-200">features-grid-icons-01</div>
            <div className="rounded-lg bg-slate-100 p-3 text-slate-700 dark:bg-slate-800 dark:text-slate-200">pricing-three-tier-01</div>
          </div>
        </div>
      </div>
    </section>
  );
}
`,
  },
  {
    id: 'hero-centered-gradient-01',
    category: 'hero',
    style: 'minimal-gradient',
    mood: 'calm',
    layout: 'centered',
    supportsDarkMode: true,
    tags: ['landing', 'portfolio', 'saas'],
    complexity: 1,
    componentName: 'HeroCenteredGradient',
    filePath: 'src/components/sections/HeroCenteredGradient.tsx',
    code: `export default function HeroCenteredGradient() {
  return (
    <section className="px-6 py-24 text-center bg-gradient-to-b from-white to-slate-100 dark:from-slate-950 dark:to-slate-900">
      <div className="mx-auto max-w-3xl space-y-5">
        <h1 className="text-4xl font-bold tracking-tight text-slate-900 dark:text-white md:text-5xl">
          Design and launch polished products faster.
        </h1>
        <p className="text-slate-600 dark:text-slate-300">
          Curated sections + AI customization. Keep full control over code and structure.
        </p>
        <button className="rounded-lg bg-indigo-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-indigo-500">
          Start free
        </button>
      </div>
    </section>
  );
}
`,
  },
  {
    id: 'features-grid-icons-01',
    category: 'features',
    style: 'grid-icons',
    mood: 'professional',
    layout: '3-col-grid',
    supportsDarkMode: true,
    tags: ['saas', 'ai', 'startup'],
    complexity: 1,
    componentName: 'FeaturesGridIcons',
    filePath: 'src/components/sections/FeaturesGridIcons.tsx',
    code: `import { Blocks, Sparkles, Wand2 } from 'lucide-react';

const items = [
  { icon: Blocks, title: 'Composable Blocks', text: 'Mix hero, pricing, dashboard and auth sections.' },
  { icon: Sparkles, title: 'Metadata Driven', text: 'Pick sections by tags, style and use-case.' },
  { icon: Wand2, title: 'AI Polishing', text: 'Apply copy and visual refinements automatically.' },
];

export default function FeaturesGridIcons() {
  return (
    <section id="features" className="px-6 py-20">
      <div className="mx-auto grid w-full max-w-6xl gap-6 md:grid-cols-3">
        {items.map((item) => (
          <article key={item.title} className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
            <item.icon className="h-5 w-5 text-cyan-500" />
            <h3 className="mt-4 text-lg font-semibold text-slate-900 dark:text-white">{item.title}</h3>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{item.text}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
`,
  },
  {
    id: 'features-bento-01',
    category: 'features',
    style: 'bento',
    mood: 'premium',
    layout: 'bento-grid',
    supportsDarkMode: true,
    tags: ['premium', 'landing', 'product'],
    complexity: 2,
    componentName: 'FeaturesBento',
    filePath: 'src/components/sections/FeaturesBento.tsx',
    code: `export default function FeaturesBento() {
  return (
    <section className="px-6 py-20">
      <div className="mx-auto grid max-w-6xl gap-4 md:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-6 md:col-span-2 dark:border-slate-800 dark:bg-slate-900">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Structured template registry</h3>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">Blocks are versioned and tagged for deterministic selection.</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Fast compose</h3>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">Assemble pages from reusable sections.</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Dark mode ready</h3>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">Every block ships with light and dark styling.</p>
        </div>
      </div>
    </section>
  );
}
`,
  },
  {
    id: 'pricing-three-tier-01',
    category: 'pricing',
    style: 'classic-saas',
    mood: 'clear',
    layout: '3-col',
    supportsDarkMode: true,
    tags: ['pricing', 'saas', 'startup'],
    complexity: 2,
    componentName: 'PricingThreeTier',
    filePath: 'src/components/sections/PricingThreeTier.tsx',
    code: `const plans = [
  { name: 'Starter', price: '$19', features: ['3 projects', 'Basic templates'] },
  { name: 'Growth', price: '$49', features: ['20 projects', 'All block categories'], featured: true },
  { name: 'Scale', price: '$99', features: ['Unlimited projects', 'Priority support'] },
];

export default function PricingThreeTier() {
  return (
    <section id="pricing" className="px-6 py-20">
      <div className="mx-auto grid max-w-6xl gap-6 md:grid-cols-3">
        {plans.map((plan) => (
          <article
            key={plan.name}
            className={\`rounded-xl border p-6 \${plan.featured ? 'border-cyan-500 bg-cyan-50 dark:bg-cyan-500/10' : 'border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900'}\`}
          >
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white">{plan.name}</h3>
            <p className="mt-2 text-3xl font-bold text-slate-900 dark:text-white">{plan.price}</p>
            <ul className="mt-4 space-y-2 text-sm text-slate-600 dark:text-slate-300">
              {plan.features.map((feature) => <li key={feature}>• {feature}</li>)}
            </ul>
          </article>
        ))}
      </div>
    </section>
  );
}
`,
  },
  {
    id: 'pricing-minimal-dark-01',
    category: 'pricing',
    style: 'minimal-dark',
    mood: 'focused',
    layout: '2-col',
    supportsDarkMode: true,
    tags: ['pricing', 'dark', 'minimal'],
    complexity: 1,
    componentName: 'PricingMinimalDark',
    filePath: 'src/components/sections/PricingMinimalDark.tsx',
    code: `export default function PricingMinimalDark() {
  return (
    <section className="bg-slate-950 px-6 py-16 text-white">
      <div className="mx-auto grid max-w-5xl gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-6">
          <h3 className="text-xl font-semibold">Team</h3>
          <p className="mt-2 text-3xl font-bold">$59</p>
          <p className="mt-2 text-slate-300">For growing product teams.</p>
        </div>
        <div className="rounded-xl border border-cyan-500/60 bg-cyan-500/10 p-6">
          <h3 className="text-xl font-semibold">Enterprise</h3>
          <p className="mt-2 text-3xl font-bold">Custom</p>
          <p className="mt-2 text-slate-300">For organizations with advanced workflows.</p>
        </div>
      </div>
    </section>
  );
}
`,
  },
  {
    id: 'sidebar-enterprise-01',
    category: 'sidebar',
    style: 'enterprise',
    mood: 'practical',
    layout: 'left-sidebar',
    supportsDarkMode: true,
    tags: ['dashboard', 'admin', 'analytics'],
    complexity: 2,
    componentName: 'SidebarEnterprise',
    filePath: 'src/components/dashboard/SidebarEnterprise.tsx',
    code: `import { BarChart3, LayoutGrid, Settings, Users } from 'lucide-react';

const items = [
  { name: 'Overview', icon: LayoutGrid },
  { name: 'Analytics', icon: BarChart3 },
  { name: 'Users', icon: Users },
  { name: 'Settings', icon: Settings },
];

export default function SidebarEnterprise() {
  return (
    <aside className="w-64 shrink-0 border-r border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950">
      <h2 className="mb-5 text-sm font-semibold uppercase tracking-wider text-slate-500">Workspace</h2>
      <nav className="space-y-1">
        {items.map((item) => (
          <button key={item.name} className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm text-slate-600 transition hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white">
            <item.icon className="h-4 w-4" />
            {item.name}
          </button>
        ))}
      </nav>
    </aside>
  );
}
`,
  },
  {
    id: 'dashboard-overview-grid-01',
    category: 'dashboard',
    style: 'analytics-cards',
    mood: 'data-driven',
    layout: 'grid',
    supportsDarkMode: true,
    tags: ['dashboard', 'analytics', 'saas'],
    complexity: 2,
    componentName: 'DashboardOverviewGrid',
    filePath: 'src/components/dashboard/DashboardOverviewGrid.tsx',
    code: `const metrics = [
  { label: 'Active Users', value: '12,480', delta: '+8.4%' },
  { label: 'MRR', value: '$84,200', delta: '+3.1%' },
  { label: 'Conversion', value: '5.8%', delta: '+1.2%' },
  { label: 'Churn', value: '1.1%', delta: '-0.3%' },
];

export default function DashboardOverviewGrid() {
  return (
    <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      {metrics.map((metric) => (
        <article key={metric.label} className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <p className="text-xs uppercase tracking-wider text-slate-500">{metric.label}</p>
          <p className="mt-3 text-2xl font-bold text-slate-900 dark:text-white">{metric.value}</p>
          <p className="mt-2 text-xs font-semibold text-emerald-500">{metric.delta}</p>
        </article>
      ))}
    </section>
  );
}
`,
  },
  {
    id: 'stats-cards-01',
    category: 'stats',
    style: 'minimal',
    mood: 'neutral',
    layout: 'row',
    supportsDarkMode: true,
    tags: ['stats', 'dashboard', 'landing'],
    complexity: 1,
    componentName: 'StatsCards',
    filePath: 'src/components/dashboard/StatsCards.tsx',
    code: `export default function StatsCards() {
  return (
    <section className="grid gap-4 md:grid-cols-3">
      <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
        <p className="text-xs text-slate-500">Projects</p>
        <p className="mt-2 text-2xl font-semibold text-slate-900 dark:text-white">248</p>
      </div>
      <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
        <p className="text-xs text-slate-500">Deployments</p>
        <p className="mt-2 text-2xl font-semibold text-slate-900 dark:text-white">1,294</p>
      </div>
      <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
        <p className="text-xs text-slate-500">Build Time</p>
        <p className="mt-2 text-2xl font-semibold text-slate-900 dark:text-white">1m 42s</p>
      </div>
    </section>
  );
}
`,
  },
  {
    id: 'chart-area-mock-01',
    category: 'chart',
    style: 'mock-chart',
    mood: 'analytic',
    layout: 'single-panel',
    supportsDarkMode: true,
    tags: ['chart', 'dashboard', 'analytics'],
    complexity: 1,
    componentName: 'ChartAreaMock',
    filePath: 'src/components/dashboard/ChartAreaMock.tsx',
    code: `export default function ChartAreaMock() {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
      <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">Traffic Trend</h3>
      <div className="mt-4 h-40 rounded-lg bg-gradient-to-t from-cyan-500/20 to-indigo-500/10" />
    </section>
  );
}
`,
  },
  {
    id: 'auth-split-card-01',
    category: 'auth',
    style: 'split-panel',
    mood: 'premium',
    layout: '2-col',
    supportsDarkMode: true,
    tags: ['auth', 'login', 'signup'],
    complexity: 2,
    componentName: 'AuthSplitCard',
    filePath: 'src/components/auth/AuthSplitCard.tsx',
    code: `export default function AuthSplitCard() {
  return (
    <section className="mx-auto grid w-full max-w-4xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl dark:border-slate-800 dark:bg-slate-900 md:grid-cols-2">
      <div className="bg-gradient-to-br from-cyan-500 to-indigo-600 p-8 text-white">
        <h2 className="text-2xl font-bold">Welcome back</h2>
        <p className="mt-2 text-cyan-50">Sign in to continue building with your template library.</p>
      </div>
      <form className="space-y-4 p-8">
        <input className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-white" placeholder="Email" />
        <input className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-white" placeholder="Password" type="password" />
        <button className="w-full rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white dark:bg-cyan-500">Sign in</button>
      </form>
    </section>
  );
}
`,
  },
  {
    id: 'auth-minimal-01',
    category: 'auth',
    style: 'minimal',
    mood: 'clean',
    layout: 'single-card',
    supportsDarkMode: true,
    tags: ['auth', 'login'],
    complexity: 1,
    componentName: 'AuthMinimal',
    filePath: 'src/components/auth/AuthMinimal.tsx',
    code: `export default function AuthMinimal() {
  return (
    <section className="mx-auto w-full max-w-sm rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
      <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Sign in</h2>
      <div className="mt-4 space-y-3">
        <input className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-white" placeholder="Email" />
        <input className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-white" placeholder="Password" type="password" />
        <button className="w-full rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white">Continue</button>
      </div>
    </section>
  );
}
`,
  },
  {
    id: 'modal-action-01',
    category: 'modal',
    style: 'confirmation',
    mood: 'neutral',
    layout: 'center-modal',
    supportsDarkMode: true,
    tags: ['modal', 'dialog', 'action'],
    complexity: 1,
    componentName: 'ModalAction',
    filePath: 'src/components/ui/ModalAction.tsx',
    code: `interface ModalActionProps {
  open: boolean;
  onClose: () => void;
}

export default function ModalAction({ open, onClose }: ModalActionProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-4">
      <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
        <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Confirm action</h3>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">Do you want to apply this template composition?</p>
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:text-slate-200">Cancel</button>
          <button onClick={onClose} className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white dark:bg-cyan-500">Apply</button>
        </div>
      </div>
    </div>
  );
}
`,
  },
  {
    id: 'footer-simple-01',
    category: 'footer',
    style: 'simple',
    mood: 'clean',
    layout: 'single-row',
    supportsDarkMode: true,
    tags: ['footer', 'landing', 'saas'],
    complexity: 1,
    componentName: 'FooterSimple',
    filePath: 'src/components/sections/FooterSimple.tsx',
    code: `export default function FooterSimple() {
  return (
    <footer className="border-t border-slate-200 px-6 py-8 text-sm text-slate-500 dark:border-slate-800 dark:text-slate-400">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between">
        <span>© {new Date().getFullYear()} {{projectName}}</span>
        <div className="flex items-center gap-4">
          <a href="#" className="hover:text-cyan-500">Privacy</a>
          <a href="#" className="hover:text-cyan-500">Terms</a>
        </div>
      </div>
    </footer>
  );
}
`,
  },
  {
    id: 'footer-enterprise-01',
    category: 'footer',
    style: 'enterprise',
    mood: 'practical',
    layout: 'multi-column',
    supportsDarkMode: true,
    tags: ['footer', 'enterprise', 'dashboard'],
    complexity: 1,
    componentName: 'FooterEnterprise',
    filePath: 'src/components/sections/FooterEnterprise.tsx',
    code: `export default function FooterEnterprise() {
  return (
    <footer className="border-t border-slate-200 bg-slate-50 px-6 py-10 dark:border-slate-800 dark:bg-slate-950">
      <div className="mx-auto grid w-full max-w-6xl gap-8 md:grid-cols-3">
        <div>
          <h4 className="font-semibold text-slate-900 dark:text-white">{{projectName}}</h4>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">Composable templates for AI-first product teams.</p>
        </div>
        <div className="text-sm text-slate-600 dark:text-slate-300">
          <p className="font-medium text-slate-900 dark:text-white">Product</p>
          <p className="mt-2">Templates</p>
          <p>Integrations</p>
        </div>
        <div className="text-sm text-slate-600 dark:text-slate-300">
          <p className="font-medium text-slate-900 dark:text-white">Company</p>
          <p className="mt-2">About</p>
          <p>Contact</p>
        </div>
      </div>
    </footer>
  );
}
`,
  },
  {
    id: 'navbar-commerce-02',
    category: 'navbar',
    style: 'commerce-clean',
    mood: 'conversion',
    layout: 'inline-cta',
    supportsDarkMode: true,
    tags: ['landing', 'commerce', 'shop', 'restaurant', 'ecommerce'],
    complexity: 1,
    componentName: 'NavbarCommerce',
    filePath: 'src/components/sections/NavbarCommerce.tsx',
    code: `export default function NavbarCommerce() {
  return (
    <header className="sticky top-0 z-20 border-b border-orange-100/80 bg-white/90 backdrop-blur dark:border-slate-800 dark:bg-slate-950/90">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-6">
        <div className="text-lg font-semibold text-slate-900 dark:text-white">{{projectName}}</div>
        <nav className="hidden items-center gap-6 text-sm text-slate-600 dark:text-slate-300 md:flex">
          <a href="#features" className="hover:text-orange-500">Features</a>
          <a href="#pricing" className="hover:text-orange-500">Pricing</a>
          <a href="#faq" className="hover:text-orange-500">FAQ</a>
        </nav>
        <button className="rounded-lg bg-orange-500 px-3 py-2 text-xs font-semibold text-white transition hover:bg-orange-400">
          Order now
        </button>
      </div>
    </header>
  );
}
`,
  },
  {
    id: 'navbar-editorial-03',
    category: 'navbar',
    style: 'editorial-minimal',
    mood: 'premium',
    layout: 'center-links',
    supportsDarkMode: true,
    tags: ['landing', 'premium', 'editorial', 'luxury'],
    complexity: 1,
    componentName: 'NavbarEditorial',
    filePath: 'src/components/sections/NavbarEditorial.tsx',
    code: `export default function NavbarEditorial() {
  return (
    <header className="sticky top-0 z-20 border-b border-slate-200/80 bg-slate-50/95 backdrop-blur dark:border-slate-800 dark:bg-slate-950/85">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-6">
        <div className="font-serif text-xl font-semibold tracking-wide text-slate-900 dark:text-white">{{projectName}}</div>
        <nav className="flex items-center gap-6 text-sm text-slate-600 dark:text-slate-300">
          <a href="#features" className="hover:text-slate-900 dark:hover:text-white">Features</a>
          <a href="#pricing" className="hover:text-slate-900 dark:hover:text-white">Pricing</a>
          <a href="#faq" className="hover:text-slate-900 dark:hover:text-white">FAQ</a>
        </nav>
      </div>
    </header>
  );
}
`,
  },
  {
    id: 'hero-commerce-showcase-02',
    category: 'hero',
    style: 'commerce-showcase',
    mood: 'warm',
    layout: 'split',
    supportsDarkMode: true,
    tags: ['landing', 'commerce', 'shop', 'restaurant', 'ecommerce'],
    complexity: 2,
    componentName: 'HeroCommerceShowcase',
    filePath: 'src/components/sections/HeroCommerceShowcase.tsx',
    code: `export default function HeroCommerceShowcase() {
  return (
    <section className="border-b border-orange-100/70 bg-gradient-to-br from-orange-50 via-white to-amber-100 px-6 py-20 dark:border-slate-800 dark:from-slate-950 dark:via-slate-950 dark:to-slate-900">
      <div className="mx-auto grid w-full max-w-6xl gap-10 md:grid-cols-2">
        <div className="space-y-5">
          <span className="inline-flex rounded-full bg-orange-100 px-3 py-1 text-xs font-semibold text-orange-700 dark:bg-orange-500/20 dark:text-orange-300">
            Fast launch for modern brands
          </span>
          <h1 className="text-4xl font-bold tracking-tight text-slate-900 dark:text-white md:text-5xl">
            Grow {{projectName}} with a high-converting digital storefront.
          </h1>
          <p className="text-slate-600 dark:text-slate-300">
            Launch product highlights, bundles, and checkout-friendly flows from a polished template system.
          </p>
          <button className="rounded-lg bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-700 dark:bg-orange-500 dark:hover:bg-orange-400">
            Start selling
          </button>
        </div>
        <div className="rounded-2xl border border-orange-200/70 bg-white/80 p-6 shadow-xl dark:border-slate-800 dark:bg-slate-900/70">
          <p className="text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400">Conversion highlights</p>
          <div className="mt-4 space-y-3">
            <div className="rounded-xl bg-slate-100 p-4 text-sm text-slate-700 dark:bg-slate-800 dark:text-slate-200">Mobile-first checkout flow</div>
            <div className="rounded-xl bg-slate-100 p-4 text-sm text-slate-700 dark:bg-slate-800 dark:text-slate-200">A/B friendly hero layouts</div>
            <div className="rounded-xl bg-slate-100 p-4 text-sm text-slate-700 dark:bg-slate-800 dark:text-slate-200">Campaign-ready promo sections</div>
          </div>
        </div>
      </div>
    </section>
  );
}
`,
  },
  {
    id: 'hero-editorial-premium-03',
    category: 'hero',
    style: 'editorial-premium',
    mood: 'premium',
    layout: 'centered',
    supportsDarkMode: true,
    tags: ['landing', 'premium', 'editorial', 'luxury'],
    complexity: 2,
    componentName: 'HeroEditorialPremium',
    filePath: 'src/components/sections/HeroEditorialPremium.tsx',
    code: `export default function HeroEditorialPremium() {
  return (
    <section className="border-b border-slate-200/70 bg-[#f6f2ea] px-6 py-24 dark:border-slate-800 dark:bg-slate-950">
      <div className="mx-auto max-w-4xl space-y-6 text-center">
        <p className="text-xs uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">Curated digital presence</p>
        <h1 className="font-serif text-5xl font-semibold leading-tight text-slate-900 dark:text-white md:text-6xl">
          {{projectName}} crafted with premium design language.
        </h1>
        <p className="mx-auto max-w-2xl text-slate-600 dark:text-slate-300">
          Strong visual identity, refined spacing, and focused storytelling for brands that care about details.
        </p>
        <div className="pt-2">
          <button className="rounded-full border border-slate-900 px-6 py-3 text-sm font-semibold text-slate-900 transition hover:bg-slate-900 hover:text-white dark:border-slate-200 dark:text-slate-200 dark:hover:bg-slate-200 dark:hover:text-slate-900">
            Explore design
          </button>
        </div>
      </div>
    </section>
  );
}
`,
  },
  {
    id: 'features-cards-soft-02',
    category: 'features',
    style: 'soft-cards',
    mood: 'friendly',
    layout: '3-col-grid',
    supportsDarkMode: true,
    tags: ['landing', 'commerce', 'saas', 'startup'],
    complexity: 1,
    componentName: 'FeaturesCardsSoft',
    filePath: 'src/components/sections/FeaturesCardsSoft.tsx',
    code: `const cards = [
  { title: 'Fast setup', text: 'Go from idea to polished layout quickly.' },
  { title: 'Reusable sections', text: 'Compose pages from a reliable block library.' },
  { title: 'Conversion focus', text: 'CTA-first structures designed for action.' },
];

export default function FeaturesCardsSoft() {
  return (
    <section id="features" className="px-6 py-20">
      <div className="mx-auto grid w-full max-w-6xl gap-6 md:grid-cols-3">
        {cards.map((card) => (
          <article key={card.title} className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white">{card.title}</h3>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{card.text}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
`,
  },
  {
    id: 'features-timeline-03',
    category: 'features',
    style: 'timeline',
    mood: 'editorial',
    layout: 'stacked',
    supportsDarkMode: true,
    tags: ['landing', 'premium', 'editorial'],
    complexity: 2,
    componentName: 'FeaturesTimeline',
    filePath: 'src/components/sections/FeaturesTimeline.tsx',
    code: `const steps = [
  { title: 'Discover', text: 'Define brand voice and product direction.' },
  { title: 'Compose', text: 'Assemble sections into a consistent story.' },
  { title: 'Refine', text: 'Tune copy, spacing and interaction details.' },
];

export default function FeaturesTimeline() {
  return (
    <section id="features" className="px-6 py-20">
      <div className="mx-auto max-w-5xl">
        <h2 className="text-3xl font-semibold text-slate-900 dark:text-white">How it works</h2>
        <div className="mt-8 space-y-6">
          {steps.map((step, idx) => (
            <article key={step.title} className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Step {idx + 1}</p>
              <h3 className="mt-2 text-xl font-semibold text-slate-900 dark:text-white">{step.title}</h3>
              <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{step.text}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
`,
  },
  {
    id: 'pricing-highlight-cards-02',
    category: 'pricing',
    style: 'highlight-cards',
    mood: 'conversion',
    layout: '3-col',
    supportsDarkMode: true,
    tags: ['pricing', 'commerce', 'saas', 'startup'],
    complexity: 2,
    componentName: 'PricingHighlightCards',
    filePath: 'src/components/sections/PricingHighlightCards.tsx',
    code: `const tiers = [
  { name: 'Starter', price: '$15', perks: ['1 project', 'Basic support'] },
  { name: 'Growth', price: '$39', perks: ['10 projects', 'Priority updates'], featured: true },
  { name: 'Scale', price: '$89', perks: ['Unlimited', 'Dedicated support'] },
];

export default function PricingHighlightCards() {
  return (
    <section id="pricing" className="px-6 py-20">
      <div className="mx-auto grid w-full max-w-6xl gap-6 md:grid-cols-3">
        {tiers.map((tier) => (
          <article key={tier.name} className={\`rounded-2xl border p-6 \${tier.featured ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-500/10' : 'border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900'}\`}>
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white">{tier.name}</h3>
            <p className="mt-2 text-3xl font-bold text-slate-900 dark:text-white">{tier.price}</p>
            <ul className="mt-4 space-y-2 text-sm text-slate-600 dark:text-slate-300">
              {tier.perks.map((perk) => <li key={perk}>- {perk}</li>)}
            </ul>
          </article>
        ))}
      </div>
    </section>
  );
}
`,
  },
  {
    id: 'pricing-minimal-stack-03',
    category: 'pricing',
    style: 'minimal-stack',
    mood: 'editorial',
    layout: 'stacked',
    supportsDarkMode: true,
    tags: ['pricing', 'premium', 'minimal'],
    complexity: 1,
    componentName: 'PricingMinimalStack',
    filePath: 'src/components/sections/PricingMinimalStack.tsx',
    code: `export default function PricingMinimalStack() {
  return (
    <section id="pricing" className="px-6 py-20">
      <div className="mx-auto max-w-4xl space-y-4">
        <article className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between">
            <h3 className="text-xl font-semibold text-slate-900 dark:text-white">Studio</h3>
            <p className="text-2xl font-bold text-slate-900 dark:text-white">$59</p>
          </div>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">For teams shipping polished experiences weekly.</p>
        </article>
        <article className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between">
            <h3 className="text-xl font-semibold text-slate-900 dark:text-white">Enterprise</h3>
            <p className="text-2xl font-bold text-slate-900 dark:text-white">Custom</p>
          </div>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">Governance, SLA, and multi-workspace rollout support.</p>
        </article>
      </div>
    </section>
  );
}
`,
  },
  {
    id: 'footer-newsletter-02',
    category: 'footer',
    style: 'newsletter',
    mood: 'growth',
    layout: 'cta-footer',
    supportsDarkMode: true,
    tags: ['footer', 'landing', 'commerce', 'startup'],
    complexity: 1,
    componentName: 'FooterNewsletter',
    filePath: 'src/components/sections/FooterNewsletter.tsx',
    code: `export default function FooterNewsletter() {
  return (
    <footer className="border-t border-slate-200 bg-white px-6 py-10 dark:border-slate-800 dark:bg-slate-950">
      <div className="mx-auto grid w-full max-w-6xl gap-6 md:grid-cols-2 md:items-center">
        <div>
          <h4 className="text-lg font-semibold text-slate-900 dark:text-white">Stay in the loop with {{projectName}}</h4>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">Monthly updates, launch notes, and product insights.</p>
        </div>
        <form className="flex flex-col gap-2 sm:flex-row">
          <input className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white" placeholder="Email address" />
          <button className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white dark:bg-cyan-500">Subscribe</button>
        </form>
      </div>
    </footer>
  );
}
`,
  },
  {
    id: 'footer-minimal-center-03',
    category: 'footer',
    style: 'minimal-centered',
    mood: 'calm',
    layout: 'centered',
    supportsDarkMode: true,
    tags: ['footer', 'landing', 'premium', 'editorial'],
    complexity: 1,
    componentName: 'FooterMinimalCenter',
    filePath: 'src/components/sections/FooterMinimalCenter.tsx',
    code: `export default function FooterMinimalCenter() {
  return (
    <footer className="border-t border-slate-200 px-6 py-12 dark:border-slate-800">
      <div className="mx-auto max-w-6xl space-y-3 text-center">
        <p className="font-serif text-xl font-semibold text-slate-900 dark:text-white">{{projectName}}</p>
        <p className="text-sm text-slate-500 dark:text-slate-400">Design-forward product experiences.</p>
        <p className="text-xs text-slate-400 dark:text-slate-500">© {new Date().getFullYear()} {{projectName}}</p>
      </div>
    </footer>
  );
}
`,
  },
  {
    id: 'sidebar-compact-02',
    category: 'sidebar',
    style: 'compact',
    mood: 'neutral',
    layout: 'left-sidebar',
    supportsDarkMode: true,
    tags: ['dashboard', 'admin', 'analytics'],
    complexity: 1,
    componentName: 'SidebarCompact',
    filePath: 'src/components/dashboard/SidebarCompact.tsx',
    code: `const links = ['Overview', 'Orders', 'Customers', 'Settings'];

export default function SidebarCompact() {
  return (
    <aside className="w-56 shrink-0 border-r border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950">
      <p className="mb-4 text-xs font-semibold uppercase tracking-wider text-slate-500">Navigation</p>
      <nav className="space-y-1">
        {links.map((label) => (
          <button key={label} className="w-full rounded-lg px-3 py-2 text-left text-sm text-slate-600 transition hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white">
            {label}
          </button>
        ))}
      </nav>
    </aside>
  );
}
`,
  },
  {
    id: 'dashboard-activity-feed-02',
    category: 'dashboard',
    style: 'activity-feed',
    mood: 'operational',
    layout: 'stacked',
    supportsDarkMode: true,
    tags: ['dashboard', 'analytics', 'admin'],
    complexity: 1,
    componentName: 'DashboardActivityFeed',
    filePath: 'src/components/dashboard/DashboardActivityFeed.tsx',
    code: `const activities = [
  'New customer signed up',
  'Quarterly report exported',
  'Team invite accepted',
  'Billing plan upgraded',
];

export default function DashboardActivityFeed() {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
      <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Recent activity</h3>
      <ul className="mt-4 space-y-2 text-sm text-slate-600 dark:text-slate-300">
        {activities.map((entry) => <li key={entry}>- {entry}</li>)}
      </ul>
    </section>
  );
}
`,
  },
  {
    id: 'stats-pill-02',
    category: 'stats',
    style: 'pill-row',
    mood: 'clean',
    layout: 'row',
    supportsDarkMode: true,
    tags: ['stats', 'dashboard', 'landing'],
    complexity: 1,
    componentName: 'StatsPill',
    filePath: 'src/components/dashboard/StatsPill.tsx',
    code: `const stats = [
  { label: 'Orders', value: '1,248' },
  { label: 'Revenue', value: '$92,400' },
  { label: 'Sessions', value: '28k' },
];

export default function StatsPill() {
  return (
    <section className="flex flex-wrap gap-3">
      {stats.map((item) => (
        <article key={item.label} className="rounded-full border border-slate-200 bg-white px-4 py-2 dark:border-slate-800 dark:bg-slate-900">
          <span className="text-xs text-slate-500 dark:text-slate-400">{item.label}</span>
          <p className="text-sm font-semibold text-slate-900 dark:text-white">{item.value}</p>
        </article>
      ))}
    </section>
  );
}
`,
  },
  {
    id: 'chart-bars-mock-02',
    category: 'chart',
    style: 'bars-mock',
    mood: 'analytic',
    layout: 'single-panel',
    supportsDarkMode: true,
    tags: ['chart', 'dashboard', 'analytics'],
    complexity: 1,
    componentName: 'ChartBarsMock',
    filePath: 'src/components/dashboard/ChartBarsMock.tsx',
    code: `export default function ChartBarsMock() {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
      <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">Weekly performance</h3>
      <div className="mt-4 flex h-40 items-end gap-2 rounded-lg bg-slate-100 p-3 dark:bg-slate-800">
        <div className="h-12 w-full rounded bg-cyan-400/70" />
        <div className="h-20 w-full rounded bg-cyan-400/70" />
        <div className="h-28 w-full rounded bg-cyan-400/70" />
        <div className="h-16 w-full rounded bg-cyan-400/70" />
        <div className="h-32 w-full rounded bg-cyan-400/70" />
      </div>
    </section>
  );
}
`,
  },
  {
    id: 'auth-centered-glass-03',
    category: 'auth',
    style: 'glass-card',
    mood: 'modern',
    layout: 'single-card',
    supportsDarkMode: true,
    tags: ['auth', 'login', 'signup', 'premium'],
    complexity: 2,
    componentName: 'AuthCenteredGlass',
    filePath: 'src/components/auth/AuthCenteredGlass.tsx',
    code: `export default function AuthCenteredGlass() {
  return (
    <section className="mx-auto w-full max-w-md rounded-2xl border border-white/40 bg-white/80 p-6 shadow-xl backdrop-blur dark:border-slate-800 dark:bg-slate-900/80">
      <h2 className="text-xl font-semibold text-slate-900 dark:text-white">Sign in to {{projectName}}</h2>
      <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">Continue with your workspace credentials.</p>
      <form className="mt-5 space-y-3">
        <input className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-white" placeholder="Email" />
        <input className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-white" placeholder="Password" type="password" />
        <button className="w-full rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white dark:bg-cyan-500">Continue</button>
      </form>
    </section>
  );
}
`,
  },
  {
    id: 'navbar-neon-04',
    category: 'navbar',
    style: 'bold-neon',
    mood: 'energetic',
    layout: 'inline-nav',
    supportsDarkMode: true,
    tags: ['landing', 'bold', 'creative', 'startup'],
    complexity: 2,
    componentName: 'NavbarNeon',
    filePath: 'src/components/sections/NavbarNeon.tsx',
    code: `import { Sparkles } from 'lucide-react';

export default function NavbarNeon() {
  return (
    <header className="sticky top-0 z-20 border-b border-fuchsia-400/30 bg-slate-950/90 backdrop-blur">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-6">
        <div className="flex items-center gap-2 font-semibold text-white">
          <Sparkles className="h-4 w-4 text-fuchsia-400" />
          {{projectName}}
        </div>
        <nav className="hidden items-center gap-6 text-sm text-slate-300 md:flex">
          <a href="#features" className="hover:text-fuchsia-300">Features</a>
          <a href="#pricing" className="hover:text-fuchsia-300">Pricing</a>
          <a href="#contact" className="hover:text-fuchsia-300">Contact</a>
        </nav>
      </div>
    </header>
  );
}
`,
  },
  {
    id: 'hero-gradient-orbit-04',
    category: 'hero',
    style: 'bold-gradient',
    mood: 'energetic',
    layout: 'split',
    supportsDarkMode: true,
    tags: ['landing', 'bold', 'creative', 'conversion'],
    complexity: 2,
    componentName: 'HeroGradientOrbit',
    filePath: 'src/components/sections/HeroGradientOrbit.tsx',
    code: `import { ArrowRight } from 'lucide-react';

export default function HeroGradientOrbit() {
  return (
    <section className="relative overflow-hidden border-b border-fuchsia-400/20 bg-gradient-to-br from-slate-950 via-indigo-950 to-fuchsia-950 px-6 py-24 text-white">
      <div className="pointer-events-none absolute -left-20 top-10 h-72 w-72 rounded-full bg-fuchsia-500/20 blur-3xl" />
      <div className="pointer-events-none absolute -right-24 bottom-0 h-72 w-72 rounded-full bg-cyan-500/20 blur-3xl" />
      <div className="relative mx-auto max-w-6xl space-y-6">
        <p className="inline-flex rounded-full border border-fuchsia-400/40 px-3 py-1 text-xs text-fuchsia-200">Launch faster</p>
        <h1 className="max-w-4xl text-4xl font-bold tracking-tight md:text-6xl">
          High-impact pages for {{projectName}}.
        </h1>
        <p className="max-w-2xl text-slate-200">
          Distinct visual identity, conversion-first hierarchy, and fast iteration loops.
        </p>
        <button className="inline-flex items-center gap-2 rounded-lg bg-fuchsia-500 px-5 py-3 text-sm font-semibold text-white transition hover:bg-fuchsia-400">
          Start now <ArrowRight className="h-4 w-4" />
        </button>
      </div>
    </section>
  );
}
`,
  },
  {
    id: 'features-showcase-panels-04',
    category: 'features',
    style: 'showcase-panels',
    mood: 'energetic',
    layout: 'panel-grid',
    supportsDarkMode: true,
    tags: ['landing', 'bold', 'creative', 'conversion'],
    complexity: 2,
    componentName: 'FeaturesShowcasePanels',
    filePath: 'src/components/sections/FeaturesShowcasePanels.tsx',
    code: `const items = [
  { title: 'Visual identity', text: 'Distinct art direction with strong hierarchy.' },
  { title: 'Fast experiments', text: 'Swap sections without rewriting the entire page.' },
  { title: 'Conversion focus', text: 'CTA-first structure and concise narrative flow.' },
];

export default function FeaturesShowcasePanels() {
  return (
    <section id="features" className="bg-slate-950 px-6 py-20 text-white">
      <div className="mx-auto grid w-full max-w-6xl gap-4 md:grid-cols-3">
        {items.map((item) => (
          <article key={item.title} className="rounded-2xl border border-fuchsia-400/20 bg-white/5 p-6 backdrop-blur">
            <h3 className="text-lg font-semibold">{item.title}</h3>
            <p className="mt-2 text-sm text-slate-300">{item.text}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
`,
  },
  {
    id: 'pricing-contrast-cards-04',
    category: 'pricing',
    style: 'contrast-cards',
    mood: 'bold',
    layout: '3-col',
    supportsDarkMode: true,
    tags: ['pricing', 'landing', 'conversion', 'bold'],
    complexity: 2,
    componentName: 'PricingContrastCards',
    filePath: 'src/components/sections/PricingContrastCards.tsx',
    code: `const tiers = [
  { name: 'Launch', price: '$29', desc: 'Single brand setup' },
  { name: 'Scale', price: '$79', desc: 'Growth team workflows', featured: true },
  { name: 'Elite', price: '$149', desc: 'Advanced orchestration' },
];

export default function PricingContrastCards() {
  return (
    <section id="pricing" className="bg-slate-950 px-6 py-20 text-white">
      <div className="mx-auto grid max-w-6xl gap-6 md:grid-cols-3">
        {tiers.map((tier) => (
          <article key={tier.name} className={\`rounded-2xl border p-6 \${tier.featured ? 'border-fuchsia-400 bg-fuchsia-500/15' : 'border-slate-700 bg-slate-900'}\`}>
            <h3 className="text-lg font-semibold">{tier.name}</h3>
            <p className="mt-2 text-3xl font-bold">{tier.price}</p>
            <p className="mt-2 text-sm text-slate-300">{tier.desc}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
`,
  },
  {
    id: 'footer-columns-brand-04',
    category: 'footer',
    style: 'columns-brand',
    mood: 'professional',
    layout: 'multi-column',
    supportsDarkMode: true,
    tags: ['footer', 'landing', 'bold', 'creative'],
    complexity: 1,
    componentName: 'FooterColumnsBrand',
    filePath: 'src/components/sections/FooterColumnsBrand.tsx',
    code: `export default function FooterColumnsBrand() {
  return (
    <footer id="contact" className="border-t border-slate-800 bg-slate-950 px-6 py-12 text-slate-200">
      <div className="mx-auto grid w-full max-w-6xl gap-8 md:grid-cols-3">
        <div>
          <p className="text-lg font-semibold text-white">{{projectName}}</p>
          <p className="mt-2 text-sm text-slate-400">Creative digital experiences for modern teams.</p>
        </div>
        <div>
          <p className="text-sm font-semibold text-white">Product</p>
          <ul className="mt-2 space-y-1 text-sm text-slate-400">
            <li>Features</li>
            <li>Pricing</li>
            <li>Changelog</li>
          </ul>
        </div>
        <div>
          <p className="text-sm font-semibold text-white">Company</p>
          <ul className="mt-2 space-y-1 text-sm text-slate-400">
            <li>About</li>
            <li>Contact</li>
            <li>Support</li>
          </ul>
        </div>
      </div>
    </footer>
  );
}
`,
  },
  {
    id: 'navbar-corporate-05',
    category: 'navbar',
    style: 'corporate-clean',
    mood: 'professional',
    layout: 'inline-nav',
    supportsDarkMode: true,
    tags: ['landing', 'corporate', 'b2b', 'enterprise'],
    complexity: 1,
    componentName: 'NavbarCorporate',
    filePath: 'src/components/sections/NavbarCorporate.tsx',
    code: `export default function NavbarCorporate() {
  return (
    <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/90 backdrop-blur dark:border-slate-800 dark:bg-slate-950/90">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-6">
        <p className="font-semibold text-slate-900 dark:text-white">{{projectName}}</p>
        <nav className="hidden items-center gap-6 text-sm text-slate-600 dark:text-slate-300 md:flex">
          <a href="#features" className="hover:text-slate-900 dark:hover:text-white">Solutions</a>
          <a href="#pricing" className="hover:text-slate-900 dark:hover:text-white">Pricing</a>
          <a href="#contact" className="hover:text-slate-900 dark:hover:text-white">Contact</a>
        </nav>
      </div>
    </header>
  );
}
`,
  },
  {
    id: 'hero-corporate-clean-05',
    category: 'hero',
    style: 'corporate-clean',
    mood: 'professional',
    layout: 'centered',
    supportsDarkMode: true,
    tags: ['landing', 'corporate', 'b2b', 'enterprise'],
    complexity: 1,
    componentName: 'HeroCorporateClean',
    filePath: 'src/components/sections/HeroCorporateClean.tsx',
    code: `export default function HeroCorporateClean() {
  return (
    <section className="border-b border-slate-200 bg-slate-50 px-6 py-24 dark:border-slate-800 dark:bg-slate-950">
      <div className="mx-auto max-w-4xl space-y-5 text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Enterprise Ready</p>
        <h1 className="text-4xl font-bold tracking-tight text-slate-900 dark:text-white md:text-5xl">
          Trusted platform experiences for {{projectName}}.
        </h1>
        <p className="text-slate-600 dark:text-slate-300">
          Reliable structure, clear information density, and conversion-focused UX.
        </p>
        <button className="rounded-lg bg-slate-900 px-5 py-3 text-sm font-semibold text-white dark:bg-cyan-500">Request demo</button>
      </div>
    </section>
  );
}
`,
  },
  {
    id: 'features-checklist-05',
    category: 'features',
    style: 'checklist',
    mood: 'professional',
    layout: '2-col-list',
    supportsDarkMode: true,
    tags: ['landing', 'corporate', 'b2b', 'enterprise'],
    complexity: 1,
    componentName: 'FeaturesChecklist',
    filePath: 'src/components/sections/FeaturesChecklist.tsx',
    code: `const bullets = [
  'Role-based workflows and handoff clarity',
  'Component-level maintainability',
  'Design consistency via section composition',
  'Scalable multi-page information architecture',
];

export default function FeaturesChecklist() {
  return (
    <section id="features" className="px-6 py-20">
      <div className="mx-auto max-w-6xl rounded-2xl border border-slate-200 bg-white p-8 dark:border-slate-800 dark:bg-slate-900">
        <h2 className="text-2xl font-semibold text-slate-900 dark:text-white">Why teams choose {{projectName}}</h2>
        <ul className="mt-6 grid gap-3 text-sm text-slate-600 dark:text-slate-300 md:grid-cols-2">
          {bullets.map((bullet) => <li key={bullet}>- {bullet}</li>)}
        </ul>
      </div>
    </section>
  );
}
`,
  },
  {
    id: 'pricing-enterprise-grid-05',
    category: 'pricing',
    style: 'enterprise-grid',
    mood: 'clear',
    layout: '2-col',
    supportsDarkMode: true,
    tags: ['pricing', 'corporate', 'enterprise', 'b2b'],
    complexity: 1,
    componentName: 'PricingEnterpriseGrid',
    filePath: 'src/components/sections/PricingEnterpriseGrid.tsx',
    code: `const plans = [
  { name: 'Team', price: '$99', text: 'Ideal for focused product squads.' },
  { name: 'Enterprise', price: 'Custom', text: 'Governance, SSO and SLA support.' },
];

export default function PricingEnterpriseGrid() {
  return (
    <section id="pricing" className="px-6 py-20">
      <div className="mx-auto grid max-w-6xl gap-6 md:grid-cols-2">
        {plans.map((plan) => (
          <article key={plan.name} className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white">{plan.name}</h3>
            <p className="mt-2 text-3xl font-bold text-slate-900 dark:text-white">{plan.price}</p>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{plan.text}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
`,
  },
  {
    id: 'footer-legal-05',
    category: 'footer',
    style: 'legal',
    mood: 'professional',
    layout: 'inline',
    supportsDarkMode: true,
    tags: ['footer', 'corporate', 'enterprise', 'auth'],
    complexity: 1,
    componentName: 'FooterLegal',
    filePath: 'src/components/sections/FooterLegal.tsx',
    code: `export default function FooterLegal() {
  return (
    <footer className="border-t border-slate-200 px-6 py-8 text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <p>{new Date().getFullYear()} {{projectName}}. All rights reserved.</p>
        <div className="flex gap-4">
          <a href="#" className="hover:text-slate-700 dark:hover:text-slate-200">Privacy</a>
          <a href="#" className="hover:text-slate-700 dark:hover:text-slate-200">Terms</a>
          <a href="#" className="hover:text-slate-700 dark:hover:text-slate-200">Security</a>
        </div>
      </div>
    </footer>
  );
}
`,
  },
  {
    id: 'sidebar-ops-03',
    category: 'sidebar',
    style: 'ops-compact',
    mood: 'operational',
    layout: 'left-sidebar',
    supportsDarkMode: true,
    tags: ['dashboard', 'operations', 'monitoring', 'enterprise'],
    complexity: 1,
    componentName: 'SidebarOps',
    filePath: 'src/components/dashboard/SidebarOps.tsx',
    code: `const links = ['Overview', 'Incidents', 'Queues', 'Deployments', 'Settings'];

export default function SidebarOps() {
  return (
    <aside className="w-60 shrink-0 border-r border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950">
      <p className="mb-4 text-xs font-semibold uppercase tracking-widest text-slate-500">Ops</p>
      <nav className="space-y-1">
        {links.map((label) => (
          <button key={label} className="w-full rounded-lg px-3 py-2 text-left text-sm text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white">
            {label}
          </button>
        ))}
      </nav>
    </aside>
  );
}
`,
  },
  {
    id: 'dashboard-kpi-ribbon-03',
    category: 'dashboard',
    style: 'kpi-ribbon',
    mood: 'operational',
    layout: 'ribbon',
    supportsDarkMode: true,
    tags: ['dashboard', 'operations', 'analytics'],
    complexity: 1,
    componentName: 'DashboardKpiRibbon',
    filePath: 'src/components/dashboard/DashboardKpiRibbon.tsx',
    code: `const kpis = [
  { label: 'Availability', value: '99.98%' },
  { label: 'Queue time', value: '42s' },
  { label: 'Incidents', value: '2' },
];

export default function DashboardKpiRibbon() {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
      <div className="grid gap-3 md:grid-cols-3">
        {kpis.map((kpi) => (
          <article key={kpi.label} className="rounded-lg bg-slate-100 p-4 dark:bg-slate-800">
            <p className="text-xs text-slate-500 dark:text-slate-400">{kpi.label}</p>
            <p className="mt-1 text-lg font-semibold text-slate-900 dark:text-white">{kpi.value}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
`,
  },
  {
    id: 'stats-tiles-03',
    category: 'stats',
    style: 'tiles',
    mood: 'professional',
    layout: '2x2',
    supportsDarkMode: true,
    tags: ['stats', 'dashboard', 'operations'],
    complexity: 1,
    componentName: 'StatsTiles',
    filePath: 'src/components/dashboard/StatsTiles.tsx',
    code: `const tiles = [
  { label: 'Deploys', value: '128' },
  { label: 'Alerts', value: '7' },
  { label: 'SLA', value: '99.95%' },
  { label: 'MRR', value: '$84k' },
];

export default function StatsTiles() {
  return (
    <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      {tiles.map((tile) => (
        <article key={tile.label} className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <p className="text-xs text-slate-500 dark:text-slate-400">{tile.label}</p>
          <p className="mt-2 text-xl font-semibold text-slate-900 dark:text-white">{tile.value}</p>
        </article>
      ))}
    </section>
  );
}
`,
  },
  {
    id: 'chart-line-mock-03',
    category: 'chart',
    style: 'line-mock',
    mood: 'analytic',
    layout: 'single-panel',
    supportsDarkMode: true,
    tags: ['chart', 'dashboard', 'analytics', 'operations'],
    complexity: 1,
    componentName: 'ChartLineMock',
    filePath: 'src/components/dashboard/ChartLineMock.tsx',
    code: `export default function ChartLineMock() {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
      <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">Traffic trend</h3>
      <div className="mt-4 h-40 rounded-lg bg-slate-100 p-4 dark:bg-slate-800">
        <svg viewBox="0 0 100 40" className="h-full w-full">
          <polyline fill="none" stroke="currentColor" strokeWidth="2" className="text-cyan-500" points="0,30 15,26 30,28 45,18 60,20 75,12 90,14 100,8" />
        </svg>
      </div>
    </section>
  );
}
`,
  },
  {
    id: 'auth-split-minimal-04',
    category: 'auth',
    style: 'split-minimal',
    mood: 'clean',
    layout: 'split-panel',
    supportsDarkMode: true,
    tags: ['auth', 'login', 'register', 'modern'],
    complexity: 2,
    componentName: 'AuthSplitMinimal',
    filePath: 'src/components/auth/AuthSplitMinimal.tsx',
    code: `export default function AuthSplitMinimal() {
  return (
    <section className="mx-auto grid w-full max-w-5xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-lg dark:border-slate-800 dark:bg-slate-900 md:grid-cols-2">
      <div className="bg-slate-900 p-8 text-white">
        <p className="text-sm uppercase tracking-[0.2em] text-slate-300">Welcome</p>
        <h2 className="mt-4 text-2xl font-semibold">Access {{projectName}}</h2>
        <p className="mt-2 text-sm text-slate-300">Sign in to continue your workflow.</p>
      </div>
      <form className="space-y-4 p-8">
        <input className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-white" placeholder="Email" />
        <input className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-white" placeholder="Password" type="password" />
        <button className="w-full rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white dark:bg-cyan-500">Sign in</button>
      </form>
    </section>
  );
}
`,
  },
  {
    id: 'modal-confirm-clean-02',
    category: 'modal',
    style: 'confirm-clean',
    mood: 'neutral',
    layout: 'centered',
    supportsDarkMode: true,
    tags: ['modal', 'confirm', 'auth', 'dashboard'],
    complexity: 1,
    componentName: 'ModalConfirmClean',
    filePath: 'src/components/modals/ModalConfirmClean.tsx',
    code: `export default function ModalConfirmClean() {
  return (
    <div className="mx-auto w-full max-w-md rounded-xl border border-slate-200 bg-white p-5 shadow dark:border-slate-800 dark:bg-slate-900">
      <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Confirm action</h3>
      <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">Are you sure you want to apply these changes?</p>
      <div className="mt-4 flex justify-end gap-2">
        <button className="rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700">Cancel</button>
        <button className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white dark:bg-cyan-500">Apply</button>
      </div>
    </div>
  );
}
`,
  },
];
