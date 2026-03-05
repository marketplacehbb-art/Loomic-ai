import React from 'react';
import {
    Area,
    AreaChart,
    CartesianGrid,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from 'recharts';
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

const formatTokenVolume = (value: unknown): string => {
    const safe = toNonNegativeNumber(value);
    if (safe <= 0) return '0k';
    if (safe >= 1_000_000) return `${(safe / 1_000_000).toFixed(1)}M`;
    if (safe >= 1_000) return `${(safe / 1_000).toFixed(1)}k`;
    return '0k';
};

const formatBucketTime = (offsetHours: number): string => {
    const date = new Date(Date.now() - offsetHours * 60 * 60 * 1000);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

const PLACEHOLDER_CHART_DATA = Array.from({ length: 12 }, (_, index) => ({
    time: formatBucketTime(11 - index),
    requests: [1, 2, 1, 3, 2, 4, 3, 2, 3, 4, 3, 5][index],
    latency: [1900, 2100, 1800, 2400, 2200, 2500, 2300, 2100, 2250, 2450, 2320, 2480][index],
}));

interface QuickStatCardProps {
    icon: string;
    label: string;
    value: string;
}

function QuickStatCard({ icon, label, value }: QuickStatCardProps) {
    return (
        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4 shadow-lg">
            <div className="mb-2 flex items-center justify-between">
                <span className="material-symbols-rounded text-slate-400">{icon}</span>
                <span className="inline-flex items-center gap-1 rounded-md bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-300">
                    <span className="material-symbols-rounded text-[12px]">trending_up</span>
                    Live
                </span>
            </div>
            <p className="text-3xl font-bold text-white">{value}</p>
            <p className="mt-1 text-xs text-slate-400">{label}</p>
        </div>
    );
}

export default function MetricsWidget() {
    const { user } = useAuth();
    const { rateLimit } = useUsage();
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
                setMetrics({
                    ...EMPTY_METRICS,
                    ...response,
                    chartData: Array.isArray(response.chartData) && response.chartData.length > 0
                        ? response.chartData
                        : PLACEHOLDER_CHART_DATA,
                });
            } catch (error) {
                console.error('Failed to load live metrics:', error);
                if (!active) return;
                setMetrics({
                    ...EMPTY_METRICS,
                    chartData: PLACEHOLDER_CHART_DATA,
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
    const showGettingStarted = requestsNeeded > 0;
    const chartData = metrics.chartData.length > 0 ? metrics.chartData : PLACEHOLDER_CHART_DATA;

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

    const fallbackLimit = 15000;
    const parsedLimit = rateLimit && !rateLimit.unknown ? Number(rateLimit.limit) : fallbackLimit;
    const currentLimit = Number.isFinite(parsedLimit) && parsedLimit > 0 ? parsedLimit : fallbackLimit;
    const parsedRemaining = rateLimit && !rateLimit.unknown ? Number(rateLimit.remaining) : currentLimit;
    const currentRemaining = Number.isFinite(parsedRemaining)
        ? Math.min(currentLimit, Math.max(0, parsedRemaining))
        : currentLimit;
    const usedRequests = Math.max(0, currentLimit - currentRemaining);
    const usageRatio = currentLimit > 0 ? Math.min(1, usedRequests / currentLimit) : 0;
    const usagePercentage = Math.round(usageRatio * 100);

    const tokenLimitRaw = Number(rateLimit?.tokenLimit ?? 100000);
    const tokenLimit = Number.isFinite(tokenLimitRaw) && tokenLimitRaw > 0 ? tokenLimitRaw : 100000;
    const tokenUsageRatio = Math.min(1, Math.max(0, toNonNegativeNumber(metrics.tokenVolumeToday) / tokenLimit));
    const tokenPercentage = Math.round(tokenUsageRatio * 100);

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

    const userPlan = rateLimit?.plan || 'Free';

    return (
        <div className="mb-8 animate-fade-in">
            <div className="mb-4 grid grid-cols-1 gap-4 md:grid-cols-3">
                <QuickStatCard
                    icon="folder"
                    label="Total Projects"
                    value={loading ? '...' : toNonNegativeNumber(metrics.totalProjects).toLocaleString()}
                />
                <QuickStatCard
                    icon="auto_awesome"
                    label="Total Generations"
                    value={loading ? '...' : toNonNegativeNumber(metrics.totalGenerations).toLocaleString()}
                />
                <QuickStatCard
                    icon="calendar_month"
                    label="This Month"
                    value={loading ? '...' : toNonNegativeNumber(metrics.thisMonthGenerations).toLocaleString()}
                />
            </div>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-xl">
                    <div className="mb-6 flex items-center justify-between">
                        <h3 className="flex items-center gap-2 text-lg font-bold text-white">
                            <span className="material-symbols-rounded text-blue-400">monitoring</span>
                            Live Metrics
                        </h3>
                        <span className="flex items-center gap-1.5 rounded-md border border-blue-500/20 bg-blue-500/10 px-2 py-1 text-xs text-blue-300">
                            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-blue-300"></span>
                            Live
                        </span>
                    </div>

                    <div className="mb-4 grid grid-cols-2 gap-2">
                        <div className="rounded-lg border border-slate-800 bg-slate-950/60 px-2.5 py-2">
                            <p className="text-[10px] uppercase tracking-wide text-slate-500">Avg. Response Time</p>
                            <p className="text-sm font-semibold text-white">{Math.round(toNonNegativeNumber(metrics.p95Latency))} ms</p>
                        </div>
                        <div className="rounded-lg border border-slate-800 bg-slate-950/60 px-2.5 py-2">
                            <p className="text-[10px] uppercase tracking-wide text-slate-500">Success Rate</p>
                            <p className="text-sm font-semibold text-emerald-300">{toPercent(toNonNegativeNumber(metrics.successRate))}</p>
                        </div>
                        <div className="rounded-lg border border-slate-800 bg-slate-950/60 px-2.5 py-2">
                            <p className="text-[10px] uppercase tracking-wide text-slate-500">Provider Switch Rate</p>
                            <p className="text-sm font-semibold text-amber-300">{toPercent(toNonNegativeNumber(metrics.fallbackRate))}</p>
                        </div>
                        <div className="rounded-lg border border-slate-800 bg-slate-950/60 px-2.5 py-2">
                            <p className="text-[10px] uppercase tracking-wide text-slate-500">Cost / Request</p>
                            <p className="text-sm font-semibold text-blue-300">{toCurrency(toNonNegativeNumber(metrics.costPerRequest))}</p>
                        </div>
                    </div>

                    <div className="mb-4 rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2">
                        {showGettingStarted ? (
                            <div className="rounded-md border border-amber-700/40 bg-amber-950/20 px-2 py-1.5 text-xs text-amber-200">
                                <p className="font-semibold">Getting started — generate 5 projects to unlock metrics</p>
                                <p>{metrics.message || 'Generate 5 projects to see your metrics'}</p>
                            </div>
                        ) : systemAlerts.length > 0 ? (
                            <div className="space-y-1.5">
                                <p className="text-[10px] uppercase tracking-wide text-amber-300">
                                    Active system alerts ({systemAlerts.length})
                                </p>
                                {systemAlerts.map((alert) => (
                                    <p key={alert} className="text-xs text-amber-200">
                                        {alert}
                                    </p>
                                ))}
                            </div>
                        ) : (
                            <p className="text-xs text-emerald-300">No active system alerts.</p>
                        )}
                    </div>

                    <div className="h-[200px] w-full min-w-0">
                        <ResponsiveContainer width="100%" height="100%" minWidth={280} minHeight={200}>
                            <AreaChart data={chartData}>
                                <defs>
                                    <linearGradient id="liveRequestsGradient" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                                <XAxis
                                    dataKey="time"
                                    stroke="#64748b"
                                    fontSize={10}
                                    tickLine={false}
                                    axisLine={false}
                                />
                                <YAxis
                                    stroke="#64748b"
                                    fontSize={10}
                                    tickLine={false}
                                    axisLine={false}
                                />
                                <Tooltip
                                    contentStyle={{ backgroundColor: '#0f172a', borderColor: '#1e293b', borderRadius: '8px' }}
                                    itemStyle={{ color: '#fff' }}
                                />
                                <Area
                                    type="monotone"
                                    dataKey="requests"
                                    stroke="#3b82f6"
                                    strokeWidth={2}
                                    fillOpacity={1}
                                    fill="url(#liveRequestsGradient)"
                                />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                <div className="flex flex-col justify-between rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-xl">
                    <div className="mb-4 flex items-center justify-between">
                        <h3 className="flex items-center gap-2 text-lg font-bold text-white">
                            <span className="material-symbols-rounded text-purple-400">token</span>
                            Quota Usage
                        </h3>
                    </div>

                    <div className="space-y-4">
                        <div>
                            <div className="mb-1 flex justify-between text-xs text-slate-400">
                                <span>Requests Today</span>
                                <span className="text-white">{toNonNegativeNumber(metrics.requestsToday).toLocaleString()}</span>
                            </div>
                            <div className="h-2 overflow-hidden rounded-full bg-slate-800">
                                <div className="h-full rounded-full bg-blue-500 transition-all duration-500" style={{ width: `${usagePercentage}%` }} />
                            </div>
                        </div>

                        <div>
                            <div className="mb-1 flex justify-between text-xs text-slate-400">
                                <span>Token Volume</span>
                                <span className="text-white">{formatTokenVolume(metrics.tokenVolumeToday)}</span>
                            </div>
                            <div className="h-2 overflow-hidden rounded-full bg-slate-800">
                                <div className="h-full rounded-full bg-purple-500 transition-all duration-500" style={{ width: `${tokenPercentage}%` }} />
                            </div>
                        </div>
                    </div>

                    <div className="mt-6 flex items-center justify-between border-t border-slate-800 pt-4 text-xs">
                        <span className="text-slate-500">
                            Reset in: <span className="font-mono text-slate-300">{timeToReset}</span>
                        </span>
                        <span className="text-slate-500">
                            Tier: <span className="font-medium capitalize text-green-400">{userPlan} Plan</span>
                        </span>
                    </div>
                </div>
            </div>
        </div>
    );
}
