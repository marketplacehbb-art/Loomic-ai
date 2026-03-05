export const SECTION_TEMPLATES = {
  HeroWithGradient: `import { Button } from "@/components/ui/button";

export default function HeroWithGradient() {
  return (
    <section className="relative min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 overflow-hidden">
      <div className="absolute inset-0 bg-[url('data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%2260%22 height=%2260%22 viewBox=%220 0 60 60%22%3E%3Cg fill=%22none%22 stroke=%22%2394a3b8%22 stroke-opacity=%220.35%22 stroke-width=%221%22%3E%3Cpath d=%22M0 0H60V60H0z%22/%3E%3Cpath d=%22M0 30H60M30 0V60%22/%3E%3C/g%3E%3C/svg%3E')] opacity-10" />
      <div className="relative z-10 text-center max-w-4xl mx-auto px-6">
        <h1 className="text-5xl md:text-7xl font-bold tracking-tight text-white mb-6">
          Build something <span className="text-purple-400">amazing</span>
        </h1>
        <p className="text-xl text-slate-300 mb-10 max-w-2xl mx-auto">
          Your subtitle goes here. Keep it short and compelling.
        </p>
        <div className="flex gap-4 justify-center flex-wrap">
          <Button className="px-8 py-3 bg-purple-600 hover:bg-purple-700 text-white rounded-xl font-semibold transition-all">
            Get Started
          </Button>
          <Button
            variant="outline"
            className="px-8 py-3 border border-slate-500 hover:border-purple-400 text-slate-300 rounded-xl font-semibold transition-all bg-transparent"
          >
            Learn More
          </Button>
        </div>
      </div>
    </section>
  );
}
`,
  FeatureGrid: `import { Bolt, Layers, Rocket, ShieldCheck, Sparkles, Workflow } from "lucide-react";
import { Card, CardContent, CardDescription, CardTitle } from "@/components/ui/card";

const features = [
  {
    icon: Sparkles,
    title: "Beautiful UI System",
    description: "Ship polished interfaces quickly with reusable patterns and consistent visual rhythm.",
  },
  {
    icon: Bolt,
    title: "High Performance",
    description: "Optimize rendering paths and keep interactions snappy across desktop and mobile.",
  },
  {
    icon: ShieldCheck,
    title: "Secure by Default",
    description: "Strong guardrails and sensible defaults help you avoid common implementation risks.",
  },
  {
    icon: Workflow,
    title: "Smart Automation",
    description: "Automate repetitive workflows so your team can focus on core product outcomes.",
  },
  {
    icon: Layers,
    title: "Composable Architecture",
    description: "Build flexible modules that scale with product complexity and team size.",
  },
  {
    icon: Rocket,
    title: "Fast Delivery",
    description: "Move from concept to production rapidly with clear structure and predictable iteration.",
  },
];

export default function FeatureGrid() {
  return (
    <section className="py-24 bg-slate-900">
      <div className="max-w-6xl mx-auto px-6">
        <div className="text-center mb-14">
          <h2 className="text-4xl md:text-5xl font-bold tracking-tight text-white">Everything you need to build faster</h2>
          <p className="mt-4 text-lg text-slate-300 max-w-2xl mx-auto">
            A curated set of capabilities designed for modern product teams.
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {features.map((feature) => {
            const Icon = feature.icon;
            return (
              <Card
                key={feature.title}
                className="rounded-2xl bg-slate-800/50 border border-slate-700 p-6 hover:border-purple-500 transition-all"
              >
                <CardContent className="p-0">
                  <Icon className="h-6 w-6 text-purple-400 mb-4" />
                  <CardTitle className="text-xl text-white mb-2">{feature.title}</CardTitle>
                  <CardDescription className="text-slate-300">{feature.description}</CardDescription>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </section>
  );
}
`,
  PricingCards: `import { useState } from "react";
import { CheckCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const tiers = [
  {
    name: "Starter",
    monthly: 19,
    yearly: 15,
    description: "Great for individuals validating ideas.",
    features: ["1 project", "Community support", "Basic analytics"],
    cta: "Start Free",
  },
  {
    name: "Pro",
    monthly: 49,
    yearly: 39,
    description: "Built for fast-moving product teams.",
    features: ["Unlimited projects", "Priority support", "Advanced analytics", "Team collaboration"],
    cta: "Choose Pro",
    highlight: true,
  },
  {
    name: "Enterprise",
    monthly: 129,
    yearly: 99,
    description: "Security, governance, and scale.",
    features: ["SSO/SAML", "Dedicated success manager", "Custom contracts", "Audit logs"],
    cta: "Contact Sales",
  },
];

export default function PricingCards() {
  const [billing, setBilling] = useState<"monthly" | "yearly">("monthly");

  return (
    <section className="py-24 bg-slate-950">
      <div className="max-w-6xl mx-auto px-6">
        <div className="text-center mb-10">
          <h2 className="text-4xl md:text-5xl font-bold tracking-tight text-white">Simple pricing that scales</h2>
          <p className="mt-4 text-lg text-slate-300">Choose the plan that fits your stage today.</p>
        </div>

        <div className="flex items-center justify-center gap-3 mb-10">
          <Button
            variant={billing === "monthly" ? "default" : "outline"}
            className={billing === "monthly" ? "bg-purple-600 hover:bg-purple-700" : "border-slate-700 text-slate-300"}
            onClick={() => setBilling("monthly")}
          >
            Monthly
          </Button>
          <Button
            variant={billing === "yearly" ? "default" : "outline"}
            className={billing === "yearly" ? "bg-purple-600 hover:bg-purple-700" : "border-slate-700 text-slate-300"}
            onClick={() => setBilling("yearly")}
          >
            Yearly
          </Button>
          {billing === "yearly" ? <Badge className="bg-emerald-600 text-white">20% discount</Badge> : null}
        </div>

        <div className="grid gap-6 md:grid-cols-3">
          {tiers.map((tier) => {
            const isPro = Boolean(tier.highlight);
            const cardClass = isPro
              ? "border-0 bg-purple-600 text-white scale-105 shadow-2xl shadow-purple-900/30"
              : "bg-slate-900 border border-slate-800 text-slate-100";
            const buttonClass = isPro
              ? "bg-white text-purple-700 hover:bg-slate-100"
              : "bg-purple-600 hover:bg-purple-700 text-white";
            const price = billing === "yearly" ? tier.yearly : tier.monthly;

            return (
              <Card key={tier.name} className={cardClass}>
                <CardHeader>
                  <CardTitle className="text-2xl">{tier.name}</CardTitle>
                  <p className={isPro ? "text-purple-100" : "text-slate-400"}>{tier.description}</p>
                  <div className="flex items-end gap-1 mt-4">
                    <span className="text-4xl font-bold">\${price}</span>
                    <span className={isPro ? "text-purple-100" : "text-slate-400"}>/mo</span>
                  </div>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-3 mb-8">
                    {tier.features.map((feature) => (
                      <li key={feature} className="flex items-center gap-2">
                        <CheckCircle className={isPro ? "h-5 w-5 text-white" : "h-5 w-5 text-emerald-400"} />
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>
                  <Button className={"w-full " + buttonClass}>{tier.cta}</Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </section>
  );
}
`,
  TestimonialsGrid: `import { Star } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

const testimonials = [
  {
    quote: "We shipped our new product page in half the time and conversion improved immediately.",
    name: "Ava Martinez",
    role: "Growth Lead",
    initials: "AM",
  },
  {
    quote: "The component patterns are clean, scalable, and easy for our whole team to maintain.",
    name: "Noah Kim",
    role: "Engineering Manager",
    initials: "NK",
  },
  {
    quote: "Our brand finally feels consistent across every page and every release cycle.",
    name: "Lea Schneider",
    role: "Product Designer",
    initials: "LS",
  },
];

export default function TestimonialsGrid() {
  return (
    <section className="py-24 bg-slate-950">
      <div className="max-w-6xl mx-auto px-6">
        <div className="text-center mb-12">
          <h2 className="text-4xl md:text-5xl font-bold tracking-tight text-white">Loved by modern teams</h2>
          <p className="mt-4 text-lg text-slate-300">See what customers say about their results.</p>
        </div>

        <div className="grid gap-6 md:grid-cols-3">
          {testimonials.map((testimonial) => (
            <Card key={testimonial.name} className="bg-slate-900 border border-slate-800 rounded-2xl">
              <CardContent className="p-6">
                <div className="flex gap-1 mb-4">
                  {Array.from({ length: 5 }).map((_, index) => (
                    <Star key={index} className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                  ))}
                </div>

                <p className="italic text-slate-200 mb-6">"{testimonial.quote}"</p>

                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-purple-600 text-white text-sm font-semibold flex items-center justify-center">
                    {testimonial.initials}
                  </div>
                  <div>
                    <p className="font-semibold text-white">{testimonial.name}</p>
                    <p className="text-sm text-slate-400">{testimonial.role}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}
`,
  FAQAccordion: `import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

const faqItems = [
  {
    question: "How quickly can we launch?",
    answer: "Most teams launch an initial version within days, then iterate weekly with minimal overhead.",
  },
  {
    question: "Can we customize the design system?",
    answer: "Yes, every section is fully customizable with Tailwind utilities and reusable UI primitives.",
  },
  {
    question: "Is this production-ready?",
    answer: "The templates are built for real-world use, including responsive layouts and clean component structure.",
  },
  {
    question: "Do you support team collaboration?",
    answer: "Absolutely. Teams can collaborate on features, styling, and content without disrupting velocity.",
  },
  {
    question: "What integrations are available?",
    answer: "You can connect analytics, auth, database, and deployment tooling through your existing stack.",
  },
  {
    question: "Can we migrate our existing pages?",
    answer: "Yes. Start with one section at a time and progressively migrate to keep risk low.",
  },
];

export default function FAQAccordion() {
  return (
    <section className="py-24 bg-white">
      <div className="max-w-4xl mx-auto px-6">
        <div className="text-center mb-10">
          <h2 className="text-4xl md:text-5xl font-bold tracking-tight text-slate-900">Frequently asked questions</h2>
          <p className="mt-4 text-lg text-slate-600">Everything you need to know before you get started.</p>
        </div>

        <Accordion type="single" collapsible className="w-full space-y-2">
          {faqItems.map((item, index) => (
            <AccordionItem key={item.question} value={"item-" + index} className="rounded-xl border border-slate-200 px-4">
              <AccordionTrigger className="text-left text-slate-900 hover:no-underline">{item.question}</AccordionTrigger>
              <AccordionContent className="text-slate-600">{item.answer}</AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </section>
  );
}
`,
  NavbarSimple: `import { useState } from "react";
import { Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";

const navLinks = ["Features", "Pricing", "Testimonials", "FAQ"];

export default function NavbarSimple() {
  const [open, setOpen] = useState(false);

  return (
    <header className="backdrop-blur-md bg-slate-900/80 sticky top-0 z-50 border-b border-slate-800">
      <nav className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
        <div className="font-bold text-xl text-white">Acme</div>

        <div className="hidden md:flex items-center gap-8">
          {navLinks.map((link) => (
            <a key={link} href="#" className="text-slate-300 hover:text-white transition-colors">
              {link}
            </a>
          ))}
        </div>

        <div className="hidden md:block">
          <Button className="bg-purple-600 hover:bg-purple-700 text-white">Get Started</Button>
        </div>

        <button
          type="button"
          className="md:hidden text-slate-200"
          onClick={() => setOpen((prev) => !prev)}
          aria-label="Toggle navigation"
        >
          {open ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </button>
      </nav>

      {open ? (
        <div className="md:hidden border-t border-slate-800 px-6 py-4 bg-slate-900/95">
          <div className="flex flex-col gap-4">
            {navLinks.map((link) => (
              <a key={link} href="#" className="text-slate-300 hover:text-white transition-colors">
                {link}
              </a>
            ))}
            <Button className="bg-purple-600 hover:bg-purple-700 text-white w-full">Get Started</Button>
          </div>
        </div>
      ) : null}
    </header>
  );
}
`,
  FooterMultiColumn: `import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const productLinks = ["Overview", "Pricing", "Integrations", "Changelog"];
const companyLinks = ["About", "Careers", "Blog", "Contact"];

export default function FooterMultiColumn() {
  return (
    <footer className="bg-slate-950 border-t border-slate-800 text-slate-300">
      <div className="max-w-6xl mx-auto px-6 py-14 grid gap-10 md:grid-cols-2 lg:grid-cols-4">
        <div>
          <h3 className="font-bold text-xl text-white">Acme</h3>
          <p className="mt-3 text-slate-400">Ship polished products faster with consistent section patterns.</p>
        </div>

        <div>
          <h4 className="text-white font-semibold mb-3">Product</h4>
          <ul className="space-y-2">
            {productLinks.map((link) => (
              <li key={link}>
                <a href="#" className="hover:text-white transition-colors">{link}</a>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h4 className="text-white font-semibold mb-3">Company</h4>
          <ul className="space-y-2">
            {companyLinks.map((link) => (
              <li key={link}>
                <a href="#" className="hover:text-white transition-colors">{link}</a>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h4 className="text-white font-semibold mb-3">Newsletter</h4>
          <p className="text-slate-400 mb-3">Get product updates directly in your inbox.</p>
          <div className="flex gap-2">
            <Input
              type="email"
              placeholder="you@company.com"
              className="bg-slate-900 border-slate-700 text-slate-100 placeholder:text-slate-500"
            />
            <Button className="bg-purple-600 hover:bg-purple-700 text-white">Join</Button>
          </div>
        </div>
      </div>

      <div className="border-t border-slate-800">
        <div className="max-w-6xl mx-auto px-6 py-4 text-sm text-slate-500">
          (c) 2026 Acme. All rights reserved.
        </div>
      </div>
    </footer>
  );
}
`,
  HeroWithVideo: `import { PlayCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const trust = ["Trusted by 500+ teams", "SOC2 Ready", "99.99% uptime"];

export default function HeroWithVideo() {
  return (
    <section className="relative overflow-hidden bg-slate-950 py-24 md:py-32">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(168,85,247,0.25),transparent_45%),radial-gradient(circle_at_80%_80%,rgba(59,130,246,0.2),transparent_45%)]" />
      <div className="relative mx-auto grid max-w-7xl gap-12 px-6 lg:grid-cols-2 lg:items-center">
        <div>
          <p className="mb-4 text-sm font-semibold uppercase tracking-[0.2em] text-purple-300">Launch Faster</p>
          <h1 className="mb-6 text-5xl font-bold leading-tight tracking-tight text-white md:text-6xl">
            Create
            <span className="ml-3 bg-gradient-to-r from-purple-300 via-fuchsia-200 to-indigo-300 bg-clip-text text-transparent">
              cinematic product pages
            </span>
          </h1>
          <p className="mb-8 max-w-xl text-lg text-slate-300">
            Blend polished sections, strong copy, and conversion-first UX in one workflow.
          </p>
          <div className="mb-8 flex flex-wrap gap-3">
            <Button className="bg-purple-600 text-white hover:bg-purple-700">Start Building</Button>
            <Button variant="outline" className="border-slate-600 bg-transparent text-slate-200 hover:border-purple-400">
              Watch Demo
            </Button>
          </div>
          <div className="flex flex-wrap gap-2">
            {trust.map((item) => (
              <Badge key={item} variant="secondary" className="border border-slate-700 bg-slate-900/70 text-slate-200">
                {item}
              </Badge>
            ))}
          </div>
        </div>

        <div className="rounded-3xl border border-slate-700/80 bg-slate-900/80 p-4 shadow-2xl shadow-purple-900/20">
          <div className="relative aspect-video overflow-hidden rounded-2xl bg-gradient-to-br from-slate-800 to-slate-950">
            <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(148,163,184,0.08)_1px,transparent_1px),linear-gradient(to_bottom,rgba(148,163,184,0.08)_1px,transparent_1px)] bg-[size:32px_32px]" />
            <button
              type="button"
              className="absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center gap-2 rounded-full border border-purple-400/50 bg-purple-500/20 px-5 py-3 text-sm font-semibold text-white backdrop-blur"
            >
              <PlayCircle className="h-5 w-5" />
              Play Preview
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
`,
  HeroMinimal: `import { Button } from "@/components/ui/button";

export default function HeroMinimal() {
  return (
    <section className="bg-white px-6 py-28 md:py-36">
      <div className="mx-auto max-w-4xl animate-fade text-center">
        <h1 className="mb-6 text-6xl font-bold tracking-tight text-slate-900 md:text-7xl">
          Build your next product page in minutes.
        </h1>
        <p className="mx-auto mb-8 max-w-2xl text-lg text-slate-600">
          A minimal, conversion-first foundation for teams who want speed without sacrificing quality.
        </p>
        <div className="flex flex-col items-center gap-3">
          <Button className="bg-purple-600 px-8 text-white hover:bg-purple-700">Get Started</Button>
          <p className="text-sm text-slate-500">No credit card required</p>
        </div>
      </div>
    </section>
  );
}
`,
  LogoCloud: `const logos = ["Nova", "Pulse", "ArcLabs", "Northstar", "Vertex", "Helio"];

export default function LogoCloud() {
  return (
    <section className="bg-white py-16">
      <div className="mx-auto max-w-6xl px-6 text-center">
        <p className="mb-8 text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">
          Trusted by teams at...
        </p>
        <div className="grid grid-cols-2 gap-6 md:grid-cols-3 lg:grid-cols-6">
          {logos.map((logo) => (
            <div
              key={logo}
              className="rounded-xl border border-slate-200 bg-slate-50 py-4 text-lg font-semibold text-slate-400 grayscale transition-all hover:grayscale-0 hover:text-slate-700"
            >
              {logo}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
`,
  StatsRow: `const stats = [
  { value: "12k+", label: "Active users" },
  { value: "99.9%", label: "Uptime SLA" },
  { value: "4.9/5", label: "Customer rating" },
  { value: "37%", label: "Avg. conversion lift" },
];

export default function StatsRow() {
  return (
    <section className="bg-slate-950 py-14">
      <div className="mx-auto grid max-w-6xl gap-6 px-6 md:grid-cols-4 md:gap-0">
        {stats.map((stat, index) => (
          <div
            key={stat.label}
            className={"px-4 text-center " + (index === 0 ? "" : "md:border-l md:border-slate-800")}
          >
            <p className="text-5xl font-bold text-purple-400">{stat.value}</p>
            <p className="mt-2 text-sm uppercase tracking-[0.14em] text-slate-400">{stat.label}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
`,
  FeatureAlternating: `import { ArrowRight, Layers, ShieldCheck, Sparkles } from "lucide-react";

const rows = [
  {
    icon: Sparkles,
    title: "Premium visual system",
    description: "Use polished sections with consistent spacing, color rhythm, and strong visual hierarchy.",
    link: "Explore styles",
  },
  {
    icon: Layers,
    title: "Composable architecture",
    description: "Build with modular blocks you can reorder and adapt across landing pages and campaigns.",
    link: "View components",
  },
  {
    icon: ShieldCheck,
    title: "Launch with confidence",
    description: "Ship responsive, production-oriented code that stays maintainable as requirements evolve.",
    link: "Read best practices",
  },
];

export default function FeatureAlternating() {
  return (
    <section className="relative bg-slate-950 py-24">
      <div className="absolute left-1/2 top-32 hidden h-[70%] w-px -translate-x-1/2 bg-gradient-to-b from-purple-500/80 via-slate-700 to-transparent lg:block" />
      <div className="mx-auto max-w-6xl space-y-12 px-6">
        {rows.map((row, index) => {
          const Icon = row.icon;
          const reverse = index % 2 === 1;
          return (
            <div key={row.title} className={"grid items-center gap-8 lg:grid-cols-2 " + (reverse ? "lg:[&>*:first-child]:order-2" : "")}>
              <div className="relative overflow-hidden rounded-3xl border border-slate-800 bg-gradient-to-br from-slate-900 to-slate-800 p-8">
                <div className="absolute right-4 top-4 h-3 w-3 rounded-full bg-purple-400" />
                <div className="aspect-[4/3] rounded-2xl bg-[radial-gradient(circle_at_30%_20%,rgba(168,85,247,0.25),transparent_45%),linear-gradient(160deg,#1e293b,#0f172a)]" />
              </div>
              <div className="rounded-3xl border border-slate-800 bg-slate-900/80 p-8">
                <Icon className="mb-4 h-6 w-6 text-purple-400" />
                <h3 className="mb-3 text-3xl font-semibold text-white">{row.title}</h3>
                <p className="mb-5 text-slate-300">{row.description}</p>
                <a href="#" className="inline-flex items-center gap-2 font-medium text-purple-300 hover:text-purple-200">
                  {row.link}
                  <ArrowRight className="h-4 w-4" />
                </a>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
`,
  HowItWorks: `import { Rocket, ScanSearch, WandSparkles } from "lucide-react";

const steps = [
  {
    number: "01",
    icon: ScanSearch,
    title: "Analyze your request",
    description: "We parse intent, component needs, and design direction in seconds.",
  },
  {
    number: "02",
    icon: WandSparkles,
    title: "Generate structured sections",
    description: "High-quality components are produced with reusable patterns and clean markup.",
  },
  {
    number: "03",
    icon: Rocket,
    title: "Ship and iterate",
    description: "Deploy quickly, gather feedback, and refine with focused updates.",
  },
];

export default function HowItWorks() {
  return (
    <section className="bg-white py-24">
      <div className="mx-auto max-w-6xl px-6">
        <div className="mb-12 text-center">
          <h2 className="text-4xl font-bold tracking-tight text-slate-900 md:text-5xl">How it works</h2>
          <p className="mt-4 text-lg text-slate-600">A simple three-step workflow from idea to production.</p>
        </div>
        <div className="relative grid gap-6 md:grid-cols-3">
          <div className="absolute left-0 right-0 top-14 hidden border-t-2 border-dotted border-slate-300 md:block" />
          {steps.map((step) => {
            const Icon = step.icon;
            return (
              <div key={step.number} className="relative rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <p className="mb-3 text-4xl font-bold text-slate-200">{step.number}</p>
                <Icon className="mb-4 h-6 w-6 text-purple-500" />
                <h3 className="mb-2 text-xl font-semibold text-slate-900">{step.title}</h3>
                <p className="text-slate-600">{step.description}</p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
`,
  CTABanner: `import { Button } from "@/components/ui/button";

export default function CTABanner() {
  return (
    <section className="bg-slate-950 px-6 py-16">
      <div className="mx-auto max-w-6xl rounded-3xl bg-gradient-to-r from-purple-500 via-fuchsia-500 to-indigo-500 p-[1px]">
        <div className="relative overflow-hidden rounded-3xl bg-slate-950 px-8 py-12 text-center md:px-12">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_20%,rgba(168,85,247,0.25),transparent_55%)]" />
          <div className="relative">
            <h3 className="text-3xl font-bold tracking-tight text-white md:text-4xl">Ready to build something unforgettable?</h3>
            <p className="mx-auto mt-4 max-w-2xl text-slate-300">
              Start with a polished foundation and customize every section for your brand.
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <Button className="bg-purple-600 text-white hover:bg-purple-700">Start Free</Button>
              <Button variant="outline" className="border-slate-600 bg-transparent text-slate-200 hover:border-purple-400">
                Book Demo
              </Button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
`,
  CTASimple: `import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function CTASimple() {
  return (
    <section className="bg-white py-20">
      <div className="mx-auto max-w-3xl px-6 text-center">
        <h3 className="text-4xl font-bold tracking-tight text-slate-900">Get launch-ready updates every week.</h3>
        <p className="mt-4 text-slate-600">One focused email with design patterns, growth ideas, and implementation tips.</p>
        <form className="mx-auto mt-8 flex max-w-xl flex-col gap-3 sm:flex-row">
          <Input type="email" placeholder="you@company.com" className="h-11 border-slate-300" />
          <Button type="submit" className="h-11 bg-purple-600 px-6 text-white hover:bg-purple-700">Subscribe</Button>
        </form>
        <p className="mt-3 text-sm text-slate-500">Join 2,000+ builders already using this</p>
      </div>
    </section>
  );
}
`,
  BentoGrid: `import { Bolt, Compass, Layers, ShieldCheck, Sparkles } from "lucide-react";

const cards = [
  { icon: Sparkles, title: "Design intelligence", text: "Visual direction tuned for modern SaaS launches.", span: "md:col-span-2 md:row-span-2" },
  { icon: Bolt, title: "Fast execution", text: "Generate clean sections in one pass.", span: "" },
  { icon: Layers, title: "Composable blocks", text: "Mix and match layouts with ease.", span: "" },
  { icon: ShieldCheck, title: "Stable output", text: "Structured generation with validation loops.", span: "" },
  { icon: Compass, title: "Brand alignment", text: "Keep voice and style consistent everywhere.", span: "" },
];

export default function BentoGrid() {
  return (
    <section className="bg-slate-950 py-24">
      <div className="mx-auto max-w-6xl px-6">
        <div className="mb-10 text-center">
          <h2 className="text-4xl font-bold tracking-tight text-white md:text-5xl">Everything in one powerful grid</h2>
        </div>
        <div className="grid auto-rows-[180px] gap-4 md:grid-cols-3">
          {cards.map((card) => {
            const Icon = card.icon;
            return (
              <article key={card.title} className={"rounded-2xl border border-purple-500/30 bg-slate-900 p-6 " + card.span}>
                <Icon className="mb-4 h-6 w-6 text-purple-400" />
                <h3 className="mb-2 text-xl font-semibold text-white">{card.title}</h3>
                <p className="text-slate-300">{card.text}</p>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
`,
  TimelineSection: `const milestones = [
  { date: "2022", title: "Company founded", description: "Started with one mission: make product execution radically faster." },
  { date: "2023", title: "First 1,000 users", description: "Early adopters validated a strong need for structured generation workflows." },
  { date: "2024", title: "Enterprise rollout", description: "Added advanced collaboration, quality gates, and deployment tooling." },
  { date: "2025", title: "Global scale", description: "Expanded to teams across 30+ countries and multiple product categories." },
];

export default function TimelineSection() {
  return (
    <section className="bg-white py-24">
      <div className="mx-auto max-w-5xl px-6">
        <div className="mb-12 text-center">
          <h2 className="text-4xl font-bold tracking-tight text-slate-900 md:text-5xl">Our timeline</h2>
        </div>
        <div className="relative">
          <div className="absolute left-4 top-0 h-full w-px bg-slate-200 md:left-1/2 md:-translate-x-1/2" />
          <div className="space-y-10">
            {milestones.map((item, index) => (
              <div key={item.date} className={"relative md:grid md:grid-cols-2 md:gap-10 " + (index % 2 === 1 ? "md:[&>*:first-child]:order-2" : "")}>
                <div className="relative rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                  <span className="mb-2 inline-block text-sm font-semibold uppercase tracking-[0.16em] text-purple-600">{item.date}</span>
                  <h3 className="mb-2 text-2xl font-semibold text-slate-900">{item.title}</h3>
                  <p className="text-slate-600">{item.description}</p>
                </div>
                <div className="hidden md:block" />
                <span className="absolute left-4 top-8 h-3 w-3 -translate-x-1/2 rounded-full bg-purple-500 ring-4 ring-purple-100 md:left-1/2" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
`,
  ProductGrid: `import { ShoppingCart } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

const products = [
  { name: "Nebula Hoodie", price: "$79", badge: "New" },
  { name: "Orbit Sneakers", price: "$129", badge: "Sale" },
  { name: "Pulse Backpack", price: "$99", badge: "New" },
  { name: "Mono Tee", price: "$39", badge: "Sale" },
  { name: "Aero Bottle", price: "$29", badge: "New" },
  { name: "Signal Cap", price: "$25", badge: "Sale" },
];

export default function ProductGrid() {
  return (
    <section className="bg-white py-24">
      <div className="mx-auto max-w-6xl px-6">
        <div className="mb-10">
          <h2 className="text-4xl font-bold tracking-tight text-slate-900">Featured products</h2>
        </div>
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {products.map((product) => (
            <Card key={product.name} className="overflow-hidden rounded-2xl border border-slate-200 transition-all hover:-translate-y-1 hover:scale-[1.01] hover:shadow-xl">
              <div className="relative aspect-[4/3] bg-gradient-to-br from-slate-100 via-slate-200 to-slate-100">
                <Badge className={"absolute left-3 top-3 " + (product.badge === "Sale" ? "bg-rose-500" : "bg-purple-600")}>
                  {product.badge}
                </Badge>
              </div>
              <CardContent className="p-5">
                <div className="mb-4 flex items-center justify-between">
                  <h3 className="font-semibold text-slate-900">{product.name}</h3>
                  <p className="font-bold text-slate-900">{product.price}</p>
                </div>
                <Button className="w-full bg-slate-900 text-white hover:bg-slate-800">
                  <ShoppingCart className="mr-2 h-4 w-4" />
                  Add to Cart
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}
`,
  ProductHero: `import { Check, Heart, ShieldCheck, Star, Truck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const sizes = ["XS", "S", "M", "L", "XL"];

export default function ProductHero() {
  return (
    <section className="bg-white py-20">
      <div className="mx-auto grid max-w-6xl gap-10 px-6 lg:grid-cols-2">
        <div className="overflow-hidden rounded-3xl border border-slate-200 bg-gradient-to-br from-slate-100 via-slate-200 to-slate-100" />
        <div>
          <Badge className="mb-4 bg-purple-600">New Drop</Badge>
          <h1 className="mb-2 text-4xl font-bold tracking-tight text-slate-900">Orbit Performance Jacket</h1>
          <p className="mb-4 text-2xl font-semibold text-slate-900">$149</p>
          <div className="mb-6 flex items-center gap-1">
            {Array.from({ length: 5 }).map((_, index) => (
              <Star key={index} className="h-4 w-4 fill-amber-400 text-amber-400" />
            ))}
            <span className="ml-2 text-sm text-slate-500">(128 reviews)</span>
          </div>
          <p className="mb-6 text-slate-600">
            Lightweight shell with thermal lining, engineered for daily wear and all-weather comfort.
          </p>
          <div className="mb-6 flex flex-wrap gap-2">
            {sizes.map((size) => (
              <button key={size} type="button" className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:border-purple-400">
                {size}
              </button>
            ))}
          </div>
          <div className="mb-8 flex flex-wrap gap-3">
            <Button className="bg-purple-600 text-white hover:bg-purple-700">Add to Cart</Button>
            <Button variant="outline" className="border-slate-300">
              <Heart className="mr-2 h-4 w-4" />
              Wishlist
            </Button>
          </div>
          <div className="grid gap-2 text-sm text-slate-600">
            <p className="flex items-center gap-2"><Truck className="h-4 w-4 text-emerald-500" /> Free shipping over $60</p>
            <p className="flex items-center gap-2"><Check className="h-4 w-4 text-emerald-500" /> Easy 30-day returns</p>
            <p className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-emerald-500" /> Secure checkout</p>
          </div>
        </div>
      </div>
    </section>
  );
}
`,
  CartSidebar: `import { Minus, Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";

const items = [
  { id: "1", name: "Nebula Hoodie", price: 79, qty: 1 },
  { id: "2", name: "Signal Cap", price: 25, qty: 2 },
];

export default function CartSidebar() {
  const subtotal = items.reduce((sum, item) => sum + item.price * item.qty, 0);

  return (
    <aside className="fixed right-0 top-0 z-50 h-full w-full max-w-md translate-x-0 border-l border-slate-700 bg-slate-900 text-slate-100 shadow-2xl">
      <div className="flex items-center justify-between border-b border-slate-700 px-5 py-4">
        <h3 className="text-lg font-semibold">Your cart</h3>
        <button type="button" className="rounded-md p-1 text-slate-300 hover:bg-slate-800"><X className="h-5 w-5" /></button>
      </div>
      <div className="space-y-4 p-5">
        {items.map((item) => (
          <div key={item.id} className="rounded-xl border border-slate-700 bg-slate-800/60 p-4">
            <div className="mb-3 flex items-start justify-between">
              <div>
                <p className="font-medium text-white">{item.name}</p>
                <p className="text-sm text-slate-400">$ {item.price}</p>
              </div>
              <button type="button" className="text-slate-400 hover:text-rose-400"><Trash2 className="h-4 w-4" /></button>
            </div>
            <div className="flex items-center gap-2">
              <button type="button" className="rounded-md border border-slate-600 p-1"><Minus className="h-4 w-4" /></button>
              <span className="w-8 text-center">{item.qty}</span>
              <button type="button" className="rounded-md border border-slate-600 p-1"><Plus className="h-4 w-4" /></button>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-auto border-t border-slate-700 p-5">
        <div className="mb-4 flex items-center justify-between text-sm text-slate-300">
          <span>Subtotal</span>
          <strong className="text-white">$ {subtotal}</strong>
        </div>
        <Button className="w-full bg-purple-600 text-white hover:bg-purple-700">Checkout</Button>
      </div>
    </aside>
  );
}
`,
  DashboardLayout: `import { Bell, CreditCard, Home, Layers, Search, Settings, Users } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";

const nav = [
  { icon: Home, label: "Overview" },
  { icon: Layers, label: "Projects" },
  { icon: Users, label: "Team" },
  { icon: CreditCard, label: "Billing" },
  { icon: Settings, label: "Settings" },
];

export default function DashboardLayout() {
  return (
    <div className="min-h-screen bg-slate-100">
      <div className="grid min-h-screen lg:grid-cols-[260px_1fr]">
        <aside className="flex flex-col border-r border-slate-200 bg-slate-950 p-5 text-slate-200">
          <div className="mb-8 text-xl font-bold text-white">Acme Panel</div>
          <nav className="space-y-2">
            {nav.map((item) => {
              const Icon = item.icon;
              return (
                <a key={item.label} href="#" className="flex items-center gap-3 rounded-lg px-3 py-2 text-slate-300 transition-colors hover:bg-slate-800 hover:text-white">
                  <Icon className="h-4 w-4" />
                  {item.label}
                </a>
              );
            })}
          </nav>
          <div className="mt-auto flex items-center gap-3 rounded-lg border border-slate-800 bg-slate-900 p-3">
            <Avatar><AvatarFallback>AK</AvatarFallback></Avatar>
            <div>
              <p className="text-sm font-medium text-white">Anna Klein</p>
              <p className="text-xs text-slate-400">Product Lead</p>
            </div>
          </div>
        </aside>

        <main className="p-6">
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
            <div className="relative w-full max-w-sm">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input className="pl-9" placeholder="Search..." />
            </div>
            <button type="button" className="rounded-lg border border-slate-200 bg-white p-2 text-slate-600 hover:text-slate-900">
              <Bell className="h-5 w-5" />
            </button>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
            <h1 className="text-3xl font-bold tracking-tight text-slate-900">Dashboard overview</h1>
            <p className="mt-2 text-slate-600">Use this layout as a base for analytics, tables, and workspace views.</p>
          </div>
        </main>
      </div>
    </div>
  );
}
`,
  StatsCards: `import { ArrowDownRight, ArrowUpRight, DollarSign, ShoppingBag, Users, Zap } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

const metrics = [
  { icon: DollarSign, label: "Revenue", value: "$128k", change: "+12.4%", up: true },
  { icon: Users, label: "New users", value: "4,920", change: "+8.1%", up: true },
  { icon: ShoppingBag, label: "Orders", value: "1,284", change: "-2.3%", up: false },
  { icon: Zap, label: "Activation", value: "64%", change: "+5.6%", up: true },
];

export default function StatsCards() {
  return (
    <section className="py-6">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {metrics.map((metric) => {
          const Icon = metric.icon;
          const Trend = metric.up ? ArrowUpRight : ArrowDownRight;
          return (
            <Card key={metric.label} className="border border-slate-200 bg-white shadow-sm">
              <CardContent className="p-5">
                <div className="mb-4 flex items-center justify-between">
                  <Icon className="h-5 w-5 text-purple-500" />
                  <span className={"inline-flex items-center gap-1 text-xs font-semibold " + (metric.up ? "text-emerald-600" : "text-rose-600")}>
                    <Trend className="h-3.5 w-3.5" />
                    {metric.change}
                  </span>
                </div>
                <p className="text-sm text-slate-500">{metric.label}</p>
                <p className="mt-1 text-3xl font-bold text-slate-900">{metric.value}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </section>
  );
}
`,
  DataTable: `import { useMemo, useState } from "react";
import { ArrowUpDown, ChevronLeft, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const rows = [
  { id: "USR-1024", name: "Anna Klein", plan: "Pro", usage: "82%", status: "Active" },
  { id: "USR-1025", name: "Noah Weber", plan: "Starter", usage: "34%", status: "Inactive" },
  { id: "USR-1026", name: "Lea Fischer", plan: "Enterprise", usage: "91%", status: "Active" },
  { id: "USR-1027", name: "Mira Koch", plan: "Pro", usage: "67%", status: "Active" },
  { id: "USR-1028", name: "Jonas Maier", plan: "Starter", usage: "20%", status: "Inactive" },
  { id: "USR-1029", name: "Timo Lang", plan: "Pro", usage: "73%", status: "Active" },
];

export default function DataTable() {
  const [search, setSearch] = useState("");
  const [sortAsc, setSortAsc] = useState(true);
  const [page, setPage] = useState(1);
  const pageSize = 4;

  const filtered = useMemo(() => {
    const term = search.toLowerCase();
    const sorted = [...rows]
      .filter((row) => row.name.toLowerCase().includes(term) || row.id.toLowerCase().includes(term))
      .sort((a, b) => (sortAsc ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name)));
    return sorted;
  }, [search, sortAsc]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const current = filtered.slice((page - 1) * pageSize, page * pageSize);

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Input
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setPage(1);
          }}
          placeholder="Search users..."
          className="max-w-xs"
        />
        <Button variant="outline" onClick={() => setSortAsc((prev) => !prev)}>
          <ArrowUpDown className="mr-2 h-4 w-4" />
          Sort by Name
        </Button>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>ID</TableHead>
            <TableHead>Name</TableHead>
            <TableHead>Plan</TableHead>
            <TableHead>Usage</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {current.map((row) => (
            <TableRow key={row.id} className="transition-colors hover:bg-slate-50">
              <TableCell>{row.id}</TableCell>
              <TableCell>{row.name}</TableCell>
              <TableCell>{row.plan}</TableCell>
              <TableCell>{row.usage}</TableCell>
              <TableCell>
                <Badge className={row.status === "Active" ? "bg-emerald-600" : "bg-slate-500"}>{row.status}</Badge>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <div className="mt-4 flex items-center justify-end gap-2">
        <Button variant="outline" size="icon" disabled={page === 1} onClick={() => setPage((prev) => Math.max(1, prev - 1))}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="text-sm text-slate-500">Page {page} of {totalPages}</span>
        <Button variant="outline" size="icon" disabled={page === totalPages} onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </section>
  );
}
`,
  ChartCard: `import { useState } from "react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const data = [
  { day: "Mon", value: 24 },
  { day: "Tue", value: 32 },
  { day: "Wed", value: 28 },
  { day: "Thu", value: 40 },
  { day: "Fri", value: 52 },
  { day: "Sat", value: 46 },
  { day: "Sun", value: 58 },
];

export default function ChartCard() {
  const [range, setRange] = useState("7d");

  return (
    <Card className="border border-slate-200 bg-white shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-lg font-semibold">Growth trend</CardTitle>
        <div className="flex gap-2">
          {["7d", "30d", "90d"].map((value) => (
            <Button
              key={value}
              variant={range === value ? "default" : "outline"}
              size="sm"
              className={range === value ? "bg-purple-600 hover:bg-purple-700" : ""}
              onClick={() => setRange(value)}
            >
              {value}
            </Button>
          ))}
        </div>
      </CardHeader>
      <CardContent className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data}>
            <defs>
              <linearGradient id="purpleArea" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#a855f7" stopOpacity={0.55} />
                <stop offset="100%" stopColor="#a855f7" stopOpacity={0.05} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="day" />
            <YAxis />
            <Tooltip />
            <Area type="monotone" dataKey="value" stroke="#9333ea" fill="url(#purpleArea)" strokeWidth={2} />
          </AreaChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
`,
  LoginPage: `import { Chrome } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";

export default function LoginPage() {
  return (
    <section className="flex min-h-screen items-center justify-center bg-slate-950 px-6 py-10">
      <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-8 shadow-xl">
        <h1 className="mb-1 text-2xl font-bold text-white">Welcome back</h1>
        <p className="mb-6 text-slate-400">Sign in to continue.</p>
        <form className="space-y-4">
          <Input type="email" placeholder="Email" className="border-slate-700 bg-slate-950 text-slate-100" />
          <Input type="password" placeholder="Password" className="border-slate-700 bg-slate-950 text-slate-100" />
          <Button className="w-full bg-purple-600 text-white hover:bg-purple-700">Sign in</Button>
        </form>
        <div className="my-5 flex items-center gap-3">
          <Separator className="bg-slate-700" />
          <span className="text-xs uppercase tracking-[0.16em] text-slate-500">or</span>
          <Separator className="bg-slate-700" />
        </div>
        <Button variant="outline" className="w-full border-slate-700 bg-transparent text-slate-100">
          <Chrome className="mr-2 h-4 w-4" />
          Continue with Google
        </Button>
        <p className="mt-5 text-center text-sm text-slate-400">
          No account yet? <a href="#" className="font-medium text-purple-300 hover:text-purple-200">Create one</a>
        </p>
      </div>
    </section>
  );
}
`,
  RegisterPage: `import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";

export default function RegisterPage() {
  return (
    <section className="flex min-h-screen items-center justify-center bg-slate-950 px-6 py-10">
      <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-8 shadow-xl">
        <h1 className="mb-1 text-2xl font-bold text-white">Create account</h1>
        <p className="mb-6 text-slate-400">Start building in minutes.</p>
        <form className="space-y-4">
          <Input placeholder="Full name" className="border-slate-700 bg-slate-950 text-slate-100" />
          <Input type="email" placeholder="Email" className="border-slate-700 bg-slate-950 text-slate-100" />
          <Input type="password" placeholder="Password" className="border-slate-700 bg-slate-950 text-slate-100" />
          <Input type="password" placeholder="Confirm password" className="border-slate-700 bg-slate-950 text-slate-100" />
          <label className="flex items-start gap-2 text-sm text-slate-400">
            <Checkbox className="mt-0.5 border-slate-600" />
            I agree to the terms and privacy policy.
          </label>
          <Button className="w-full bg-purple-600 text-white hover:bg-purple-700">Create account</Button>
        </form>
      </div>
    </section>
  );
}
`,
  BlogGrid: `import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

const posts = [
  { category: "Growth", title: "7 launch playbooks that convert", excerpt: "Proven positioning and copy patterns for your next release.", author: "A. Klein", date: "Mar 02, 2026" },
  { category: "Design", title: "Bento layouts that feel premium", excerpt: "How to use asymmetry without breaking clarity.", author: "L. Fischer", date: "Feb 18, 2026" },
  { category: "Product", title: "When to simplify your onboarding", excerpt: "Reduce friction and increase trial activation.", author: "N. Weber", date: "Feb 10, 2026" },
  { category: "Engineering", title: "Structure prompts for reliable code", excerpt: "A practical method for predictable multi-file output.", author: "M. Koch", date: "Jan 28, 2026" },
  { category: "Analytics", title: "Metrics that matter in week one", excerpt: "Track signals that predict long-term retention.", author: "T. Lang", date: "Jan 19, 2026" },
  { category: "Ops", title: "Quality gates without slowdowns", excerpt: "Guardrails that keep velocity high.", author: "S. Roth", date: "Jan 05, 2026" },
];

export default function BlogGrid() {
  return (
    <section className="bg-white py-24">
      <div className="mx-auto max-w-6xl px-6">
        <div className="mb-10">
          <h2 className="text-4xl font-bold tracking-tight text-slate-900">Latest insights</h2>
        </div>
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {posts.map((post) => (
            <Card key={post.title} className="rounded-2xl border border-slate-200 transition-colors hover:border-purple-400">
              <CardContent className="p-6">
                <Badge variant="secondary" className="mb-3">{post.category}</Badge>
                <h3 className="mb-3 text-xl font-semibold text-slate-900">{post.title}</h3>
                <p className="mb-5 text-slate-600">{post.excerpt}</p>
                <p className="text-sm text-slate-500">{post.author} · {post.date}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}
`,
  BlogHero: `import { Badge } from "@/components/ui/badge";

export default function BlogHero() {
  return (
    <section className="bg-white py-16">
      <div className="mx-auto max-w-6xl px-6">
        <article className="overflow-hidden rounded-3xl border border-slate-200 shadow-sm">
          <div className="aspect-[16/7] bg-gradient-to-br from-slate-200 via-slate-300 to-slate-200" />
          <div className="p-8">
            <Badge className="mb-4 bg-purple-600">Featured article</Badge>
            <h1 className="mb-3 text-4xl font-bold tracking-tight text-slate-900">How elite teams build landing pages that convert</h1>
            <p className="text-slate-600">Read time: 8 min · Updated Mar 2026</p>
          </div>
        </article>
      </div>
    </section>
  );
}
`,
  TeamGrid: `import { Linkedin, Twitter } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

const team = [
  { name: "Anna Klein", role: "CEO", initials: "AK" },
  { name: "Noah Weber", role: "CTO", initials: "NW" },
  { name: "Lea Fischer", role: "Design Lead", initials: "LF" },
  { name: "Mira Koch", role: "Product", initials: "MK" },
  { name: "Timo Lang", role: "Engineering", initials: "TL" },
  { name: "Sara Roth", role: "Growth", initials: "SR" },
];

export default function TeamGrid() {
  return (
    <section className="bg-white py-24">
      <div className="mx-auto max-w-6xl px-6">
        <div className="mb-10 text-center">
          <h2 className="text-4xl font-bold tracking-tight text-slate-900">Meet the team</h2>
        </div>
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {team.map((member) => (
            <Card key={member.name} className="rounded-2xl border border-slate-200">
              <CardContent className="p-6 text-center">
                <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-purple-100 font-semibold text-purple-700">
                  {member.initials}
                </div>
                <h3 className="text-xl font-semibold text-slate-900">{member.name}</h3>
                <p className="mb-4 text-slate-600">{member.role}</p>
                <div className="flex justify-center gap-3 text-slate-500">
                  <a href="#" className="rounded-md p-2 hover:bg-slate-100"><Twitter className="h-4 w-4" /></a>
                  <a href="#" className="rounded-md p-2 hover:bg-slate-100"><Linkedin className="h-4 w-4" /></a>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}
`,
  ContactSection: `import { Mail, MapPin, Phone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export default function ContactSection() {
  return (
    <section className="bg-slate-950 py-24">
      <div className="mx-auto grid max-w-6xl gap-8 px-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-8 text-slate-200">
          <h2 className="mb-4 text-3xl font-bold text-white">Let's talk</h2>
          <p className="mb-8 text-slate-400">Tell us about your project and we will get back within one business day.</p>
          <div className="space-y-4 text-sm">
            <p className="flex items-center gap-3"><MapPin className="h-4 w-4 text-purple-400" /> 14 Product Lane, Berlin</p>
            <p className="flex items-center gap-3"><Mail className="h-4 w-4 text-purple-400" /> hello@acme.dev</p>
            <p className="flex items-center gap-3"><Phone className="h-4 w-4 text-purple-400" /> +49 30 1234 5678</p>
          </div>
        </div>
        <form className="rounded-2xl border border-slate-800 bg-slate-900 p-8">
          <div className="grid gap-4">
            <Input placeholder="Your name" className="border-slate-700 bg-slate-950 text-slate-100" />
            <Input type="email" placeholder="Email address" className="border-slate-700 bg-slate-950 text-slate-100" />
            <Textarea placeholder="Your message" className="min-h-32 border-slate-700 bg-slate-950 text-slate-100" />
            <Button className="bg-purple-600 text-white hover:bg-purple-700">Send message</Button>
          </div>
        </form>
      </div>
    </section>
  );
}
`,
  CookieBanner: `import { useState } from "react";
import { Button } from "@/components/ui/button";

export default function CookieBanner() {
  const [visible, setVisible] = useState(true);
  if (!visible) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 z-50 mx-auto max-w-4xl rounded-2xl border border-slate-700 bg-slate-900 p-4 text-slate-200 shadow-2xl">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-slate-300">
          We use cookies to improve performance, personalize content, and analyze traffic.
        </p>
        <div className="flex gap-2">
          <Button variant="outline" className="border-slate-600 bg-transparent text-slate-200" onClick={() => setVisible(false)}>
            Decline
          </Button>
          <Button className="bg-purple-600 text-white hover:bg-purple-700" onClick={() => setVisible(false)}>
            Accept
          </Button>
        </div>
      </div>
    </div>
  );
}
`,
  NotFoundPage: `import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function NotFoundPage() {
  return (
    <section className="flex min-h-screen items-center justify-center bg-slate-950 px-6">
      <div className="text-center">
        <p className="mb-4 bg-gradient-to-r from-purple-400 via-fuchsia-300 to-indigo-300 bg-clip-text text-8xl font-black tracking-tight text-transparent md:text-9xl">
          404
        </p>
        <h1 className="mb-3 text-3xl font-bold text-white">Page not found</h1>
        <p className="mb-8 text-slate-400">The page you requested does not exist or has been moved.</p>
        <Button className="bg-purple-600 text-white hover:bg-purple-700">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Home
        </Button>
      </div>
    </section>
  );
}
`,
} as const;

export type SectionTemplateKey = keyof typeof SECTION_TEMPLATES;
