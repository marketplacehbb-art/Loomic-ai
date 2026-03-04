
import React, { useState, useRef, useEffect } from 'react';

interface ModelSelectorProps {
    value: 'gemini' | 'groq' | 'openai' | 'nvidia';
    onChange: (value: 'gemini' | 'groq' | 'openai' | 'nvidia') => void;
    disabled?: boolean;
}

const models = [
    {
        id: 'gemini',
        name: 'Gemini 2.0 Flash',
        icon: 'psychology',
        description: 'Multimodal, large context window',
        color: 'text-blue-500'
    },
    {
        id: 'groq',
        name: 'Llama 4 Maverick (Groq)',
        icon: 'bolt',
        description: 'Fastest inference, low latency',
        color: 'text-orange-500'
    },
    {
        id: 'openai',
        name: 'ChatGPT 4o',
        icon: 'auto_awesome',
        description: 'Most intelligent, reliable',
        color: 'text-green-500'
    },
    {
        id: 'nvidia',
        name: 'Qwen 3.5 397B (NVIDIA)',
        icon: 'memory',
        description: 'NVIDIA NIM (OpenAI-compatible API)',
        color: 'text-emerald-400'
    }
] as const;

export const ModelSelector: React.FC<ModelSelectorProps> = ({ value, onChange, disabled }) => {
    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    const selectedModel = models.find(m => m.id === value) || models[0];

    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
        };
    }, []);

    return (
        <div className="relative" ref={dropdownRef}>
            <button
                onClick={() => !disabled && setIsOpen(!isOpen)}
                disabled={disabled}
                className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded-xl border transition-all duration-200 ${isOpen
                    ? 'bg-white dark:bg-white/5 border-primary ring-1 ring-primary'
                    : 'bg-slate-50 dark:bg-white/5 border-slate-200 dark:border-white/10 hover:border-slate-300 dark:hover:border-white/20'
                    } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
            >
                <div className="flex items-center gap-2.5 min-w-0">
                    <div className={`w-6 h-6 rounded-md flex items-center justify-center shrink-0 ${selectedModel.color}`}>
                        <span className="material-icons-round text-base">{selectedModel.icon}</span>
                    </div>
                    <div className="flex flex-col items-start truncate">
                        <span className="text-xs font-semibold text-slate-700 dark:text-slate-200 truncate">
                            {selectedModel.name}
                        </span>
                    </div>
                </div>
                <span className={`material-icons-round text-slate-400 text-sm transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}>
                    expand_more
                </span>
            </button>

            {/* Dropdown Menu */}
            {isOpen && (
                <div className="absolute top-full left-0 right-0 mt-2 p-1 bg-white dark:bg-[#1e1e2e] rounded-xl border border-slate-200 dark:border-white/10 shadow-xl z-50 animate-in fade-in zoom-in-95 duration-150">
                    <div className="space-y-0.5">
                        {models.map((model) => (
                            <button
                                key={model.id}
                                onClick={() => {
                                    onChange(model.id as any);
                                    setIsOpen(false);
                                }}
                                className={`w-full flex items-center gap-3 p-2 rounded-lg transition-colors text-left ${value === model.id
                                    ? 'bg-primary/5 dark:bg-primary/20'
                                    : 'hover:bg-slate-50 dark:hover:bg-white/5'
                                    }`}
                            >
                                <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${model.color}`}>
                                    <span className="material-icons-round text-lg">{model.icon}</span>
                                </div>
                                <div className="flex flex-col min-w-0">
                                    <span className={`text-xs font-semibold ${value === model.id ? 'text-primary' : 'text-slate-700 dark:text-slate-200'
                                        }`}>
                                        {model.name}
                                    </span>
                                    <span className="text-[10px] text-slate-400 truncate">
                                        {model.description}
                                    </span>
                                </div>
                                {value === model.id && (
                                    <span className="material-icons-round text-primary text-sm ml-auto">check</span>
                                )}
                            </button>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};
