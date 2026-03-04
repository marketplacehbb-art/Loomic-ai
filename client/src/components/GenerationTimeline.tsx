import { useEffect, useMemo, useState } from 'react';
import {
  Brain,
  CheckCircle2,
  Package,
  Palette,
  Sparkles,
  Wrench,
  X,
  XCircle,
  Zap,
  type LucideIcon,
} from 'lucide-react';

export type TimelineStepStatus = 'pending' | 'active' | 'done' | 'failed';

export interface TimelineStepState {
  status: TimelineStepStatus;
  durationMs: number | null;
}

const STEP_DEFINITIONS: Array<{ label: string; icon: LucideIcon }> = [
  { label: 'Analyzing prompt...', icon: Zap },
  { label: 'Selecting design patterns...', icon: Palette },
  { label: 'Generating components...', icon: Brain },
  { label: 'Processing & validating code...', icon: Wrench },
  { label: 'Bundling...', icon: Package },
  { label: 'Ready!', icon: Sparkles },
];

export const TIMELINE_STEP_COUNT = STEP_DEFINITIONS.length;
export const TIMELINE_BUNDLING_INDEX = TIMELINE_STEP_COUNT - 2;
export const TIMELINE_READY_INDEX = TIMELINE_STEP_COUNT - 1;

export const createInitialTimelineState = (): TimelineStepState[] =>
  STEP_DEFINITIONS.map((_, index) => ({
    status: index === 0 ? 'active' : 'pending',
    durationMs: null,
  }));

interface GenerationTimelineProps {
  open: boolean;
  steps: TimelineStepState[];
  currentStepIndex: number;
  startedAt: number | null;
  activeStepStartedAt: number | null;
  running: boolean;
  onClose: () => void;
}

const formatDuration = (ms: number | null): string => {
  if (typeof ms !== 'number' || Number.isNaN(ms)) return '--';
  if (ms < 1_000) return `${Math.max(0, Math.round(ms))}ms`;
  if (ms < 10_000) return `${(ms / 1_000).toFixed(1)}s`;
  return `${Math.round(ms / 1_000)}s`;
};

export default function GenerationTimeline({
  open,
  steps,
  currentStepIndex,
  startedAt,
  activeStepStartedAt,
  running,
  onClose,
}: GenerationTimelineProps) {
  const [now, setNow] = useState(() => Date.now());
  const hasActiveStep = useMemo(() => steps.some((step) => step.status === 'active'), [steps]);

  useEffect(() => {
    if (!open) return;
    setNow(Date.now());
    if (!running && !hasActiveStep) return;
    const timer = window.setInterval(() => {
      setNow(Date.now());
    }, 250);
    return () => window.clearInterval(timer);
  }, [hasActiveStep, open, running]);

  const elapsedMs = startedAt ? Math.max(0, now - startedAt) : 0;
  const safeStepIndex = Math.max(0, Math.min(currentStepIndex, TIMELINE_READY_INDEX));
  const fallbackStep = STEP_DEFINITIONS[safeStepIndex];
  const failedIndex = steps.findIndex((step) => step.status === 'failed');
  const activeIndex = steps.findIndex((step) => step.status === 'active');

  const currentStepLabel = failedIndex >= 0
    ? `Failed at: ${STEP_DEFINITIONS[failedIndex].label}`
    : activeIndex >= 0
      ? STEP_DEFINITIONS[activeIndex].label
      : fallbackStep.label;

  return (
    <div
      className={`pointer-events-none fixed right-0 top-0 z-50 h-full w-80 transform transition-transform duration-300 ${open ? 'translate-x-0' : 'translate-x-full'}`}
      aria-hidden={!open}
    >
      <aside className="pointer-events-auto flex h-full w-full flex-col border-l border-slate-700 bg-slate-900 shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-700 px-4 py-4">
          <h3 className="text-sm font-semibold tracking-wide text-slate-100">Building your app...</h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1.5 text-slate-400 transition-colors hover:bg-slate-800 hover:text-slate-100"
            aria-label="Close generation timeline"
            title="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-5">
          <ul className="space-y-4">
            {STEP_DEFINITIONS.map((definition, index) => {
              const step = steps[index] ?? { status: 'pending' as TimelineStepStatus, durationMs: null };
              const Icon = definition.icon;
              const liveDuration = step.status === 'active' && activeStepStartedAt
                ? Math.max(0, now - activeStepStartedAt)
                : step.durationMs;

              const tone = step.status === 'done'
                ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300'
                : step.status === 'active'
                  ? 'border-purple-500/60 bg-purple-500/15 text-purple-300'
                  : step.status === 'failed'
                    ? 'border-rose-500/50 bg-rose-500/15 text-rose-300'
                    : 'border-slate-700 bg-slate-800/50 text-slate-400';

              return (
                <li key={definition.label} className="relative pl-12">
                  {index < TIMELINE_READY_INDEX && (
                    <span className="absolute left-[15px] top-8 h-8 w-px bg-slate-700" />
                  )}
                  <div className={`absolute left-0 top-0 flex h-8 w-8 items-center justify-center rounded-full border ${tone}`}>
                    {step.status === 'done' ? (
                      <CheckCircle2 className="h-4 w-4" />
                    ) : step.status === 'failed' ? (
                      <XCircle className="h-4 w-4" />
                    ) : (
                      <Icon className={`h-4 w-4 ${step.status === 'active' ? 'animate-pulse' : ''}`} />
                    )}
                  </div>

                  <div className="flex items-start justify-between gap-2 pt-1">
                    <p className={`text-sm ${step.status === 'pending' ? 'text-slate-400' : 'text-slate-100'}`}>
                      {definition.label}
                    </p>
                    <span className="shrink-0 text-[11px] text-slate-500">
                      {formatDuration(liveDuration)}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>

        <div className="border-t border-slate-700 px-4 py-3">
          <p className="truncate text-xs text-slate-300">{currentStepLabel}</p>
          <p className="mt-1 text-[11px] text-slate-500">Elapsed: {formatDuration(elapsedMs)}</p>
        </div>
      </aside>
    </div>
  );
}
