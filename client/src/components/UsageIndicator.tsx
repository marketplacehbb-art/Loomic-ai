import { useUsage } from '../contexts/UsageContext';

export default function UsageIndicator() {
    const { rateLimit } = useUsage();

    // Defaults for "Ready" state (no data yet)
    let percentage = 0;
    let label = 'Ready';
    let color = 'bg-slate-300 dark:bg-slate-600';

    if (rateLimit) {
        if (rateLimit.unknown) {
            // Provider-specific unknown limits
            if (rateLimit.provider === 'gemini') {
                return (
                    <div className="px-3 py-2 mt-4 mx-3 bg-slate-100 dark:bg-white/5 rounded-xl border border-slate-200 dark:border-white/5">
                        <div className="flex items-center justify-between mb-1">
                            <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">AI Usage</span>
                            <span className="text-[10px] text-blue-500 font-medium">Gemini Free</span>
                        </div>
                        <p className="text-[10px] text-slate-400">Unlimited (Fair Use)</p>
                    </div>
                );
            }
            if (rateLimit.provider === 'groq') {
                return (
                    <div className="px-3 py-2 mt-4 mx-3 bg-slate-100 dark:bg-white/5 rounded-xl border border-slate-200 dark:border-white/5">
                        <div className="flex items-center justify-between mb-1">
                            <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">AI Usage</span>
                            <span className="text-[10px] text-orange-500 font-medium">Groq Llama</span>
                        </div>
                        <p className="text-[10px] text-slate-400">Provider limit not exposed via headers.</p>
                    </div>
                );
            }
            return (
                <div className="px-3 py-2 mt-4 mx-3 bg-slate-100 dark:bg-white/5 rounded-xl border border-slate-200 dark:border-white/5">
                    <div className="flex items-center justify-between mb-1">
                        <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">AI Usage</span>
                        <span className="text-[10px] text-slate-500 font-medium">Provider Limit</span>
                    </div>
                    <p className="text-[10px] text-slate-400">Rate limit headers not available.</p>
                </div>
            );
        } else {
            // Standard rate limit counters
            const limit = Number(rateLimit.limit) || 1;
            const remaining = Number(rateLimit.remaining) || 0;
            const used = limit - remaining;
            percentage = Math.min(100, Math.max(0, (used / limit) * 100));

            label = `${used} / ${limit}`;

            if (percentage > 90) color = 'bg-red-500';
            else if (percentage > 75) color = 'bg-yellow-500';
            else color = 'bg-green-500';
        }
    }

    return (
        <div className="px-3 py-2 mt-4 mx-3 bg-slate-100 dark:bg-white/5 rounded-xl border border-slate-200 dark:border-white/5">
            <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">AI Requests</span>
                <span className="text-[10px] text-slate-600 dark:text-slate-300 font-mono">{label}</span>
            </div>

            <div className="h-1.5 w-full bg-slate-200 dark:bg-black/20 rounded-full overflow-hidden">
                <div
                    className={`h-full ${color} transition-all duration-500`}
                    style={{ width: `${percentage}%` }}
                />
            </div>

            {percentage > 90 && (
                <p className="text-[10px] text-red-500 mt-1 font-medium text-center">Limit near!</p>
            )}
        </div>
    );
}
