import { Request, Response, Router } from 'express';
import type { AuthenticatedRequest } from '../middleware/auth.js';
import { supabaseAdmin } from '../lib/supabase.js';

// STRIPE INTEGRATION READY
// To enable real payments:
// 1. Set STRIPE_ENABLED=true in .env
// 2. Add STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, STRIPE_PRICE_IDs
// 3. Replace mock functions with Stripe calls (marked with TODO: STRIPE)

const router = Router();

type BillingPlan = 'free' | 'pro' | 'business' | 'enterprise';
type SubscriptionStatus = 'active' | 'canceled' | 'past_due';

const PLAN_LIMITS: Record<BillingPlan, number> = {
  free: 5,
  pro: 100,
  business: 500,
  enterprise: 999999,
};

const normalizePlan = (value: unknown): BillingPlan => {
  const plan = String(value || '').trim().toLowerCase();
  if (plan === 'pro' || plan === 'business' || plan === 'enterprise') return plan;
  return 'free';
};

const normalizeSubscriptionStatus = (value: unknown): SubscriptionStatus => {
  const status = String(value || '').trim().toLowerCase();
  if (status === 'canceled' || status === 'past_due') return status;
  return 'active';
};

const toNonNegativeInt = (value: unknown, fallback = 0): number => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return Math.floor(parsed);
};

const isMissingResourceError = (error: any): boolean =>
  error?.code === 'PGRST205' ||
  error?.code === '42P01' ||
  String(error?.message || '').toLowerCase().includes('does not exist');

const getNextMonthlyReset = (): string => {
  const now = new Date();
  const next = new Date(now);
  next.setMonth(next.getMonth() + 1);
  return next.toISOString();
};

const getNextDailyResetUtc = (): string => {
  const now = new Date();
  const next = new Date(now);
  next.setUTCHours(24, 0, 0, 0);
  return next.toISOString();
};

const getNextPlanReset = (plan: BillingPlan): string => {
  if (plan === 'free') return getNextDailyResetUtc();
  return getNextMonthlyReset();
};

const ensureProfile = async (userId: string): Promise<{
  plan: BillingPlan;
  subscriptionStatus: SubscriptionStatus;
  creditsUsed: number;
  creditsTotal: number;
  creditsResetAt: string;
}> => {
  const fallbackPlan: BillingPlan = 'free';
  const fallbackReset = getNextPlanReset(fallbackPlan);

  if (!supabaseAdmin) {
    return {
      plan: fallbackPlan,
      subscriptionStatus: 'active',
      creditsUsed: 0,
      creditsTotal: PLAN_LIMITS[fallbackPlan],
      creditsResetAt: fallbackReset,
    };
  }

  const { data, error } = await supabaseAdmin
    .from('profiles')
    .select('plan,subscription_status,credits_used,credits_total,credits_reset_at')
    .eq('id', userId)
    .maybeSingle();

  if (error && !isMissingResourceError(error)) {
    throw error;
  }

  let plan = normalizePlan(data?.plan);
  let creditsTotal = toNonNegativeInt(data?.credits_total, PLAN_LIMITS[plan]);
  if (creditsTotal <= 0) creditsTotal = PLAN_LIMITS[plan];
  let creditsUsed = toNonNegativeInt(data?.credits_used, 0);
  let creditsResetAt = String(data?.credits_reset_at || '').trim();
  if (!creditsResetAt) creditsResetAt = getNextPlanReset(plan);
  let subscriptionStatus = normalizeSubscriptionStatus(data?.subscription_status);

  const resetTs = Date.parse(creditsResetAt);
  if (!Number.isFinite(resetTs) || Date.now() > resetTs) {
    creditsUsed = 0;
    creditsResetAt = getNextPlanReset(plan);
  }

  const { error: upsertError } = await supabaseAdmin
    .from('profiles')
    .upsert(
      {
        id: userId,
        plan,
        subscription_status: subscriptionStatus,
        credits_used: creditsUsed,
        credits_total: creditsTotal,
        credits_reset_at: creditsResetAt,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'id' }
    );

  if (upsertError && !isMissingResourceError(upsertError)) {
    throw upsertError;
  }

  return {
    plan,
    subscriptionStatus,
    creditsUsed,
    creditsTotal,
    creditsResetAt,
  };
};

router.get('/status', async (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  const userId = String(authReq.authUser?.id || '').trim();
  if (!userId) {
    return res.status(401).json({
      error: 'Unauthorized',
    });
  }

  try {
    const profile = await ensureProfile(userId);
    return res.json({
      plan: profile.plan,
      status: profile.subscriptionStatus,
      creditsUsed: profile.creditsUsed,
      creditsTotal: profile.creditsTotal,
      creditsResetAt: profile.creditsResetAt,
      stripeConnected: false,
    });
  } catch (error: any) {
    return res.status(500).json({
      error: error?.message || 'Failed to load billing status',
    });
  }
});

router.post('/mock-upgrade', async (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  const userId = String(authReq.authUser?.id || '').trim();
  if (!userId) {
    return res.status(401).json({
      success: false,
      error: 'Unauthorized',
    });
  }

  const requestedPlan = normalizePlan(req.body?.plan);
  if (requestedPlan === 'free') {
    return res.status(400).json({
      success: false,
      error: 'Invalid plan for upgrade',
    });
  }

  const creditsTotal =
    requestedPlan === 'pro'
      ? 100
      : requestedPlan === 'business'
        ? 500
        : 999999;
  const creditsResetAt = getNextMonthlyReset();

  if (supabaseAdmin) {
    const { error } = await supabaseAdmin
      .from('profiles')
      .upsert(
        {
          id: userId,
          plan: requestedPlan,
          credits_total: creditsTotal,
          credits_used: 0,
          credits_reset_at: creditsResetAt,
          subscription_status: 'active',
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'id' }
      );

    if (error && !isMissingResourceError(error)) {
      return res.status(500).json({
        success: false,
        error: error.message || 'Failed to upgrade plan',
      });
    }
  }

  return res.json({
    success: true,
    plan: requestedPlan,
    creditsTotal,
  });
});

router.post('/mock-downgrade', async (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  const userId = String(authReq.authUser?.id || '').trim();
  if (!userId) {
    return res.status(401).json({
      success: false,
      error: 'Unauthorized',
    });
  }

  if (supabaseAdmin) {
    const { error } = await supabaseAdmin
      .from('profiles')
      .upsert(
        {
          id: userId,
          plan: 'free',
          credits_total: 5,
          credits_used: 0,
          credits_reset_at: getNextDailyResetUtc(),
          subscription_status: 'active',
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'id' }
      );

    if (error && !isMissingResourceError(error)) {
      return res.status(500).json({
        success: false,
        error: error.message || 'Failed to downgrade plan',
      });
    }
  }

  return res.json({
    success: true,
  });
});

router.get('/history', async (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  const userId = String(authReq.authUser?.id || '').trim();
  if (!userId) {
    return res.status(401).json({
      error: 'Unauthorized',
    });
  }

  let plan: BillingPlan = 'free';
  if (supabaseAdmin) {
    const { data, error } = await supabaseAdmin
      .from('profiles')
      .select('plan')
      .eq('id', userId)
      .maybeSingle();
    if (!error || isMissingResourceError(error)) {
      plan = normalizePlan(data?.plan);
    }
  }

  if (plan === 'free') {
    return res.json([]);
  }

  const description = plan === 'business' ? 'Loomic Business' : plan === 'enterprise' ? 'Loomic Enterprise' : 'Loomic Pro';
  const amount = plan === 'business' ? '€50.00' : plan === 'enterprise' ? '€199.00' : '€25.00';

  return res.json([
    { date: '2026-02-01', description, amount, status: 'paid', invoice: '#INV-001' },
    { date: '2026-01-01', description, amount, status: 'paid', invoice: '#INV-002' },
    { date: '2025-12-01', description, amount, status: 'paid', invoice: '#INV-003' },
  ]);
});

export default router;
