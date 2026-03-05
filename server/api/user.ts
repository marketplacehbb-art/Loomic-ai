import { Request, Response, Router } from 'express';
import type { AuthenticatedRequest } from '../middleware/auth.js';
import { supabaseAdmin } from '../lib/supabase.js';
import {
  getUserApiKeyStatus,
  getUserProviderApiKeys,
  saveUserApiKey,
  testUserApiKey,
  type UserApiKeyProvider,
} from './user-api-keys.js';

const router = Router();

const normalizeProvider = (value: unknown): UserApiKeyProvider | null => {
  const provider = String(value || '').trim().toLowerCase();
  if (
    provider === 'deepseek' ||
    provider === 'openai' ||
    provider === 'gemini' ||
    provider === 'groq' ||
    provider === 'openrouter' ||
    provider === 'nvidia'
  ) {
    return provider;
  }
  return null;
};

const isMissingTableError = (error: any): boolean =>
  error?.code === 'PGRST205' ||
  error?.code === '42P01' ||
  String(error?.message || '').toLowerCase().includes('does not exist');

const billingWaitlistMemory = new Set<string>();

const parsePositiveInt = (value: unknown, fallback: number): number => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.floor(parsed);
};

const parseNonNegativeInt = (value: unknown, fallback: number): number => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return Math.floor(parsed);
};

const toNumber = (value: unknown): number => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return parsed;
};

const toText = (value: unknown, fallback = ''): string => {
  const text = String(value ?? '').trim();
  return text || fallback;
};

const normalizeDate = (value: unknown): string => {
  const text = String(value || '').trim();
  if (!text) return new Date().toISOString();
  const parsed = Date.parse(text);
  if (!Number.isFinite(parsed)) return new Date().toISOString();
  return new Date(parsed).toISOString();
};

const extractPrompt = (details: Record<string, unknown>): string => {
  const candidate =
    details.prompt ||
    details.request_prompt ||
    details.userPrompt ||
    details.input_prompt ||
    '';
  const prompt = toText(candidate, 'No prompt captured');
  return prompt.length > 140 ? `${prompt.slice(0, 137)}...` : prompt;
};

const extractTokenUsage = (details: Record<string, unknown>): number => {
  const value =
    details.total_tokens ||
    details.tokens_total ||
    details.tokensTotal ||
    details.token_count ||
    details.tokenCount ||
    details.tokens ||
    0;
  return Math.max(0, Math.round(toNumber(value)));
};

const extractProvider = (details: Record<string, unknown>): string => {
  const provider =
    details.effective_provider ||
    details.effectiveProvider ||
    details.provider ||
    'unknown';
  return toText(provider, 'unknown').toLowerCase();
};

router.get('/usage', async (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  const userId = authReq.authUser?.id;
  if (!userId || !supabaseAdmin) {
    const now = new Date();
    const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const resetsAt = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000).toISOString();
    return res.json({
      creditsUsed: 0,
      creditsTotal: 5,
      resetsAt,
    });
  }

  const now = new Date();
  const utcDayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const utcDate = utcDayStart.toISOString().slice(0, 10);
  const resetsAt = new Date(utcDayStart.getTime() + 24 * 60 * 60 * 1000).toISOString();

  try {
    const [quotaResult, usageResult] = await Promise.all([
      supabaseAdmin
        .from('user_quotas')
        .select('plan_type,daily_requests_limit')
        .eq('user_id', userId)
        .maybeSingle(),
      supabaseAdmin
        .from('daily_usage')
        .select('request_count')
        .eq('user_id', userId)
        .eq('date', utcDate)
        .maybeSingle(),
    ]);

    if (quotaResult.error && !isMissingTableError(quotaResult.error)) {
      throw quotaResult.error;
    }
    if (usageResult.error && !isMissingTableError(usageResult.error)) {
      throw usageResult.error;
    }

    const planType = toText(quotaResult.data?.plan_type, 'free').toLowerCase();
    const configuredLimit = parsePositiveInt(quotaResult.data?.daily_requests_limit, 0);
    const creditsTotal = planType === 'free' ? 5 : (configuredLimit > 0 ? configuredLimit : 50);
    const creditsUsed = Math.max(0, Math.round(toNumber(usageResult.data?.request_count)));

    return res.json({
      creditsUsed,
      creditsTotal,
      resetsAt,
    });
  } catch (error: any) {
    console.warn('[Billing Usage] fallback response due to error:', error?.message || error);
    return res.json({
      creditsUsed: 0,
      creditsTotal: 5,
      resetsAt,
    });
  }
});

router.get('/payment-history', async (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  const userId = authReq.authUser?.id;
  const userEmail = toText(authReq.authUser?.email).toLowerCase();

  if (!userId || !supabaseAdmin) {
    return res.json({
      success: true,
      rows: [],
    });
  }

  const tableCandidates = ['payment_history', 'billing_payments', 'invoices', 'payments'];
  const normalizedRows: Array<{
    id: string;
    date: string;
    description: string;
    amount: number;
    status: string;
    invoiceUrl: string;
  }> = [];

  for (const table of tableCandidates) {
    let data: Record<string, unknown>[] | null = null;
    let queryError: any = null;

    const primary = await supabaseAdmin
      .from(table)
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(100);

    data = primary.data as Record<string, unknown>[] | null;
    queryError = primary.error;

    if (queryError && String(queryError.message || '').toLowerCase().includes('user_id') && userEmail) {
      const fallback = await supabaseAdmin
        .from(table)
        .select('*')
        .eq('email', userEmail)
        .order('created_at', { ascending: false })
        .limit(100);
      data = fallback.data as Record<string, unknown>[] | null;
      queryError = fallback.error;
    }

    if (queryError) {
      if (isMissingTableError(queryError)) {
        continue;
      }
      const message = String(queryError.message || '').toLowerCase();
      if (message.includes('column') || message.includes('order')) {
        continue;
      }
      return res.status(500).json({
        success: false,
        error: queryError.message || 'Failed to load payment history',
      });
    }

    for (let index = 0; index < (data || []).length; index += 1) {
      const row = data?.[index] || {};
      normalizedRows.push({
        id: toText(row.id, `${table}-${index}`),
        date: normalizeDate(row.created_at || row.date || row.paid_at || row.timestamp),
        description: toText(row.description || row.title || row.plan_name || row.type, 'Subscription payment'),
        amount: Math.max(0, toNumber(row.amount ?? row.total ?? row.value)),
        status: toText(row.status || row.payment_status || row.state, 'paid').toUpperCase(),
        invoiceUrl: toText(row.invoice_url || row.invoice || row.invoice_link || row.receipt_url),
      });
    }

    if (normalizedRows.length > 0) {
      break;
    }
  }

  normalizedRows.sort((left, right) => Date.parse(right.date) - Date.parse(left.date));

  return res.json({
    success: true,
    rows: normalizedRows,
  });
});

router.get('/api-keys', async (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  const userId = authReq.authUser?.id;
  if (!userId) {
    return res.status(401).json({
      success: false,
      error: 'Unauthorized',
    });
  }

  try {
    const keys = await getUserApiKeyStatus(userId);
    return res.json({
      success: true,
      keys,
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      error: error?.message || 'Failed to load API keys',
    });
  }
});

router.post('/api-keys', async (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  const userId = authReq.authUser?.id;
  if (!userId) {
    return res.status(401).json({
      success: false,
      error: 'Unauthorized',
    });
  }

  const provider = normalizeProvider(req.body?.provider);
  const apiKey = typeof req.body?.apiKey === 'string' ? req.body.apiKey : '';
  if (!provider) {
    return res.status(400).json({
      success: false,
      error: 'Invalid provider',
    });
  }

  const saved = await saveUserApiKey({
    userId,
    provider,
    apiKey,
  });

  if (!saved.success) {
    return res.status(400).json({
      success: false,
      error: saved.error || 'Failed to save API key',
    });
  }

  return res.json({
    success: true,
    provider,
    mode: saved.mode,
  });
});

router.post('/api-keys/test', async (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  const userId = authReq.authUser?.id;
  if (!userId) {
    return res.status(401).json({
      success: false,
      error: 'Unauthorized',
    });
  }

  const provider = normalizeProvider(req.body?.provider);
  if (!provider) {
    return res.status(400).json({
      success: false,
      valid: false,
      error: 'Invalid provider',
    });
  }

  const explicitKey = typeof req.body?.apiKey === 'string' ? req.body.apiKey.trim() : '';
  let keyToTest = explicitKey;
  if (!keyToTest) {
    const keys = await getUserProviderApiKeys(userId);
    keyToTest = String(keys[provider] || '').trim();
  }

  const result = await testUserApiKey(provider, keyToTest);
  return res.json({
    success: true,
    provider,
    valid: result.valid,
    message: result.message,
  });
});

router.get('/usage-history', async (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  const userId = authReq.authUser?.id;
  if (!userId || !supabaseAdmin) {
    return res.json({
      success: true,
      rows: [],
      total: 0,
      hasMore: false,
    });
  }

  const limit = Math.min(100, Math.max(1, parsePositiveInt(req.query.limit, 10)));
  const offset = Math.max(0, parseNonNegativeInt(req.query.offset, 0));
  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();

  const historyResult = await supabaseAdmin
    .from('audit_logs')
    .select('id,created_at,details', { count: 'exact' })
    .eq('user_id', userId)
    .eq('action', 'generate_code')
    .gte('created_at', monthStart)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (historyResult.error) {
    if (isMissingTableError(historyResult.error)) {
      return res.json({
        success: true,
        rows: [],
        total: 0,
        hasMore: false,
      });
    }
    return res.status(500).json({
      success: false,
      error: historyResult.error.message || 'Failed to load usage history',
    });
  }

  const historyRows = (historyResult.data || []) as Array<{
    id: string;
    created_at: string;
    details: Record<string, unknown> | null;
  }>;

  const projectIds = Array.from(
    new Set(
      historyRows
        .map((row) => {
          const details = row.details && typeof row.details === 'object' ? row.details : {};
          return toText((details as Record<string, unknown>).project_id || (details as Record<string, unknown>).projectId);
        })
        .filter(Boolean)
    )
  );

  const projectNameMap = new Map<string, string>();
  if (projectIds.length > 0) {
    const projectsResult = await supabaseAdmin
      .from('projects')
      .select('id,name')
      .in('id', projectIds);
    if (projectsResult.data) {
      for (const project of projectsResult.data as Array<{ id: string; name: string | null }>) {
        projectNameMap.set(project.id, toText(project.name, 'Untitled project'));
      }
    }
  }

  const rows = historyRows.map((row, index) => {
    const details = row.details && typeof row.details === 'object' ? row.details : {};
    const typedDetails = details as Record<string, unknown>;
    const projectId = toText(typedDetails.project_id || typedDetails.projectId);
    return {
      id: toText(row.id, `${row.created_at}-${index}`),
      date: normalizeDate(row.created_at),
      projectName: projectNameMap.get(projectId) || toText(typedDetails.project_name || typedDetails.projectName, 'Unknown project'),
      tokensUsed: extractTokenUsage(typedDetails),
      provider: extractProvider(typedDetails),
      prompt: extractPrompt(typedDetails),
    };
  });

  const total = Math.max(0, Number(historyResult.count || 0));
  return res.json({
    success: true,
    rows,
    total,
    hasMore: offset + rows.length < total,
  });
});

router.post('/waitlist', async (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  const userId = authReq.authUser?.id;
  const fallbackEmail = toText(authReq.authUser?.email).toLowerCase();
  const email = toText(req.body?.email, fallbackEmail).toLowerCase();

  if (!userId) {
    return res.status(401).json({
      success: false,
      error: 'Unauthorized',
    });
  }

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({
      success: false,
      error: 'Please provide a valid email address',
    });
  }

  const successPayload = {
    success: true,
    message: "You're on the waitlist! We'll notify you.",
  };

  if (!supabaseAdmin) {
    billingWaitlistMemory.add(`${userId}:${email}`);
    return res.json({ ...successPayload, mode: 'memory' });
  }

  const tableCandidates = ['billing_waitlist', 'waitlist', 'upgrade_waitlist'];
  const insertPayloads: Array<Record<string, unknown>> = [
    {
      user_id: userId,
      email,
      source: 'billing-upgrade',
      created_at: new Date().toISOString(),
    },
    {
      email,
      source: 'billing-upgrade',
      created_at: new Date().toISOString(),
    },
    {
      email,
    },
  ];

  for (const table of tableCandidates) {
    for (const payload of insertPayloads) {
      const { error } = await supabaseAdmin
        .from(table)
        .insert(payload);
      if (!error) {
        return res.json({ ...successPayload, mode: 'db' });
      }
      if (String(error.code || '') === '23505' || String(error.message || '').toLowerCase().includes('duplicate')) {
        return res.json({ ...successPayload, mode: 'db' });
      }
      if (isMissingTableError(error)) {
        break;
      }
      const message = String(error.message || '').toLowerCase();
      if (message.includes('column') || message.includes('null value')) {
        continue;
      }
    }
  }

  billingWaitlistMemory.add(`${userId}:${email}`);
  return res.json({ ...successPayload, mode: 'memory' });
});

router.post('/delete-account', async (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  const userId = authReq.authUser?.id;
  const userEmail = String(authReq.authUser?.email || '').trim().toLowerCase();
  const confirmationEmail = String(req.body?.email || '').trim().toLowerCase();

  if (!userId || !userEmail) {
    return res.status(401).json({
      success: false,
      error: 'Unauthorized',
    });
  }

  if (!confirmationEmail || confirmationEmail !== userEmail) {
    return res.status(400).json({
      success: false,
      error: 'Email confirmation does not match',
    });
  }

  if (!supabaseAdmin) {
    return res.status(500).json({
      success: false,
      error: 'Account deletion is not configured on this server',
    });
  }

  const deleteFromTable = async (table: string, column: string) => {
    const { error } = await supabaseAdmin
      .from(table)
      .delete()
      .eq(column, userId);
    if (error && !isMissingTableError(error)) {
      console.warn(`[Delete Account] ${table} cleanup failed:`, error.message);
    }
  };

  await deleteFromTable('project_messages', 'user_id');
  await deleteFromTable('project_files', 'user_id');
  await deleteFromTable('project_publications', 'user_id');
  await deleteFromTable('project_integrations', 'user_id');
  await deleteFromTable('daily_usage', 'user_id');
  await deleteFromTable('project_daily_usage', 'user_id');
  await deleteFromTable('project_quotas', 'user_id');
  await deleteFromTable('user_quotas', 'user_id');
  await deleteFromTable('email_preferences', 'user_id');
  await deleteFromTable('user_profiles', 'user_id');
  await deleteFromTable('profiles', 'id');
  await deleteFromTable('audit_logs', 'user_id');

  const { error: projectsError } = await supabaseAdmin
    .from('projects')
    .delete()
    .eq('user_id', userId);
  if (projectsError && !isMissingTableError(projectsError)) {
    console.warn('[Delete Account] projects cleanup failed:', projectsError.message);
  }

  const { error: authDeleteError } = await supabaseAdmin.auth.admin.deleteUser(userId);
  if (authDeleteError) {
    return res.status(500).json({
      success: false,
      error: authDeleteError.message || 'Failed to delete account',
    });
  }

  return res.json({
    success: true,
  });
});

export default router;
