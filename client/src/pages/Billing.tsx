import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useUsage } from '../contexts/UsageContext';

interface PlanCard {
  id: 'free' | 'pro' | 'business' | 'enterprise';
  title: string;
  subtitle: string;
  monthlyPrice: number | null;
  cta: string;
  emphasized?: boolean;
  features: string[];
}

const PLAN_CARDS: PlanCard[] = [
  {
    id: 'free',
    title: 'Free',
    subtitle: 'For trying Loomic and personal experiments.',
    monthlyPrice: 0,
    cta: 'Current plan',
    features: [
      '5 daily credits',
      'No credit rollover',
      'Community support',
      'Loomic branding',
    ],
  },
  {
    id: 'pro',
    title: 'Pro',
    subtitle: 'For makers shipping client and personal projects.',
    monthlyPrice: 25,
    cta: 'Upgrade',
    emphasized: true,
    features: [
      '100 credits / month',
      'Daily credits + top-ups',
      'Custom domains',
      'Remove Loomic badge',
      'Priority support',
    ],
  },
  {
    id: 'business',
    title: 'Business',
    subtitle: 'For teams building multiple apps in parallel.',
    monthlyPrice: 50,
    cta: 'Upgrade',
    features: [
      'Everything in Pro',
      'Internal publish',
      'SSO and team workspace',
      'Role-based access',
      'Security center',
    ],
  },
  {
    id: 'enterprise',
    title: 'Enterprise',
    subtitle: 'For larger organizations with governance needs.',
    monthlyPrice: null,
    cta: 'Book a demo',
    features: [
      'Dedicated support',
      'SCIM + advanced controls',
      'Custom connectors',
      'Audit and compliance controls',
      'Publishing governance',
    ],
  },
];

const formatPrice = (value: number | null, annual: boolean): string => {
  if (value === null) return 'Custom';
  if (value === 0) return 'Free';
  const effective = annual ? Math.round(value * 0.85) : value;
  return `EUR ${effective}`;
};

export default function Billing() {
  const { quota } = useUsage();
  const [annualBilling, setAnnualBilling] = useState(false);

  const remainingCredits = quota?.requests?.remaining ?? 0;
  const totalCredits = quota?.requests?.limit ?? 5;
  const usedCredits = Math.max(0, totalCredits - remainingCredits);
  const progress = totalCredits > 0 ? Math.min(100, Math.round((usedCredits / totalCredits) * 100)) : 0;
  const planName = String(quota?.plan || 'free').toUpperCase();

  const cards = useMemo(() => PLAN_CARDS, []);

  return (
    <div className="min-h-screen bg-[#0e1118] text-slate-100">
      <div className="mx-auto flex max-w-[1500px]">
        <aside className="sticky top-0 h-screen w-[280px] border-r border-white/10 bg-[#0c1017] p-6">
          <Link to="/generator" className="inline-flex items-center gap-2 text-slate-300 transition hover:text-white">
            <span className="material-icons-round text-[18px]">arrow_back</span>
            Go back
          </Link>

          <p className="mt-10 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Project</p>
          <nav className="mt-4 space-y-1">
            <button className="w-full rounded-lg px-3 py-2 text-left text-slate-300 hover:bg-white/5">Project settings</button>
            <button className="w-full rounded-lg px-3 py-2 text-left text-slate-300 hover:bg-white/5">Domains</button>
            <button className="w-full rounded-lg px-3 py-2 text-left text-slate-300 hover:bg-white/5">Knowledge</button>
          </nav>

          <p className="mt-8 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Workspace</p>
          <nav className="mt-4 space-y-1">
            <button className="w-full rounded-lg bg-white/10 px-3 py-2 text-left font-semibold text-white">Plans & credits</button>
            <button className="w-full rounded-lg px-3 py-2 text-left text-slate-300 hover:bg-white/5">Cloud & AI balance</button>
            <button className="w-full rounded-lg px-3 py-2 text-left text-slate-300 hover:bg-white/5">Privacy & security</button>
          </nav>
        </aside>

        <main className="flex-1 p-8">
          <header className="mb-8 flex items-center justify-between">
            <div>
              <h1 className="text-4xl font-bold text-white">Plans & credits</h1>
              <p className="mt-2 text-slate-400">Manage subscription and usage for your Loomic workspace.</p>
            </div>
            <a
              href="https://docs.loomic.app/billing"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 rounded-lg border border-white/15 px-3 py-1.5 text-sm text-slate-200 hover:bg-white/5"
            >
              <span className="material-icons-round text-[16px]">help_outline</span>
              Docs
            </a>
          </header>

          <section className="grid gap-5 lg:grid-cols-2">
            <article className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
              <p className="text-sm text-slate-400">Current plan</p>
              <p className="mt-2 text-3xl font-semibold text-white">{planName} Plan</p>
              <p className="mt-2 text-sm text-slate-400">Upgrade anytime. Cancel monthly.</p>
              <div className="mt-6">
                <Link
                  to="/generator"
                  className="inline-flex items-center rounded-lg border border-white/20 px-4 py-2 text-sm font-semibold text-slate-200 hover:bg-white/10"
                >
                  Manage project
                </Link>
              </div>
            </article>

            <article className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
              <div className="mb-2 flex items-center justify-between text-sm">
                <p className="text-slate-400">Credits remaining</p>
                <p className="font-semibold text-slate-200">
                  {remainingCredits} of {totalCredits}
                </p>
              </div>
              <div className="h-2 rounded-full bg-white/10">
                <div className="h-2 rounded-full bg-blue-500" style={{ width: `${Math.max(8, 100 - progress)}%` }} />
              </div>
              <ul className="mt-5 space-y-2 text-sm text-slate-300">
                <li className="flex items-center gap-2">
                  <span className="material-icons-round text-[16px] text-blue-400">circle</span>
                  Daily credits used first
                </li>
                <li className="flex items-center gap-2">
                  <span className="material-icons-round text-[16px] text-slate-500">close</span>
                  Free credits do not roll over
                </li>
                <li className="flex items-center gap-2">
                  <span className="material-icons-round text-[16px] text-emerald-400">done</span>
                  Credits reset daily at 00:00 UTC
                </li>
              </ul>
            </article>
          </section>

          <div className="mt-8 mb-4 flex items-center gap-3">
            <button
              onClick={() => setAnnualBilling((prev) => !prev)}
              className={`relative h-7 w-12 rounded-full transition ${annualBilling ? 'bg-blue-600' : 'bg-white/20'}`}
            >
              <span
                className={`absolute top-1 h-5 w-5 rounded-full bg-white transition ${annualBilling ? 'left-6' : 'left-1'}`}
              />
            </button>
            <p className="text-sm text-slate-300">Annual billing (15% discount)</p>
          </div>

          <section className="grid gap-5 xl:grid-cols-4 md:grid-cols-2">
            {cards.map((plan) => (
              <article
                key={plan.id}
                className={`rounded-2xl border p-5 ${
                  plan.emphasized
                    ? 'border-violet-400/40 bg-violet-500/10'
                    : 'border-white/10 bg-white/[0.02]'
                }`}
              >
                <h2 className="text-3xl font-semibold text-white">{plan.title}</h2>
                <p className="mt-2 min-h-[40px] text-sm text-slate-400">{plan.subtitle}</p>
                <p className="mt-5 text-4xl font-bold text-white">
                  {formatPrice(plan.monthlyPrice, annualBilling)}
                  {plan.monthlyPrice !== null && plan.monthlyPrice > 0 && (
                    <span className="ml-2 text-base font-medium text-slate-400">/ month</span>
                  )}
                </p>

                <button
                  className={`mt-6 h-11 w-full rounded-lg border text-sm font-semibold transition ${
                    plan.emphasized
                      ? 'border-transparent bg-[#6a4af6] text-white hover:bg-[#7758ff]'
                      : 'border-white/20 text-slate-200 hover:bg-white/10'
                  }`}
                >
                  {plan.cta}
                </button>

                <ul className="mt-5 space-y-2 text-sm text-slate-300">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-2">
                      <span className="material-icons-round mt-0.5 text-[16px] text-slate-300">done</span>
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>
              </article>
            ))}
          </section>
        </main>
      </div>
    </div>
  );
}
