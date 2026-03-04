-- Create User Quotas Table
CREATE TABLE IF NOT EXISTS user_quotas (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_type TEXT NOT NULL DEFAULT 'free', -- 'free', 'pro', 'enterprise'
  daily_requests_limit INTEGER NOT NULL DEFAULT 50,
  daily_tokens_limit INTEGER NOT NULL DEFAULT 100000,
  monthly_requests_limit INTEGER NOT NULL DEFAULT 1000,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create Daily Usage Table
CREATE TABLE IF NOT EXISTS daily_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  request_count INTEGER NOT NULL DEFAULT 0,
  token_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, date)
);

-- Enable RLS
ALTER TABLE user_quotas ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_usage ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Users can view their own quota" ON user_quotas
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can view their own usage" ON daily_usage
  FOR SELECT USING (auth.uid() = user_id);

-- Only service role can insert/update, or we rely on functions
CREATE POLICY "Service role full access quotas" ON user_quotas
  USING (true) WITH CHECK (true);
  
CREATE POLICY "Service role full access usage" ON daily_usage
  USING (true) WITH CHECK (true);

-- Function to check and increment quota (Atomic operation)
CREATE OR REPLACE FUNCTION check_and_increment_quota(
  p_user_id UUID,
  p_estimated_tokens INTEGER
) RETURNS JSONB AS $$
DECLARE
  v_quota user_quotas%ROWTYPE;
  v_usage daily_usage%ROWTYPE;
  v_today DATE := CURRENT_DATE;
  v_plan_limit INTEGER;
  v_request_limit INTEGER;
BEGIN
  -- 1. Get or Create User Quota
  SELECT * INTO v_quota FROM user_quotas WHERE user_id = p_user_id;
  IF NOT FOUND THEN
    INSERT INTO user_quotas (user_id) VALUES (p_user_id) RETURNING * INTO v_quota;
  END IF;

  v_plan_limit := v_quota.daily_tokens_limit;
  v_request_limit := v_quota.daily_requests_limit;

  -- 2. Get or Create Daily Usage
  SELECT * INTO v_usage FROM daily_usage WHERE user_id = p_user_id AND date = v_today;
  IF NOT FOUND THEN
    INSERT INTO daily_usage (user_id, date) VALUES (p_user_id, v_today) RETURNING * INTO v_usage;
  END IF;

  -- 3. Check Limits
  IF v_usage.request_count >= v_request_limit THEN
    RETURN jsonb_build_object(
      'allowed', false, 
      'reason', 'DAILY_REQUEST_LIMIT_EXCEEDED',
      'current', v_usage.request_count,
      'limit', v_request_limit
    );
  END IF;

  IF v_usage.token_count + p_estimated_tokens > v_plan_limit THEN
    RETURN jsonb_build_object(
      'allowed', false, 
      'reason', 'DAILY_TOKEN_LIMIT_EXCEEDED',
      'current', v_usage.token_count,
      'limit', v_plan_limit
    );
  END IF;

  -- 4. Increment Request Count
  UPDATE daily_usage
  SET request_count = request_count + 1,
      updated_at = NOW()
  WHERE id = v_usage.id;

  RETURN jsonb_build_object(
    'allowed', true,
    'usage_id', v_usage.id,
    'plan', v_quota.plan_type,
    'remaining_requests', v_request_limit - (v_usage.request_count + 1),
    'quota_requests', v_request_limit,
    'quota_tokens', v_plan_limit,
    'used_requests', v_usage.request_count + 1,
    'used_tokens', v_usage.token_count
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to update actual tokens used
CREATE OR REPLACE FUNCTION update_token_usage(
  p_usage_id UUID,
  p_tokens_used INTEGER
) RETURNS VOID AS $$
BEGIN
  UPDATE daily_usage
  SET token_count = token_count + p_tokens_used,
      updated_at = NOW()
  WHERE id = p_usage_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
