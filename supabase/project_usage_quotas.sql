-- Project-scoped usage quotas (workspace/project level)

CREATE TABLE IF NOT EXISTS public.project_quotas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  plan_type TEXT NOT NULL DEFAULT 'project',
  daily_requests_limit INTEGER NOT NULL DEFAULT 25,
  daily_tokens_limit INTEGER NOT NULL DEFAULT 50000,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, project_id)
);

CREATE TABLE IF NOT EXISTS public.project_daily_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  request_count INTEGER NOT NULL DEFAULT 0,
  token_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, project_id, date)
);

CREATE INDEX IF NOT EXISTS project_daily_usage_user_date_idx ON public.project_daily_usage(user_id, date DESC);
CREATE INDEX IF NOT EXISTS project_daily_usage_project_date_idx ON public.project_daily_usage(project_id, date DESC);

ALTER TABLE public.project_quotas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_daily_usage ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own project quotas" ON public.project_quotas
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can view own project daily usage" ON public.project_daily_usage
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Service role full access project_quotas" ON public.project_quotas
  USING (true) WITH CHECK (true);

CREATE POLICY "Service role full access project_daily_usage" ON public.project_daily_usage
  USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.check_and_increment_project_quota(
  p_user_id UUID,
  p_project_id UUID,
  p_estimated_tokens INTEGER
) RETURNS JSONB AS $$
DECLARE
  v_quota public.project_quotas%ROWTYPE;
  v_usage public.project_daily_usage%ROWTYPE;
  v_today DATE := CURRENT_DATE;
  v_request_limit INTEGER;
  v_token_limit INTEGER;
  v_project_owner UUID;
BEGIN
  SELECT user_id INTO v_project_owner
  FROM public.projects
  WHERE id = p_project_id;

  IF v_project_owner IS NULL OR v_project_owner <> p_user_id THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'reason', 'PROJECT_ACCESS_DENIED',
      'current', 0,
      'limit', 0
    );
  END IF;

  SELECT * INTO v_quota
  FROM public.project_quotas
  WHERE user_id = p_user_id AND project_id = p_project_id;

  IF NOT FOUND THEN
    INSERT INTO public.project_quotas (user_id, project_id)
    VALUES (p_user_id, p_project_id)
    RETURNING * INTO v_quota;
  END IF;

  v_request_limit := v_quota.daily_requests_limit;
  v_token_limit := v_quota.daily_tokens_limit;

  SELECT * INTO v_usage
  FROM public.project_daily_usage
  WHERE user_id = p_user_id
    AND project_id = p_project_id
    AND date = v_today;

  IF NOT FOUND THEN
    INSERT INTO public.project_daily_usage (user_id, project_id, date)
    VALUES (p_user_id, p_project_id, v_today)
    RETURNING * INTO v_usage;
  END IF;

  IF v_usage.request_count >= v_request_limit THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'reason', 'PROJECT_DAILY_REQUEST_LIMIT_EXCEEDED',
      'current', v_usage.request_count,
      'limit', v_request_limit,
      'quota_requests', v_request_limit,
      'quota_tokens', v_token_limit,
      'used_requests', v_usage.request_count,
      'used_tokens', v_usage.token_count,
      'plan', v_quota.plan_type
    );
  END IF;

  IF v_usage.token_count + p_estimated_tokens > v_token_limit THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'reason', 'PROJECT_DAILY_TOKEN_LIMIT_EXCEEDED',
      'current', v_usage.token_count,
      'limit', v_token_limit,
      'quota_requests', v_request_limit,
      'quota_tokens', v_token_limit,
      'used_requests', v_usage.request_count,
      'used_tokens', v_usage.token_count,
      'plan', v_quota.plan_type
    );
  END IF;

  UPDATE public.project_daily_usage
  SET request_count = request_count + 1,
      updated_at = NOW()
  WHERE id = v_usage.id;

  RETURN jsonb_build_object(
    'allowed', true,
    'usage_id', v_usage.id,
    'plan', v_quota.plan_type,
    'remaining_requests', v_request_limit - (v_usage.request_count + 1),
    'quota_requests', v_request_limit,
    'quota_tokens', v_token_limit,
    'used_requests', v_usage.request_count + 1,
    'used_tokens', v_usage.token_count
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.update_project_token_usage(
  p_usage_id UUID,
  p_tokens_used INTEGER
) RETURNS VOID AS $$
BEGIN
  UPDATE public.project_daily_usage
  SET token_count = token_count + GREATEST(0, p_tokens_used),
      updated_at = NOW()
  WHERE id = p_usage_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
