import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, type BillingHistoryItem, type BillingPlan, type BillingStatusResponse } from '../lib/api';

interface PricingCard {
  id: BillingPlan;
  title: string;
  description: string;
  monthlyPrice: number;
  annualPrice: number;
  features: string[];
  highlighted?: boolean;
}

const STORAGE_KEY_ANNUAL = 'billing:annual';

const PLAN_ORDER: Record<BillingPlan, number> = {
  free: 0,
  pro: 1,
  business: 2,
  enterprise: 3,
};

const PLAN_BADGE_STYLE: Record<BillingPlan, string> = {
  free: 'bg-slate-500/20 text-slate-300 border-slate-400/30',
  pro: 'bg-violet-500/20 text-violet-300 border-violet-400/30',
  business: 'bg-blue-500/20 text-blue-300 border-blue-400/30',
  enterprise: 'bg-amber-500/20 text-amber-200 border-amber-400/30',
};

const PRICING_CARDS: PricingCard[] = [
  {
    id: 'free',
    title: 'Free',
    description: 'Best for trying Loomic.',
    monthlyPrice: 0,
    annualPrice: 0,
    features: ['5 generations/day', 'Core builder features', 'Community support'],
  },
  {
    id: 'pro',
    title: 'Pro',
    description: 'Great for solo builders.',
    monthlyPrice: 25,
    annualPrice: 21,
    highlighted: true,
    features: ['100 credits/month', 'Faster queues', 'Priority support'],
  },
  {
    id: 'business',
    title: 'Business',
    description: 'For teams shipping often.',
    monthlyPrice: 50,
    annualPrice: 42,
    features: ['500 credits/month', 'Team workflows', 'Advanced controls'],
  },
  {
    id: 'enterprise',
    title: 'Enterprise',
    description: 'Custom limits and support.',
    monthlyPrice: 199,
    annualPrice: 169,
    features: ['Unlimited-style capacity', 'Dedicated support', 'Custom contracts'],
  },
];

const DEFAULT_BILLING_STATUS: BillingStatusResponse = {
  plan: 'free',
  status: 'active',
  creditsUsed: 0,
  creditsTotal: 5,
  creditsResetAt: new Date().toISOString(),
  stripeConnected: false,
};

const formatCountdown = (resetAtIso: string): string => {
  const resetAt = Date.parse(resetAtIso);
  const now = Date.now();
  if (!Number.isFinite(resetAt) || resetAt <= now) return 'Resets in 0h 0m 0s';

  const diffMs = resetAt - now;
  const totalSeconds = Math.max(0, Math.floor(diffMs / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `Resets in ${hours}h ${minutes}m ${seconds}s`;
};

const prettyPlanName = (plan: BillingPlan): string => {
  if (plan === 'pro') return 'Pro';
  if (plan === 'business') return 'Business';
  if (plan === 'enterprise') return 'Enterprise';
  return 'Free';
};

const formatPrice = (value: number): string => `EUR ${value}`;

export default function Billing() {
  const [annualBilling, setAnnualBilling] = useState(() => localStorage.getItem(STORAGE_KEY_ANNUAL) === 'true');
  const [billingStatus, setBillingStatus] = useState<BillingStatusResponse>(DEFAULT_BILLING_STATUS);
  const [historyRows, setHistoryRows] = useState<BillingHistoryItem[]>([]);
  const [statusLoading, setStatusLoading] = useState(true);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [countdown, setCountdown] = useState(formatCountdown(DEFAULT_BILLING_STATUS.creditsResetAt));
  const [actionLoadingPlan, setActionLoadingPlan] = useState<BillingPlan | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const planName = prettyPlanName(billingStatus.plan);
  const creditsUsed = Math.max(0, Math.round(billingStatus.creditsUsed || 0));
  const creditsTotal = Math.max(1, Math.round(billingStatus.creditsTotal || 1));
  const creditsRemaining = Math.max(0, creditsTotal - creditsUsed);
  const creditsProgress = Math.min(100, Math.round((creditsUsed / creditsTotal) * 100));

  const canUpgradeFromTop = billingStatus.plan !== 'enterprise';

  const loadStatus = useCallback(async () => {
    setStatusLoading(true);
    try {
      const response = await api.getBillingStatus();
      if (response.error) {
        throw new Error(response.error);
      }
      setBillingStatus({
        plan: response.plan,
        status: response.status,
        creditsUsed: response.creditsUsed,
        creditsTotal: response.creditsTotal,
        creditsResetAt: response.creditsResetAt,
        stripeConnected: response.stripeConnected,
      });
      setCountdown(formatCountdown(response.creditsResetAt));
    } catch (error: unknown) {
      setFeedback({
        type: 'error',
        text: error instanceof Error ? error.message : 'Failed to load billing status',
      });
    } finally {
      setStatusLoading(false);
    }
  }, []);

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const rows = await api.getBillingHistory();
      setHistoryRows(Array.isArray(rows) ? rows : []);
    } catch {
      setHistoryRows([]);
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    void Promise.all([loadStatus(), loadHistory()]);
  }, [loadHistory, loadStatus]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_ANNUAL, annualBilling ? 'true' : 'false');
  }, [annualBilling]);

  useEffect(() => {
    setCountdown(formatCountdown(billingStatus.creditsResetAt));
    const timer = window.setInterval(() => {
      setCountdown(formatCountdown(billingStatus.creditsResetAt));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [billingStatus.creditsResetAt]);

  const handleUpgrade = async (targetPlan: 'pro' | 'business' | 'enterprise') => {
    setActionLoadingPlan(targetPlan);
    setFeedback(null);
    try {
      // TODO: Replace mock-upgrade with Stripe checkout when ready
      // await fetch('/api/billing/create-checkout-session', { ... })
      const response = await api.mockUpgradePlan(targetPlan);
      if (!response.success) {
        throw new Error(response.error || 'Upgrade failed');
      }
      await Promise.all([loadStatus(), loadHistory()]);
      setFeedback({
        type: 'success',
        text: `Plan upgraded to ${prettyPlanName(targetPlan)} (mock).`,
      });
    } catch (error: unknown) {
      setFeedback({
        type: 'error',
        text: error instanceof Error ? error.message : 'Upgrade failed',
      });
    } finally {
      setActionLoadingPlan(null);
    }
  };

  const topUpgradeTarget: 'pro' | 'business' | 'enterprise' = useMemo(() => {
    if (billingStatus.plan === 'free') return 'pro';
    if (billingStatus.plan === 'pro') return 'business';
    return 'enterprise';
  }, [billingStatus.plan]);

  return (
    <div className="min-h-screen bg-[#0d1118] text-slate-100">
      <main className="mx-auto max-w-7xl px-6 py-10">
        <header className="mb-8 flex items-center justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.18em] text-slate-500">Billing</p>
            <h1 className="mt-2 text-4xl font-bold text-white">Plans & Credits</h1>
          </div>
          <Link to="/generator" className="rounded-lg border border-white/15 px-3 py-2 text-sm text-slate-200 hover:bg-white/10">
            Back to Generator
          </Link>
        </header>

        <section className="mb-8 rounded-2xl border border-white/10 bg-white/[0.03] p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-sm text-slate-400">Current plan</p>
              <div className="mt-2 flex items-center gap-3">
                <h2 className="text-3xl font-semibold text-white">{planName}</h2>
                <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${PLAN_BADGE_STYLE[billingStatus.plan]}`}>
                  {planName}
                </span>
              </div>
              <p className="mt-2 text-sm text-slate-400">Status: {billingStatus.status}</p>
            </div>
            <button
              disabled={!canUpgradeFromTop || actionLoadingPlan !== null}
              onClick={() => {
                void handleUpgrade(topUpgradeTarget);
              }}
              className="rounded-lg bg-[#6a4af6] px-4 py-2 text-sm font-semibold text-white hover:bg-[#7758ff] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {canUpgradeFromTop ? 'Upgrade' : 'Highest Plan Active'}
            </button>
          </div>

          <div className="mt-6">
            <div className="mb-2 flex items-center justify-between text-sm">
              <span className="text-slate-400">Credits</span>
              <span className="font-semibold text-slate-200">{creditsUsed} / {creditsTotal} used</span>
            </div>
            <div className="h-2 rounded-full bg-white/10">
              <div className="h-2 rounded-full bg-blue-500 transition-all" style={{ width: `${creditsProgress}%` }} />
            </div>
            <p className="mt-2 text-sm text-slate-300">Credits left: {creditsRemaining}</p>
            <p className="mt-1 text-sm text-slate-400">{countdown}</p>
            {statusLoading && <p className="mt-2 text-xs text-slate-500">Loading billing status...</p>}
          </div>
        </section>

        <div className="mb-4 flex items-center gap-3">
          <button
            onClick={() => setAnnualBilling((prev) => !prev)}
            className={`relative h-7 w-12 rounded-full transition ${annualBilling ? 'bg-blue-600' : 'bg-white/20'}`}
          >
            <span className={`absolute top-1 h-5 w-5 rounded-full bg-white transition ${annualBilling ? 'left-6' : 'left-1'}`} />
          </button>
          <p className="text-sm text-slate-300">Annual billing (15% discount)</p>
        </div>

        <section className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
          {PRICING_CARDS.map((card) => {
            const isCurrentPlan = card.id === billingStatus.plan;
            const isHigherPlan = PLAN_ORDER[card.id] > PLAN_ORDER[billingStatus.plan];
            const isLowerPlan = PLAN_ORDER[card.id] < PLAN_ORDER[billingStatus.plan];
            const shownPrice = annualBilling ? card.annualPrice : card.monthlyPrice;

            return (
              <article
                key={card.id}
                className={`relative rounded-2xl border p-5 ${card.highlighted ? 'border-violet-400/45 bg-violet-500/10' : 'border-white/10 bg-white/[0.02]'}`}
              >
                {card.highlighted && (
                  <span className="absolute -top-3 left-5 rounded-full bg-violet-500 px-3 py-1 text-xs font-semibold text-white">
                    Most Popular
                  </span>
                )}
                <h3 className="text-2xl font-semibold text-white">{card.title}</h3>
                <p className="mt-2 min-h-[38px] text-sm text-slate-400">{card.description}</p>
                <div className="mt-4">
                  {annualBilling && card.monthlyPrice > 0 && (
                    <p className="text-sm text-slate-500 line-through">{formatPrice(card.monthlyPrice)}</p>
                  )}
                  <p className="text-4xl font-bold text-white">
                    {card.monthlyPrice === 0 ? 'Free' : formatPrice(shownPrice)}
                    {card.monthlyPrice > 0 && (
                      <span className="ml-2 text-base font-medium text-slate-400">/month</span>
                    )}
                  </p>
                  {annualBilling && card.monthlyPrice > 0 && (
                    <p className="mt-1 text-xs text-slate-500">(billed annually)</p>
                  )}
                </div>

                {isCurrentPlan ? (
                  <button
                    disabled
                    className="mt-6 h-11 w-full cursor-not-allowed rounded-lg border border-white/30 bg-transparent text-sm font-semibold text-slate-300"
                  >
                    Current plan
                  </button>
                ) : card.id === 'enterprise' ? (
                  <a
                    href="mailto:sales@loomic.app?subject=Enterprise plan"
                    className="mt-6 inline-flex h-11 w-full items-center justify-center rounded-lg border border-amber-300/40 text-sm font-semibold text-amber-200 transition hover:bg-amber-500/10"
                  >
                    Contact sales
                  </a>
                ) : isHigherPlan ? (
                  <button
                    onClick={() => {
                      void handleUpgrade(card.id as 'pro' | 'business');
                    }}
                    disabled={actionLoadingPlan !== null}
                    className="mt-6 h-11 w-full rounded-lg bg-[#6a4af6] text-sm font-semibold text-white transition hover:bg-[#7758ff] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {actionLoadingPlan === card.id ? 'Upgrading...' : 'Upgrade'}
                  </button>
                ) : (
                  <button
                    disabled={isLowerPlan}
                    className="mt-6 h-11 w-full cursor-not-allowed rounded-lg border border-white/15 text-sm font-semibold text-slate-500"
                  >
                    Not available
                  </button>
                )}

                <ul className="mt-5 space-y-2 text-sm text-slate-300">
                  {card.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-2">
                      <span className="material-icons-round mt-0.5 text-[16px] text-slate-300">done</span>
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>
              </article>
            );
          })}
        </section>

        {feedback && (
          <div className={`mt-6 rounded-xl border px-4 py-3 text-sm ${feedback.type === 'success' ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400' : 'border-red-500/30 bg-red-500/10 text-red-400'}`}>
            {feedback.text}
          </div>
        )}

        <section className="mt-8 rounded-2xl border border-white/10 bg-white/[0.03] p-6">
          <h2 className="text-2xl font-semibold text-white">Payment History</h2>
          {historyLoading ? (
            <p className="mt-4 text-sm text-slate-400">Loading payment history...</p>
          ) : historyRows.length === 0 ? (
            <div className="mt-4 rounded-xl border border-white/10 bg-black/20 p-4">
              <p className="text-sm font-medium text-slate-200">No payment history yet</p>
              <p className="mt-1 text-sm text-slate-400">Your invoices will appear here after upgrading</p>
            </div>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-white/10 text-slate-400">
                    <th className="py-2 pr-4 font-medium">Date</th>
                    <th className="py-2 pr-4 font-medium">Description</th>
                    <th className="py-2 pr-4 font-medium">Amount</th>
                    <th className="py-2 pr-4 font-medium">Status</th>
                    <th className="py-2 font-medium">Invoice</th>
                  </tr>
                </thead>
                <tbody>
                  {historyRows.map((row) => (
                    <tr key={`${row.invoice}-${row.date}`} className="border-b border-white/5 text-slate-200">
                      <td className="whitespace-nowrap py-3 pr-4">{row.date}</td>
                      <td className="py-3 pr-4">{row.description}</td>
                      <td className="py-3 pr-4">{row.amount}</td>
                      <td className="py-3 pr-4">
                        <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-xs font-semibold text-emerald-300">
                          Paid
                        </span>
                      </td>
                      <td className="py-3">{row.invoice}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

