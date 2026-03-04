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
                    <span className="text-4xl font-bold">${price}</span>
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
          © 2026 Acme. All rights reserved.
        </div>
      </div>
    </footer>
  );
}
`,
} as const;

export type SectionTemplateKey = keyof typeof SECTION_TEMPLATES;

