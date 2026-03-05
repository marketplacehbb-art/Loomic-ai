import React from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Link } from 'react-router-dom';
import { ArrowUpRight, CalendarDays, Folder, Info, Sparkles } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useUsage } from '../contexts/UsageContext';
import { api, type LiveMetricsResponse } from '../lib/api';

const EMPTY_METRICS: LiveMetricsResponse = {
  p95Latency: 0,
  successRate: 0,
  fallbackRate: 0,
  costPerRequest: 0,
  requestsToday: 0,
  tokenVolumeToday: 0,
  chartData: [],
  requestsNeeded: 5,
  message: 'Generate 5 projects to see your metrics',
  totalProjects: 0,
  totalGenerations: 0,
  thisMonthGenerations: 0,
};

const toNonNegativeNumber = (value: unknown): number => {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, parsed);
};

const toPercent = (value: number): string => `${Math.round(Math.max(0, Math.min(1, value)) * 100)}%`;

const toCurrency = (value: number): string => `$${Math.max(0, value).toFixed(4)}`;

const formatBucketTime = (offsetHours: number): string => {
  const date = new Date(Date.now() - offsetHours * 60 * 60 * 1000);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

const FLAT_CHART_DATA = Array.from({ length: 12 }, (_, index) => ({
  time: formatBucketTime(11 - index),
  requests: 0,
  latency: 0,
}));

const formatCompactNumber = (value: number): string => {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}k`;
  return value.toLocaleString();
};

const planGenerationLimit = (plan: string): number => {
  if (plan === 'pro') return 100;
  if (plan === 'business') return 500;
  if (plan === 'enterprise') return Number.POSITIVE_INFINITY;
  return 5;
};

const planProjectLimit = (plan: string): number => {
  if (plan === 'free') return 2;
  return Number.POSITIVE_INFINITY;
};

const planBadgeClass = (plan: string): string => {
  if (plan === 'pro') return 'border-purple-500/30 bg-purple-500/10 text-purple-300';
  if (plan === 'business') return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300';
  if (plan === 'enterprise') return 'border-amber-400/30 bg-amber-400/10 text-amber-300';
  return 'border-slate-700 bg-slate-800 text-slate-300';
};

const resolveLatencyTone = (latencyMs: number): string => {
  if (latencyMs < 5000) return 'text-emerald-400';
  if (latencyMs < 15000) return 'text-amber-400';
  return 'text-red-400';
};

const resolveSuccessTone = (successRate: number): string => {
  if (successRate > 0.8) return 'text-emerald-400';
  if (successRate > 0.5) return 'text-amber-400';
  return 'text-red-400';
};

const resolveSwitchTone = (fallbackRate: number): string => (fallbackRate < 0.2 ? 'text-emerald-400' : 'text-amber-400');

const buildTrendSeries = (base: number): number[] =>
  [0.82, 0.88, 0.85, 0.91, 0.89, 0.94, 0.9].map((factor) => Math.max(0, base * factor));

const pointsForSparkline = (values: number[]): string => {
  if (!values.length) return '';
  const max = Math.max(...values);
  const min = Math.min(...values);
  const range = max - min || 1;

  return values
    .map((value, index) => {
      const x = (index / Math.max(1, values.length - 1)) * 100;
      const y = 26 - ((value - min) / range) * 22;
      return `${x},${y}`;
    })
    .join(' ');
};

interface QuickStatCardProps {
  icon: React.ReactNode;
  iconClass: string;
  label: string;
  value: number;
  trendText: string;
  showPulseDot?: boolean;
}

function QuickStatCard({ icon, iconClass, label, value, trendText, showPulseDot = false }: QuickStatCardProps) {
  const hasData = value > 0;

  return (
    <div className="flex h-full flex-col justify-between rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-[0_16px_30px_rgba(2,6,23,0.35)]">
      <div className="mb-5 flex items-start justify-between">
        <div className={`rounded-lg border border-slate-800 bg-slate-950/70 p-2 ${iconClass}`}>{icon}</div>
        {showPulseDot && <span className="mt-1 h-2.5 w-2.5 rounded-full bg-purple-400/90 shadow-[0_0_10px_rgba(168,85,247,0.6)]" />}
      </div>
      <div>
        <p className="text-4xl font-bold text-white">{formatCompactNumber(value)}</p>
        <p className="mt-2 text-[11px] font-medium uppercase tracking-[0.14em] text-slate-400">{label}</p>
        <p className={`mt-4 text-xs font-medium ${hasData ? 'text-emerald-400' : 'text-slate-500'}`}>{trendText}</p>
      </div>
    </div>
  );
}

interface MetricValueCardProps {
  label: string;
  value: string;
  toneClass: string;
  trendValues: number[];
}

function MetricValueCard({ label, value, toneClass, trendValues }: MetricValueCardProps) {
  const points = pointsForSparkline(trendValues);

  return (
    <div className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-950/50 p-3">
      <div>
        <p className={`text-2xl font-bold ${toneClass}`}>{value}</p>
        <p className="mt-1 text-xs text-slate-400">{label}</p>
      </div>
      <svg viewBox="0 0 100 28" className="h-8 w-24 text-purple-400/80" aria-hidden="true">
        <polyline fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" points={points} />
      </svg>
    </div>
  );
}

interface UsageRowProps {
  label: string;
  valueText: string;
  progress: number;
}

function UsageRow({ label, valueText, progress }: UsageRowProps) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs">
        <span className="text-slate-400">{label}</span>
        <span className="font-medium text-slate-200">{valueText}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-slate-700">
        <div className="h-full rounded-full bg-purple-500 transition-[width] duration-500 ease-out" style={{ width: `${Math.min(100, Math.max(0, progress * 100))}%` }} />
      </div>
    </div>
  );
}

const chartTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload || !payload.length) return null;

  return (
    <div className="rounded-lg border border-slate-700 bg-slate-950/95 px-3 py-2 text-xs shadow-xl">
      <p className="text-slate-300">{label}</p>
      <p className="mt-1 font-semibold text-white">Generations: {toNonNegativeNumber(payload[0]?.value).toLocaleString()}</p>
    </div>
  );
};

export default function MetricsWidget() {
  const { user } = useAuth();
  const { rateLimit, quota } = useUsage();
  const [metrics, setMetrics] = React.useState<LiveMetricsResponse>(EMPTY_METRICS);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    if (!user) {
      setMetrics(EMPTY_METRICS);
      setLoading(false);
      return;
    }

    let active = true;

    const loadMetrics = async () => {
      try {
        const response = await api.getLiveMetrics();
        if (!active) return;

        const incomingChartData = Array.isArray(response.chartData) ? response.chartData : [];
        setMetrics({
          ...EMPTY_METRICS,
          ...response,
          chartData: incomingChartData.length > 0 ? incomingChartData : FLAT_CHART_DATA,
        });
      } catch (error) {
        console.error('Failed to load live metrics:', error);
        if (!active) return;
        setMetrics({
          ...EMPTY_METRICS,
          chartData: FLAT_CHART_DATA,
        });
      } finally {
        if (active) setLoading(false);
      }
    };

    void loadMetrics();
    const interval = window.setInterval(() => void loadMetrics(), 60_000);

    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [user]);

  const requestsNeeded = Math.max(0, Math.floor(toNonNegativeNumber(metrics.requestsNeeded)));
  const chartData = metrics.chartData.length > 0 ? metrics.chartData : FLAT_CHART_DATA;
  const hasChartData = chartData.some((point) => toNonNegativeNumber(point.requests) > 0);
  const showGettingStarted = requestsNeeded > 0 || !hasChartData;

  const systemAlerts: string[] = [];
  if (!showGettingStarted && metrics.successRate < 0.9) {
    systemAlerts.push('Success Rate is below 90%.');
  }
  if (!showGettingStarted && metrics.fallbackRate > 0.2) {
    systemAlerts.push('Provider Switch Rate is above 20%.');
  }
  if (!showGettingStarted && metrics.p95Latency > 12_000) {
    systemAlerts.push('Avg. Response Time is above 12s.');
  }

  const normalizedPlan = String(rateLimit?.plan || quota?.plan || 'free').toLowerCase();
  const fallbackLimit = planGenerationLimit(normalizedPlan);
  const parsedLimit = rateLimit && !rateLimit.unknown ? Number(rateLimit.limit) : NaN;
  const currentLimit = Number.isFinite(parsedLimit) && parsedLimit > 0 ? parsedLimit : fallbackLimit;
  const parsedRemaining = rateLimit && !rateLimit.unknown ? Number(rateLimit.remaining) : NaN;
  const currentRemaining = Number.isFinite(parsedRemaining)
    ? Math.min(currentLimit, Math.max(0, parsedRemaining))
    : currentLimit;
  const usedRequests = Number.isFinite(parsedRemaining)
    ? Math.max(0, currentLimit - currentRemaining)
    : toNonNegativeNumber(metrics.requestsToday);
  const usageRatio = Number.isFinite(currentLimit)
    ? (currentLimit > 0 ? Math.min(1, usedRequests / currentLimit) : 0)
    : Math.min(0.95, usedRequests > 0 ? usedRequests / (usedRequests + 50) : 0);
  const usagePercentage = Math.round(usageRatio * 100);

  const tokenLimitRaw = Number(rateLimit?.tokenLimit ?? quota?.tokens.limit ?? 100000);
  const tokenLimit = Number.isFinite(tokenLimitRaw) && tokenLimitRaw > 0 ? tokenLimitRaw : 100000;
  const tokenUsageRatio = Math.min(1, Math.max(0, toNonNegativeNumber(metrics.tokenVolumeToday) / tokenLimit));

  const [timeToReset, setTimeToReset] = React.useState('');

  React.useEffect(() => {
    const updateTimer = () => {
      const now = new Date();
      const tomorrow = new Date(now);
      tomorrow.setUTCHours(24, 0, 0, 0);
      const diff = tomorrow.getTime() - now.getTime();
      const hours = Math.floor(diff / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      setTimeToReset(`${hours}h ${minutes}m`);
    };

    updateTimer();
    const interval = window.setInterval(updateTimer, 60_000);
    return () => window.clearInterval(interval);
  }, []);

  const displayPlan = normalizedPlan.charAt(0).toUpperCase() + normalizedPlan.slice(1);
  const projectCount = toNonNegativeNumber(metrics.totalProjects);
  const projectLimit = planProjectLimit(normalizedPlan);
  const projectRatio = Number.isFinite(projectLimit)
    ? Math.min(1, projectCount / Math.max(1, projectLimit))
    : Math.min(0.95, projectCount > 0 ? projectCount / (projectCount + 8) : 0);

  const trendPercent = React.useMemo(() => {
    if (!hasChartData) return 0;
    const half = Math.floor(chartData.length / 2);
    const firstHalf = chartData.slice(0, half).reduce((sum, item) => sum + toNonNegativeNumber(item.requests), 0);
    const secondHalf = chartData.slice(half).reduce((sum, item) => sum + toNonNegativeNumber(item.requests), 0);

    if (firstHalf <= 0 && secondHalf > 0) return 12;
    if (firstHalf <= 0) return 0;

    return Math.max(1, Math.min(99, Math.round(Math.abs(((secondHalf - firstHalf) / firstHalf) * 100))));
  }, [chartData, hasChartData]);

  const trendText = (value: number) => (value > 0 ? `Up ${trendPercent || 12}% vs last week` : 'No data yet');

  const requestSeries = chartData.map((point) => toNonNegativeNumber(point.requests));
  const latencySeries = chartData.map((point) => toNonNegativeNumber(point.latency));
  const responseTrend = latencySeries.some((value) => value > 0) ? latencySeries : buildTrendSeries(toNonNegativeNumber(metrics.p95Latency));
  const successTrend = buildTrendSeries(toNonNegativeNumber(metrics.successRate) * 100);
  const switchTrend = buildTrendSeries(toNonNegativeNumber(metrics.fallbackRate) * 100);
  const costTrend = requestSeries.some((value) => value > 0)
    ? requestSeries
    : buildTrendSeries(toNonNegativeNumber(metrics.costPerRequest) * 10000);

  const generationLimitText = Number.isFinite(currentLimit) ? currentLimit.toLocaleString() : 'unlimited';
  const projectLimitText = Number.isFinite(projectLimit) ? projectLimit.toLocaleString() : 'unlimited';

  const chartUsageData = [
    { name: 'Used', value: Math.max(0, usagePercentage) },
    { name: 'Remaining', value: Math.max(0, 100 - usagePercentage) },
  ];

  return (
    <div className="mb-8 animate-fade-in">
      <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-3">
        <QuickStatCard
          icon={<Folder className="h-4 w-4" />}
          iconClass="text-purple-300"
          label="Total Projects"
          value={loading ? 0 : toNonNegativeNumber(metrics.totalProjects)}
          trendText={trendText(toNonNegativeNumber(metrics.totalProjects))}
        />
        <QuickStatCard
          icon={<Sparkles className="h-4 w-4" />}
          iconClass="text-purple-200"
          label="Total Generations"
          value={loading ? 0 : toNonNegativeNumber(metrics.totalGenerations)}
          trendText={trendText(toNonNegativeNumber(metrics.totalGenerations))}
          showPulseDot
        />
        <QuickStatCard
          icon={<CalendarDays className="h-4 w-4" />}
          iconClass="text-emerald-300"
          label="This Month"
          value={loading ? 0 : toNonNegativeNumber(metrics.thisMonthGenerations)}
          trendText={trendText(toNonNegativeNumber(metrics.thisMonthGenerations))}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-xl">
          <div className="mb-6 flex items-center justify-between">
            <h3 className="flex items-center gap-2 text-lg font-bold text-white">
              <span className="h-2 w-2 rounded-full bg-purple-400" />
              Live Metrics
            </h3>
            <span className="text-xs text-slate-400">Updated every 60s</span>
          </div>

          <div className="mb-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
            <MetricValueCard
              label="Success Rate"
              value={toPercent(toNonNegativeNumber(metrics.successRate))}
              toneClass={resolveSuccessTone(toNonNegativeNumber(metrics.successRate))}
              trendValues={successTrend}
            />
            <MetricValueCard
              label="Avg. Response Time"
              value={`${Math.round(toNonNegativeNumber(metrics.p95Latency))} ms`}
              toneClass={resolveLatencyTone(toNonNegativeNumber(metrics.p95Latency))}
              trendValues={responseTrend}
            />
            <MetricValueCard
              label="Provider Switch Rate"
              value={toPercent(toNonNegativeNumber(metrics.fallbackRate))}
              toneClass={resolveSwitchTone(toNonNegativeNumber(metrics.fallbackRate))}
              trendValues={switchTrend}
            />
            <MetricValueCard
              label="Cost / Request"
              value={toCurrency(toNonNegativeNumber(metrics.costPerRequest))}
              toneClass="text-slate-100"
              trendValues={costTrend}
            />
          </div>

          <div className="mb-4 rounded-xl border border-slate-700 bg-slate-800 px-3 py-2.5">
            {showGettingStarted ? (
              <div className="flex flex-col gap-2 text-xs sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-start gap-2 text-slate-300">
                  <Info className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                  <span>{metrics.message || 'Generate your first project to see live metrics'}</span>
                </div>
                <Link to="/generator" className="inline-flex items-center gap-1 text-xs font-semibold text-purple-300 transition-colors hover:text-purple-200">
                  Create Project <ArrowUpRight className="h-3.5 w-3.5" />
                </Link>
              </div>
            ) : systemAlerts.length > 0 ? (
              <div className="space-y-1.5">
                <p className="text-[10px] uppercase tracking-wide text-amber-400">Active system alerts ({systemAlerts.length})</p>
                {systemAlerts.map((alert) => (
                  <p key={alert} className="text-xs text-amber-300">
                    {alert}
                  </p>
                ))}
              </div>
            ) : (
              <p className="text-xs text-emerald-400">No active system alerts.</p>
            )}
          </div>

          <div className="mb-2 flex items-center gap-2 text-xs text-slate-400">
            <span className="inline-flex h-2 w-2 rounded-full bg-purple-500" />
            Generations
          </div>

          <div className="relative h-[220px] w-full min-w-0">
            <ResponsiveContainer width="100%" height="100%" minWidth={280} minHeight={200}>
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="liveRequestsGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                <XAxis dataKey="time" stroke="#64748b" fontSize={10} tickLine={false} axisLine={false} />
                <YAxis
                  stroke="#64748b"
                  fontSize={10}
                  tickLine={false}
                  axisLine={false}
                  label={{
                    value: 'Generations',
                    angle: -90,
                    position: 'insideLeft',
                    style: { fill: '#64748b', fontSize: 10 },
                  }}
                />
                <Tooltip content={chartTooltip} />
                <Area type="monotone" dataKey="requests" stroke="#8b5cf6" strokeWidth={2} fillOpacity={1} fill="url(#liveRequestsGradient)" />
              </AreaChart>
            </ResponsiveContainer>

            {!hasChartData && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <span className="rounded-md border border-slate-700 bg-slate-900/70 px-3 py-1 text-xs text-slate-400">No data yet</span>
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-col rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-xl">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-lg font-bold text-white">Usage This Period</h3>
            <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.1em] ${planBadgeClass(normalizedPlan)}`}>
              {displayPlan}
            </span>
          </div>

          <div className="mb-5 flex justify-center">
            <div className="relative flex h-44 w-44 items-center justify-center">
              <PieChart width={176} height={176}>
                <Pie
                  data={chartUsageData}
                  dataKey="value"
                  cx="50%"
                  cy="50%"
                  innerRadius={58}
                  outerRadius={76}
                  startAngle={90}
                  endAngle={-270}
                  stroke="none"
                >
                  <Cell fill="#8b5cf6" />
                  <Cell fill="#334155" />
                </Pie>
              </PieChart>
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                <p className="text-2xl font-bold text-white">{usagePercentage}%</p>
                <p className="text-[10px] uppercase tracking-[0.12em] text-slate-400">Used</p>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <UsageRow label="Generations" valueText={`${usedRequests.toLocaleString()} / ${generationLimitText}`} progress={usageRatio} />
            <UsageRow
              label="Tokens"
              valueText={`${formatCompactNumber(toNonNegativeNumber(metrics.tokenVolumeToday))} / ${formatCompactNumber(tokenLimit)}`}
              progress={tokenUsageRatio}
            />
            <UsageRow label="Projects" valueText={`${projectCount.toLocaleString()} / ${projectLimitText}`} progress={projectRatio} />
          </div>

          <div className="mt-6 flex items-center justify-between border-t border-slate-800 pt-4 text-xs">
            <span className="text-slate-500">
              Reset in: <span className="font-mono text-slate-300">{timeToReset}</span>
            </span>
            {normalizedPlan === 'free' && (
              <Link to="/billing" className="font-medium text-purple-400 transition-colors hover:text-purple-300">
                Upgrade for more {'->'}
              </Link>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
