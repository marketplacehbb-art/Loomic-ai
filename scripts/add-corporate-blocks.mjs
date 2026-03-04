import fs from 'fs';
import path from 'path';

const schemaPath = path.resolve('ui-component-library-schema.json');
const raw = fs.readFileSync(schemaPath, 'utf8');
const data = JSON.parse(raw);

if (!Array.isArray(data.components)) {
  throw new Error('Invalid schema: components array missing');
}

const categories = [...new Set(data.components.map((c) => String(c.category || '').toLowerCase()).filter(Boolean))];
const existingIds = new Set(data.components.map((c) => String(c.id || '').trim()).filter(Boolean));

const corpIndustry = {
  hero: ['saas', 'enterprise', 'b2b'],
  navbar: ['saas', 'enterprise', 'agency'],
  features: ['saas', 'enterprise', 'platform'],
  pricing: ['saas', 'b2b'],
  footer: ['saas', 'enterprise', 'agency'],
  dashboard: ['analytics', 'saas', 'enterprise'],
  auth: ['saas', 'b2b', 'enterprise'],
  modal: ['saas', 'enterprise', 'admin'],
  stats: ['saas', 'analytics', 'enterprise'],
  chart: ['analytics', 'saas', 'fintech'],
  testimonials: ['saas', 'enterprise', 'services'],
  cta: ['saas', 'enterprise', 'b2b'],
  faq: ['saas', 'enterprise', 'support'],
  team: ['agency', 'enterprise', 'services'],
  timeline: ['saas', 'enterprise', 'agency'],
  banner: ['saas', 'ecommerce', 'enterprise'],
  contact: ['saas', 'enterprise', 'agency'],
  blog: ['saas', 'enterprise', 'content'],
  gallery: ['portfolio', 'agency', 'enterprise'],
  ecommerce: ['ecommerce', 'retail', 'd2c'],
  'social-proof': ['saas', 'enterprise', 'services']
};

const subcategoryByCategory = {
  hero: ['split-clean', 'center-corporate', 'minimal-gradient'],
  navbar: ['sticky-clean', 'corporate-simple', 'compact-links'],
  features: ['grid-cards', 'two-column', 'list-checks'],
  pricing: ['three-tier-clean', 'enterprise-grid', 'comparison-lite'],
  footer: ['multi-column-clean', 'minimal-legal', 'cta-footer'],
  dashboard: ['kpi-grid', 'ops-overview', 'activity-panel'],
  auth: ['card-clean', 'split-simple', 'minimal-form'],
  modal: ['confirm-clean', 'info-panel', 'action-modal'],
  stats: ['metric-cards', 'strip-clean', 'kpi-compact'],
  chart: ['line-clean', 'bar-clean', 'area-clean'],
  testimonials: ['cards-clean', 'single-quote', 'logo-proof'],
  cta: ['centered-clean', 'split-clean', 'inline-cta'],
  faq: ['accordion-clean', 'list-clean', 'support-faq'],
  team: ['grid-clean', 'compact-profiles', 'leadership-row'],
  timeline: ['vertical-clean', 'milestone-row', 'process-steps'],
  banner: ['announcement', 'promo-strip', 'status-bar'],
  contact: ['form-clean', 'split-contact', 'support-panel'],
  blog: ['cards-clean', 'list-modern', 'editorial-clean'],
  gallery: ['grid-clean', 'masonry-lite', 'portfolio-strip'],
  ecommerce: ['product-grid-clean', 'collection-highlight', 'shop-banner'],
  'social-proof': ['metrics-clean', 'logo-strip', 'quote-grid']
};

function pascal(input) {
  return String(input)
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join('') || 'Section';
}

function snippetFor(category, componentName, title, idx) {
  const accent = idx % 2 === 0 ? 'indigo' : 'slate';

  if (category === 'navbar') {
    return `export default function ${componentName}() {\n  return (\n    <header className=\"sticky top-0 z-40 border-b border-slate-200 bg-white/95 backdrop-blur\">\n      <div className=\"mx-auto flex h-16 max-w-7xl items-center justify-between px-6\">\n        <div className=\"text-sm font-semibold tracking-wide text-slate-900\">{{projectName}}</div>\n        <nav className=\"hidden items-center gap-6 text-sm text-slate-600 md:flex\">\n          <a href=\"#overview\" className=\"hover:text-slate-900\">Overview</a>\n          <a href=\"#solutions\" className=\"hover:text-slate-900\">Solutions</a>\n          <a href=\"#contact\" className=\"hover:text-slate-900\">Contact</a>\n        </nav>\n        <button className=\"rounded-md bg-${accent}-600 px-3 py-2 text-xs font-semibold text-white\">Get Demo</button>\n      </div>\n    </header>\n  );\n}\n`;
  }

  if (category === 'hero') {
    return `export default function ${componentName}() {\n  return (\n    <section className=\"px-6 py-24\">\n      <div className=\"mx-auto max-w-6xl\">\n        <div className=\"max-w-3xl space-y-5\">\n          <span className=\"inline-flex rounded-full border border-slate-300 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-slate-600\">Light Corporate</span>\n          <h1 className=\"text-4xl font-bold tracking-tight text-slate-900 md:text-6xl\">${title}</h1>\n          <p className=\"text-base text-slate-600 md:text-lg\">Designed for clear hierarchy, trust, and conversion-focused messaging.</p>\n          <div className=\"flex gap-3\">\n            <button className=\"rounded-lg bg-${accent}-600 px-5 py-3 text-sm font-semibold text-white\">Start now</button>\n            <button className=\"rounded-lg border border-slate-300 px-5 py-3 text-sm font-semibold text-slate-700\">See details</button>\n          </div>\n        </div>\n      </div>\n    </section>\n  );\n}\n`;
  }

  if (category === 'features') {
    return `const ITEMS = [\n  { title: 'Fast onboarding', text: 'Clear IA and focused content blocks for business users.' },\n  { title: 'Reliable scale', text: 'Composable sections for multi-page growth.' },\n  { title: 'Governed style', text: 'Consistent spacing, typography and interaction states.' }\n];\n\nexport default function ${componentName}() {\n  return (\n    <section className=\"px-6 py-20\">\n      <div className=\"mx-auto max-w-6xl\">\n        <h2 className=\"text-3xl font-bold text-slate-900\">${title}</h2>\n        <div className=\"mt-8 grid gap-4 md:grid-cols-3\">\n          {ITEMS.map((item) => (\n            <article key={item.title} className=\"rounded-xl border border-slate-200 bg-white p-6\">\n              <h3 className=\"text-base font-semibold text-slate-900\">{item.title}</h3>\n              <p className=\"mt-2 text-sm text-slate-600\">{item.text}</p>\n            </article>\n          ))}\n        </div>\n      </div>\n    </section>\n  );\n}\n`;
  }

  if (category === 'pricing') {
    return `const PLANS = [\n  { name: 'Starter', price: '$19', bullets: ['Core modules', 'Email support'] },\n  { name: 'Growth', price: '$59', bullets: ['Advanced analytics', 'Priority support'], featured: true },\n  { name: 'Scale', price: '$129', bullets: ['Enterprise controls', 'Dedicated success'] }\n];\n\nexport default function ${componentName}() {\n  return (\n    <section className=\"px-6 py-20\">\n      <div className=\"mx-auto max-w-6xl\">\n        <h2 className=\"text-3xl font-bold text-slate-900\">${title}</h2>\n        <div className=\"mt-8 grid gap-4 md:grid-cols-3\">\n          {PLANS.map((plan) => (\n            <article key={plan.name} className={\`rounded-xl border p-6 \${plan.featured ? 'border-${accent}-500 bg-${accent}-50' : 'border-slate-200 bg-white'}\`}>\n              <h3 className=\"text-lg font-semibold text-slate-900\">{plan.name}</h3>\n              <p className=\"mt-2 text-3xl font-bold text-slate-900\">{plan.price}</p>\n              <ul className=\"mt-4 space-y-2 text-sm text-slate-600\">\n                {plan.bullets.map((b) => <li key={b}>{b}</li>)}\n              </ul>\n            </article>\n          ))}\n        </div>\n      </div>\n    </section>\n  );\n}\n`;
  }

  if (category === 'footer') {
    return `export default function ${componentName}() {\n  return (\n    <footer className=\"border-t border-slate-200 bg-white px-6 py-10\">\n      <div className=\"mx-auto flex max-w-6xl flex-col gap-3 text-sm text-slate-600 md:flex-row md:items-center md:justify-between\">\n        <div className=\"font-semibold text-slate-900\">{{projectName}}</div>\n        <p>Built with a clean corporate design language.</p>\n      </div>\n    </footer>\n  );\n}\n`;
  }

  if (category === 'dashboard') {
    return `const METRICS = [\n  { label: 'Revenue', value: '$82.4k', delta: '+9%' },\n  { label: 'Users', value: '18,420', delta: '+12%' },\n  { label: 'Retention', value: '91%', delta: '+2%' }\n];\n\nexport default function ${componentName}() {\n  return (\n    <section className=\"grid gap-4 md:grid-cols-3\">\n      {METRICS.map((item) => (\n        <article key={item.label} className=\"rounded-xl border border-slate-200 bg-white p-5\">\n          <p className=\"text-xs uppercase tracking-wide text-slate-500\">{item.label}</p>\n          <p className=\"mt-2 text-2xl font-semibold text-slate-900\">{item.value}</p>\n          <p className=\"mt-1 text-sm text-emerald-600\">{item.delta}</p>\n        </article>\n      ))}\n    </section>\n  );\n}\n`;
  }

  if (category === 'auth') {
    return `export default function ${componentName}() {\n  return (\n    <section className=\"mx-auto w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-sm\">\n      <h2 className=\"text-2xl font-bold text-slate-900\">${title}</h2>\n      <p className=\"mt-1 text-sm text-slate-600\">Secure sign-in with clean form hierarchy.</p>\n      <form className=\"mt-6 space-y-4\">\n        <input className=\"w-full rounded-lg border border-slate-300 px-3 py-2 text-sm\" placeholder=\"Email\" />\n        <input type=\"password\" className=\"w-full rounded-lg border border-slate-300 px-3 py-2 text-sm\" placeholder=\"Password\" />\n        <button type=\"button\" className=\"w-full rounded-lg bg-${accent}-600 px-4 py-2 text-sm font-semibold text-white\">Continue</button>\n      </form>\n    </section>\n  );\n}\n`;
  }

  if (category === 'modal') {
    return `export default function ${componentName}() {\n  return (\n    <section className=\"mx-auto w-full max-w-lg rounded-xl border border-slate-200 bg-white p-6 shadow-sm\">\n      <h3 className=\"text-lg font-semibold text-slate-900\">${title}</h3>\n      <p className=\"mt-2 text-sm text-slate-600\">Use clear copy, strong hierarchy and safe actions.</p>\n      <div className=\"mt-5 flex gap-3\">\n        <button type=\"button\" className=\"rounded-lg border border-slate-300 px-4 py-2 text-sm\">Cancel</button>\n        <button type=\"button\" className=\"rounded-lg bg-${accent}-600 px-4 py-2 text-sm font-semibold text-white\">Confirm</button>\n      </div>\n    </section>\n  );\n}\n`;
  }

  if (category === 'stats') {
    return `const STATS = [\n  { label: 'Projects', value: '124' },\n  { label: 'SLA', value: '99.9%' },\n  { label: 'NPS', value: '68' }\n];\n\nexport default function ${componentName}() {\n  return (\n    <section className=\"grid gap-4 md:grid-cols-3\">\n      {STATS.map((s) => (\n        <article key={s.label} className=\"rounded-xl border border-slate-200 bg-white p-5\">\n          <p className=\"text-xs uppercase tracking-wide text-slate-500\">{s.label}</p>\n          <p className=\"mt-2 text-2xl font-semibold text-slate-900\">{s.value}</p>\n        </article>\n      ))}\n    </section>\n  );\n}\n`;
  }

  if (category === 'chart') {
    return `const BARS = [44, 63, 58, 72, 67, 81, 76];\n\nexport default function ${componentName}() {\n  return (\n    <section className=\"rounded-xl border border-slate-200 bg-white p-6\">\n      <h3 className=\"text-lg font-semibold text-slate-900\">${title}</h3>\n      <div className=\"mt-6 flex h-40 items-end gap-2\">\n        {BARS.map((value, i) => (\n          <div key={i} className=\"flex-1 rounded-t bg-${accent}-500/80\" style={{ height: \`\${value}%\` }} />\n        ))}\n      </div>\n    </section>\n  );\n}\n`;
  }

  if (category === 'testimonials' || category === 'social-proof') {
    return `const QUOTES = [\n  { name: 'Lena Weber', role: 'COO', quote: 'Strong design consistency and clear communication.' },\n  { name: 'David Klein', role: 'CTO', quote: 'The section system scales across teams.' },\n  { name: 'Mara Fischer', role: 'Head of Ops', quote: 'Fast updates without visual regressions.' }\n];\n\nexport default function ${componentName}() {\n  return (\n    <section className=\"px-6 py-20\">\n      <div className=\"mx-auto max-w-6xl\">\n        <h2 className=\"text-3xl font-bold text-slate-900\">${title}</h2>\n        <div className=\"mt-8 grid gap-4 md:grid-cols-3\">\n          {QUOTES.map((q) => (\n            <article key={q.name} className=\"rounded-xl border border-slate-200 bg-white p-6\">\n              <p className=\"text-sm text-slate-600\">\"{q.quote}\"</p>\n              <p className=\"mt-4 text-sm font-semibold text-slate-900\">{q.name}</p>\n              <p className=\"text-xs text-slate-500\">{q.role}</p>\n            </article>\n          ))}\n        </div>\n      </div>\n    </section>\n  );\n}\n`;
  }

  if (category === 'cta') {
    return `export default function ${componentName}() {\n  return (\n    <section className=\"px-6 py-20\">\n      <div className=\"mx-auto flex max-w-5xl flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-8\">\n        <h2 className=\"text-3xl font-bold text-slate-900\">${title}</h2>\n        <p className=\"text-sm text-slate-600\">Focused call-to-action with enterprise clarity.</p>\n        <div>\n          <button className=\"rounded-lg bg-${accent}-600 px-5 py-3 text-sm font-semibold text-white\">Book a demo</button>\n        </div>\n      </div>\n    </section>\n  );\n}\n`;
  }

  if (category === 'faq') {
    return `const ITEMS = [\n  { q: 'How long is onboarding?', a: 'Most teams are live in less than one week.' },\n  { q: 'Can we customize modules?', a: 'Yes, all sections are modular and composable.' },\n  { q: 'Is governance supported?', a: 'Yes, role-based access and audit-ready flows are supported.' }\n];\n\nexport default function ${componentName}() {\n  return (\n    <section className=\"px-6 py-20\">\n      <div className=\"mx-auto max-w-4xl\">\n        <h2 className=\"text-3xl font-bold text-slate-900\">${title}</h2>\n        <div className=\"mt-8 space-y-3\">\n          {ITEMS.map((item) => (\n            <details key={item.q} className=\"rounded-xl border border-slate-200 bg-white p-4\">\n              <summary className=\"cursor-pointer text-sm font-semibold text-slate-900\">{item.q}</summary>\n              <p className=\"mt-2 text-sm text-slate-600\">{item.a}</p>\n            </details>\n          ))}\n        </div>\n      </div>\n    </section>\n  );\n}\n`;
  }

  if (category === 'team') {
    return `const PEOPLE = [\n  { name: 'Anna Meyer', role: 'Managing Director' },\n  { name: 'Tim Schwarz', role: 'Head of Product' },\n  { name: 'Nora Lang', role: 'Engineering Lead' }\n];\n\nexport default function ${componentName}() {\n  return (\n    <section className=\"px-6 py-20\">\n      <div className=\"mx-auto max-w-6xl\">\n        <h2 className=\"text-3xl font-bold text-slate-900\">${title}</h2>\n        <div className=\"mt-8 grid gap-4 md:grid-cols-3\">\n          {PEOPLE.map((p) => (\n            <article key={p.name} className=\"rounded-xl border border-slate-200 bg-white p-5\">\n              <div className=\"h-20 rounded-lg bg-slate-100\" />\n              <p className=\"mt-4 text-sm font-semibold text-slate-900\">{p.name}</p>\n              <p className=\"text-xs text-slate-500\">{p.role}</p>\n            </article>\n          ))}\n        </div>\n      </div>\n    </section>\n  );\n}\n`;
  }

  if (category === 'timeline') {
    return `const STEPS = [\n  { title: 'Plan', text: 'Define scope and measurable outcomes.' },\n  { title: 'Implement', text: 'Ship modular pages and reusable sections.' },\n  { title: 'Scale', text: 'Iterate with governed edits and QA checks.' }\n];\n\nexport default function ${componentName}() {\n  return (\n    <section className=\"px-6 py-20\">\n      <div className=\"mx-auto max-w-4xl\">\n        <h2 className=\"text-3xl font-bold text-slate-900\">${title}</h2>\n        <ol className=\"mt-8 space-y-4\">\n          {STEPS.map((s, i) => (\n            <li key={s.title} className=\"rounded-xl border border-slate-200 bg-white p-5\">\n              <p className=\"text-xs uppercase tracking-wide text-slate-500\">Phase {i + 1}</p>\n              <p className=\"mt-1 text-base font-semibold text-slate-900\">{s.title}</p>\n              <p className=\"mt-2 text-sm text-slate-600\">{s.text}</p>\n            </li>\n          ))}\n        </ol>\n      </div>\n    </section>\n  );\n}\n`;
  }

  if (category === 'banner') {
    return `export default function ${componentName}() {\n  return (\n    <section className=\"border-y border-slate-200 bg-slate-50 px-6 py-3 text-center text-sm text-slate-700\">\n      ${title} - Trusted by modern teams across operations and product.\n    </section>\n  );\n}\n`;
  }

  if (category === 'contact') {
    return `export default function ${componentName}() {\n  return (\n    <section className=\"px-6 py-20\">\n      <div className=\"mx-auto grid max-w-5xl gap-6 rounded-2xl border border-slate-200 bg-white p-8 md:grid-cols-2\">\n        <div>\n          <h2 className=\"text-3xl font-bold text-slate-900\">${title}</h2>\n          <p className=\"mt-3 text-sm text-slate-600\">Enterprise-ready contact flow with clear input hierarchy.</p>\n        </div>\n        <form className=\"space-y-3\">\n          <input className=\"w-full rounded-lg border border-slate-300 px-3 py-2 text-sm\" placeholder=\"Name\" />\n          <input className=\"w-full rounded-lg border border-slate-300 px-3 py-2 text-sm\" placeholder=\"Work email\" />\n          <textarea className=\"h-24 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm\" placeholder=\"How can we help?\" />\n          <button type=\"button\" className=\"rounded-lg bg-${accent}-600 px-4 py-2 text-sm font-semibold text-white\">Submit</button>\n        </form>\n      </div>\n    </section>\n  );\n}\n`;
  }

  if (category === 'blog') {
    return `const POSTS = [\n  { title: 'Operational clarity at scale', text: 'Practical patterns for high-quality product delivery.' },\n  { title: 'Design governance in fast teams', text: 'How to keep consistency while iterating quickly.' },\n  { title: 'Reusable section systems', text: 'Building blocks that reduce regressions over time.' }\n];\n\nexport default function ${componentName}() {\n  return (\n    <section className=\"px-6 py-20\">\n      <div className=\"mx-auto max-w-6xl\">\n        <h2 className=\"text-3xl font-bold text-slate-900\">${title}</h2>\n        <div className=\"mt-8 grid gap-4 md:grid-cols-3\">\n          {POSTS.map((p) => (\n            <article key={p.title} className=\"rounded-xl border border-slate-200 bg-white p-5\">\n              <h3 className=\"text-base font-semibold text-slate-900\">{p.title}</h3>\n              <p className=\"mt-2 text-sm text-slate-600\">{p.text}</p>\n            </article>\n          ))}\n        </div>\n      </div>\n    </section>\n  );\n}\n`;
  }

  if (category === 'gallery') {
    return `const ITEMS = ['One', 'Two', 'Three', 'Four', 'Five', 'Six'];\n\nexport default function ${componentName}() {\n  return (\n    <section className=\"px-6 py-20\">\n      <div className=\"mx-auto max-w-6xl\">\n        <h2 className=\"text-3xl font-bold text-slate-900\">${title}</h2>\n        <div className=\"mt-8 grid gap-3 sm:grid-cols-2 md:grid-cols-3\">\n          {ITEMS.map((item) => (\n            <div key={item} className=\"aspect-[4/3] rounded-xl border border-slate-200 bg-slate-100\" />\n          ))}\n        </div>\n      </div>\n    </section>\n  );\n}\n`;
  }

  if (category === 'ecommerce') {
    return `const PRODUCTS = [\n  { name: 'Executive Backpack', price: '$129' },\n  { name: 'Desk Organizer', price: '$49' },\n  { name: 'Travel Case', price: '$79' }\n];\n\nexport default function ${componentName}() {\n  return (\n    <section className=\"px-6 py-20\">\n      <div className=\"mx-auto max-w-6xl\">\n        <h2 className=\"text-3xl font-bold text-slate-900\">${title}</h2>\n        <div className=\"mt-8 grid gap-4 md:grid-cols-3\">\n          {PRODUCTS.map((product) => (\n            <article key={product.name} className=\"rounded-xl border border-slate-200 bg-white p-5\">\n              <div className=\"aspect-[4/3] rounded-lg bg-slate-100\" />\n              <h3 className=\"mt-4 text-base font-semibold text-slate-900\">{product.name}</h3>\n              <div className=\"mt-3 flex items-center justify-between\">\n                <span className=\"text-sm text-slate-600\">{product.price}</span>\n                <button className=\"rounded-md bg-${accent}-600 px-3 py-1.5 text-xs font-semibold text-white\">Add</button>\n              </div>\n            </article>\n          ))}\n        </div>\n      </div>\n    </section>\n  );\n}\n`;
  }

  return `export default function ${componentName}() {\n  return (\n    <section className=\"px-6 py-16\">\n      <div className=\"mx-auto max-w-5xl rounded-xl border border-slate-200 bg-white p-6\">\n        <h2 className=\"text-2xl font-bold text-slate-900\">${title}</h2>\n        <p className=\"mt-2 text-sm text-slate-600\">Clean and structured block for enterprise landing pages.</p>\n      </div>\n    </section>\n  );\n}\n`;
}

const toAdd = [];

for (const category of categories) {
  for (let i = 1; i <= 30; i += 1) {
    const id = `corp-${category}-light-${String(i).padStart(2, '0')}`;
    if (existingIds.has(id)) continue;

    const variants = subcategoryByCategory[category] || ['clean-default', 'corp-default', 'light-default'];
    const subcategory = variants[(i - 1) % variants.length];
    const num = String(i).padStart(2, '0');
    const name = `${pascal(category)}LightCorporate${num}`;
    const title = `${pascal(category)} Section ${num}`;

    const component = {
      id,
      name,
      category,
      subcategory,
      tags: {
        industry: corpIndustry[category] || ['saas', 'enterprise', 'b2b'],
        tone: ['clean', 'modern', 'corporate'],
        theme: ['light'],
        premium: i % 3 === 0
      },
      code: {
        framework: 'react',
        styling: 'tailwind',
        snippet: snippetFor(category, name, title, i)
      }
    };

    toAdd.push(component);
    existingIds.add(id);
  }
}

data.components = [...data.components, ...toAdd];
fs.writeFileSync(schemaPath, JSON.stringify(data, null, 2) + '\n', 'utf8');

const counts = {};
for (const c of data.components) {
  const k = String(c.category || 'unknown').toLowerCase();
  counts[k] = (counts[k] || 0) + 1;
}

console.log(JSON.stringify({ added: toAdd.length, total: data.components.length, categories: counts }, null, 2));
