export type TemplateCategory =
  | 'Landing Page'
  | 'Dashboard'
  | 'E-Commerce'
  | 'Portfolio'
  | 'Blog'
  | 'Other';

export interface GalleryTemplate {
  id: string;
  name: string;
  category: TemplateCategory;
  description: string;
  gradient: string;
  prompt: string;
}

export const GALLERY_TEMPLATES: GalleryTemplate[] = [
  {
    id: 'saas-landing',
    name: 'SaaS Landing Page',
    category: 'Landing Page',
    description: 'Modern dark SaaS landing with hero, features, pricing',
    gradient: 'from-purple-900 to-slate-900',
    prompt: 'Create a complete SaaS landing page with dark theme, hero section with gradient background, feature grid with icons, 3-tier pricing cards with monthly/yearly toggle, testimonials, and footer',
  },
  {
    id: 'restaurant',
    name: 'Restaurant Website',
    category: 'Landing Page',
    description: 'Warm restaurant site with menu and reservations',
    gradient: 'from-amber-900 to-stone-900',
    prompt: 'Create a premium restaurant website with warm amber color scheme, hero with food photography placeholder, menu section with categories, about section, reservation form, and footer',
  },
  {
    id: 'analytics-dashboard',
    name: 'Analytics Dashboard',
    category: 'Dashboard',
    description: 'Dark dashboard with charts and KPI cards',
    gradient: 'from-blue-900 to-slate-900',
    prompt: 'Create a dark analytics dashboard with sidebar navigation, 4 KPI stat cards, a line chart using recharts, a data table with pagination, and user profile in navbar',
  },
  {
    id: 'ecommerce',
    name: 'Online Store',
    category: 'E-Commerce',
    description: 'Clean product grid with cart functionality',
    gradient: 'from-emerald-900 to-slate-900',
    prompt: 'Create a clean e-commerce store with product grid of 6 items, working add-to-cart with cart count in navbar, product filters sidebar, and checkout button',
  },
  {
    id: 'portfolio',
    name: 'Developer Portfolio',
    category: 'Portfolio',
    description: 'Minimal dark portfolio with projects',
    gradient: 'from-zinc-900 to-zinc-800',
    prompt: 'Create a minimal dark developer portfolio with large hero, projects grid with 4 case studies, skills section, about section, and contact form',
  },
  {
    id: 'startup',
    name: 'Startup Launch',
    category: 'Landing Page',
    description: 'Bold startup page with waitlist signup',
    gradient: 'from-black to-purple-950',
    prompt: 'Create a bold startup launch page with gradient text headline, email waitlist signup, 3 feature highlights, social proof counter, and minimal footer',
  },
  {
    id: 'fitness',
    name: 'Fitness Studio',
    category: 'Landing Page',
    description: 'High-energy gym site with classes',
    gradient: 'from-orange-900 to-zinc-900',
    prompt: 'Create a high-energy fitness studio website with dark orange theme, hero with bold uppercase headline, class schedule section, trainer profiles, membership pricing, and contact',
  },
  {
    id: 'blog',
    name: 'Blog Platform',
    category: 'Blog',
    description: 'Clean blog with article grid',
    gradient: 'from-slate-800 to-slate-900',
    prompt: 'Create a clean blog platform with featured article hero, article grid with 6 posts showing category, title, excerpt and author, sidebar with categories and popular posts, newsletter signup',
  },
  {
    id: 'wedding',
    name: 'Wedding Website',
    category: 'Landing Page',
    description: 'Elegant wedding site with RSVP',
    gradient: 'from-rose-900 to-pink-900',
    prompt: 'Create an elegant wedding website with soft rose color scheme, hero with couple name and date, our story timeline, venue details with map placeholder, photo gallery grid, and RSVP form',
  },
  {
    id: 'agency',
    name: 'Creative Agency',
    category: 'Landing Page',
    description: 'Bold agency site with case studies',
    gradient: 'from-yellow-900 to-zinc-900',
    prompt: 'Create a bold creative agency website with high-contrast design, large hero with animated text, case studies grid, services section, team grid, client logos, and contact',
  },
  {
    id: 'medical',
    name: 'Medical Clinic',
    category: 'Landing Page',
    description: 'Clean medical site with booking',
    gradient: 'from-blue-900 to-cyan-900',
    prompt: 'Create a clean medical clinic website with calming blue theme, hero with appointment booking CTA, services grid with medical icons, doctor profiles, patient testimonials, and contact with map',
  },
  {
    id: 'realestate',
    name: 'Real Estate',
    category: 'Landing Page',
    description: 'Property listing with search',
    gradient: 'from-slate-800 to-emerald-900',
    prompt: 'Create a real estate website with property search hero, featured listings grid with 6 properties showing price and details, agent profiles, neighborhood guide, and contact form',
  },
];
