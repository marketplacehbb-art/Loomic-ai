import { useState, useEffect } from 'react';

export function ThinkingProcess() {
    const [step, setStep] = useState(0);
    const steps = [
        { text: "Analyzing Request...", icon: "psychology" },
        { text: "Planning Architecture...", icon: "architecture" },
        { text: "Selecting Components...", icon: "widgets" },
        { text: "Generating Code...", icon: "code" },
        { text: "Finalizing...", icon: "check_circle" }
    ];

    useEffect(() => {
        const interval = setInterval(() => {
            setStep(prev => (prev < steps.length - 1 ? prev + 1 : prev));
        }, 2000); // Advance every 2 seconds

        return () => clearInterval(interval);
    }, [steps.length]);

    return (
        <div className="flex flex-col gap-2 p-4 bg-slate-50 dark:bg-white/5 rounded-2xl border border-slate-200 dark:border-white/5 max-w-[85%] animate-in fade-in slide-in-from-bottom-2">
            <div className="flex items-center gap-2 text-primary font-medium text-sm mb-2">
                <span className="relative flex h-3 w-3">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-3 w-3 bg-primary"></span>
                </span>
                AI is thinking...
            </div>

            <div className="space-y-3 pl-1">
                {steps.map((s, idx) => (
                    <div
                        key={idx}
                        className={`flex items-center gap-3 transition-opacity duration-500 ${idx <= step ? 'opacity-100' : 'opacity-30'
                            }`}
                    >
                        <div className={`w-6 h-6 rounded-full flex items-center justify-center border transition-colors duration-500 ${idx < step
                                ? 'bg-green-500 border-green-500 text-white'
                                : idx === step
                                    ? 'bg-primary border-primary text-white animate-pulse'
                                    : 'border-slate-300 dark:border-slate-600 text-slate-300 dark:text-slate-600'
                            }`}>
                            <span className="material-icons-round text-xs">
                                {idx < step ? 'check' : s.icon}
                            </span>
                        </div>
                        <span className={`text-sm ${idx === step
                                ? 'text-slate-900 dark:text-white font-medium'
                                : 'text-slate-500 dark:text-slate-400'
                            }`}>
                            {s.text}
                        </span>
                    </div>
                ))}
            </div>
        </div>
    );
}
