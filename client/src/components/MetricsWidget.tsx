import React from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { useUsage } from '../contexts/UsageContext';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../lib/api';

export default function MetricsWidget() {
    const { rateLimit } = useUsage();
    const { user } = useAuth();
    const [historyData, setHistoryData] = React.useState<any[]>([]);
    const [stats, setStats] = React.useState({ requestsChange: 0, totalTokens: 0 });
    const [selectedProvider, setSelectedProvider] = React.useState('all');

    React.useEffect(() => {
        if (!user) return;

        const loadData = async () => {
            try {
                const logs = await api.getUsageHistory(user.id);

                // Filter by selectedProvider
                const filteredLogs = selectedProvider === 'all'
                    ? logs
                    : logs.filter(log => {
                        const details = log.details as any;
                        return details?.provider === selectedProvider;
                    });

                // Process logs into 30-minute buckets for the chart
                const buckets = new Map<string, { time: string, requests: number, tokens: number }>();

                // Initialize buckets for the last 24h (every 30 mins)
                const now = new Date();
                const minutes = now.getMinutes();
                const roundedMinutes = minutes >= 30 ? 30 : 0;
                now.setMinutes(roundedMinutes);
                now.setSeconds(0);
                now.setMilliseconds(0);

                for (let i = 10; i >= 0; i--) {
                    const t = new Date(now.getTime() - i * 30 * 60 * 1000);
                    const key = t.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                    buckets.set(key, { time: key, requests: 0, tokens: 0 });
                }

                let totalTokens = 0;
                const chartData = Array.from(buckets.values());

                filteredLogs.forEach((log: any) => {
                    const details = log.details as any || {};
                    totalTokens += (details.tokens_input || 0) + (details.tokens_output || 0);

                    const date = new Date(log.created_at);
                    const minutes = date.getMinutes();
                    const roundedMinutes = minutes >= 30 ? 30 : 0;
                    date.setMinutes(roundedMinutes);
                    const key = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

                    const existing = chartData.find(d => d.time === key);
                    if (existing) {
                        existing.requests += 1;
                        existing.tokens += ((details.tokens_input || 0) + (details.tokens_output || 0));
                    }
                });

                setHistoryData(chartData);
                setStats({
                    requestsChange: filteredLogs.length,
                    totalTokens
                });

            } catch (e) {
                console.error("Failed to load metrics:", e);
            }
        };

        loadData();
    }, [user, selectedProvider]);

    const data = historyData.length > 0 ? historyData : [
        { time: 'No Data', requests: 0, tokens: 0 }
    ];

    const fallbackLimit = 15000;
    const parsedLimit = rateLimit && !rateLimit.unknown ? Number(rateLimit.limit) : fallbackLimit;
    const currentLimit = Number.isFinite(parsedLimit) && parsedLimit > 0 ? parsedLimit : fallbackLimit;

    const parsedRemaining = rateLimit && !rateLimit.unknown ? Number(rateLimit.remaining) : currentLimit;
    const currentRemaining = Number.isFinite(parsedRemaining)
        ? Math.min(currentLimit, Math.max(0, parsedRemaining))
        : currentLimit;

    const used = Math.max(0, currentLimit - currentRemaining);
    const usageRatio = currentLimit > 0 ? Math.min(1, used / currentLimit) : 0;
    const usagePercentage = Math.round(usageRatio * 100);
    const circleCircumference = 2 * Math.PI * 60;
    const strokeDashOffset = circleCircumference * (1 - usageRatio);

    const parsedTokenUsed = Number((rateLimit as any)?.tokensUsed ?? stats.totalTokens);
    const parsedTokenLimit = Number((rateLimit as any)?.tokenLimit ?? 100000);
    const tokenUsed = Number.isFinite(parsedTokenUsed) ? Math.max(0, parsedTokenUsed) : 0;
    const tokenLimit = Number.isFinite(parsedTokenLimit) && parsedTokenLimit > 0 ? parsedTokenLimit : 100000;
    const tokenPercentage = Math.min(100, (tokenUsed / tokenLimit) * 100);

    // Calculate time until next reset (Midnight UTC)
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
        const interval = setInterval(updateTimer, 60000);
        return () => clearInterval(interval);
    }, []);

    const userPlan = (rateLimit as any)?.plan || 'Free';

    return (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8 animate-fade-in">
            {/* Chart Card */}
            <div className="bg-slate-900 rounded-2xl p-6 border border-slate-800 shadow-xl">
                <div className="flex items-center justify-between mb-6">
                    <h3 className="text-lg font-bold text-white flex items-center gap-2">
                        <span className="material-symbols-rounded text-blue-400">monitoring</span>
                        Live Metrics
                    </h3>
                    <div className="flex items-center gap-2 text-xs">
                        <span className="flex items-center gap-1.5 px-2 py-1 bg-blue-500/10 text-blue-400 rounded-md border border-blue-500/20">
                            <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse"></span>
                            Live
                        </span>
                        <select className="bg-slate-800 border-none text-slate-400 rounded-md py-1 px-2 focus:ring-1 focus:ring-blue-500">
                            <option>Last 30 min</option>
                            <option>Last 24h</option>
                        </select>
                    </div>
                </div>

                <div className="h-[200px] w-full min-w-0">
                    <ResponsiveContainer width="100%" height="100%" minWidth={280} minHeight={200}>
                        <AreaChart data={data}>
                            <defs>
                                <linearGradient id="colorRequests" x1="0" y1="0" x2="0" y2="1">
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
                                interval={5}
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
                                fill="url(#colorRequests)"
                            />
                        </AreaChart>
                    </ResponsiveContainer>
                </div>
            </div>

            {/* Stats Card */}
            <div className="bg-slate-900 rounded-2xl p-6 border border-slate-800 shadow-xl flex flex-col justify-between">
                <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-bold text-white flex items-center gap-2">
                        <span className="material-symbols-rounded text-purple-400">token</span>
                        Quota Usage
                    </h3>
                    <div className="relative" title="Select Provider">
                        <select
                            value={selectedProvider}
                            onChange={(e) => setSelectedProvider(e.target.value)}
                            className="bg-slate-800 border border-slate-700 text-slate-300 text-xs rounded-lg focus:ring-blue-500 focus:border-blue-500 block p-1.5 pr-8 appearance-none cursor-pointer hover:bg-slate-700/50 transition-colors"
                        >
                            <option value="all">All Providers</option>
                            <option value="gemini">Gemini</option>
                            <option value="openai">OpenAI</option>
                            <option value="deepseek">DeepSeek</option>
                        </select>
                        <div className="absolute inset-y-0 right-0 flex items-center px-2 pointer-events-none text-slate-400">
                            <span className="material-icons-round text-sm">expand_more</span>
                        </div>
                    </div>
                </div>

                <div className="space-y-6">
                    {/* Main Progress Circle (Simulated with text for now, could use PieChart) */}
                    <div className="flex items-center gap-6">
                        <div className="relative w-32 h-32 flex items-center justify-center">
                            <svg className="w-full h-full transform -rotate-90">
                                <circle cx="64" cy="64" r="60" stroke="#1e293b" strokeWidth="8" fill="transparent" />
                                <circle
                                    cx="64" cy="64" r="60"
                                    stroke={usageRatio > 0.9 ? "#ef4444" : "#3b82f6"}
                                    strokeWidth="8"
                                    fill="transparent"
                                    strokeDasharray={circleCircumference}
                                    strokeDashoffset={strokeDashOffset}
                                    className="transition-all duration-1000 ease-out"
                                />
                            </svg>
                            <div className="absolute inset-0 flex flex-col items-center justify-center">
                                <span className="text-2xl font-bold text-white">{usagePercentage}%</span>
                                <span className="text-xs text-slate-400 uppercase tracking-widest">Used</span>
                            </div>
                        </div>

                        <div className="flex-1 space-y-3">
                            <div>
                                <div className="flex justify-between text-xs text-slate-400 mb-1">
                                    <span>Requests Today</span>
                                    <span className="text-white">{used.toLocaleString()}</span>
                                </div>
                                <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
                                    <div className="bg-blue-500 h-full rounded-full" style={{ width: `${usagePercentage}%` }}></div>
                                </div>
                            </div>
                            <div>
                                <div className="flex justify-between text-xs text-slate-400 mb-1">
                                    <span>Token Volume</span>
                                    <span className="text-white">
                                        {(rateLimit as any)?.tokensUsed
                                            ? `${Math.round(tokenUsed / 1000)}k`
                                            : `~${(Math.max(0, stats.totalTokens) / 1000).toFixed(1)}k`}
                                    </span>
                                </div>
                                <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
                                    <div
                                        className="bg-purple-500 h-full rounded-full transition-all duration-500"
                                        style={{ width: `${tokenPercentage}%` }}
                                    ></div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="pt-4 border-t border-slate-800 flex justify-between items-center text-xs">
                        <span className="text-slate-500">Reset in: <span className="text-slate-300 font-mono">{timeToReset}</span></span>
                        <span className="text-slate-500">Tier: <span className="text-green-400 font-medium capitalize">{userPlan} Plan</span></span>
                    </div>
                </div>
            </div>
        </div>
    );
}
