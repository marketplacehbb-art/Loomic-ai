import { useMemo } from 'react';

export type VisualWorkflowState = 'idle' | 'selecting' | 'selected' | 'review' | 'applying' | 'error';

export interface VisualPatchDiagnostics {
  phase: 'visual-intent' | 'inline-text' | 'chat-edit';
  code?: string;
  message: string;
  failedReasons?: Array<{ file: string; selector: string; reason: string }>;
  checkedPaths?: string[];
}

export interface VisualWorkflowInput {
  isVisualMode: boolean;
  isApplyingVisualPatch: boolean;
  loading: boolean;
  hasPendingPatch: boolean;
  hasError: boolean;
  reliableSelectionCount: number;
  isInspectMode: boolean;
}

export interface VisualWorkflowStatus {
  label: string;
  tone: string;
}

export const VISUAL_WORKFLOW_META: Record<VisualWorkflowState, VisualWorkflowStatus> = {
  idle: { label: 'Idle', tone: 'bg-slate-500/15 border-slate-400/30 text-slate-300' },
  selecting: { label: 'Selecting', tone: 'bg-indigo-500/15 border-indigo-400/30 text-indigo-300' },
  selected: { label: 'Selected', tone: 'bg-emerald-500/15 border-emerald-400/30 text-emerald-300' },
  review: { label: 'Review', tone: 'bg-cyan-500/15 border-cyan-400/30 text-cyan-300' },
  applying: { label: 'Applying', tone: 'bg-amber-500/15 border-amber-400/30 text-amber-300' },
  error: { label: 'Error', tone: 'bg-red-500/15 border-red-400/30 text-red-300' },
};

export const deriveVisualWorkflowState = (input: VisualWorkflowInput): VisualWorkflowState | null => {
  if (!input.isVisualMode) return null;
  if (input.isApplyingVisualPatch || input.loading) return 'applying';
  if (input.hasPendingPatch) return 'review';
  if (input.hasError) return 'error';
  if (input.reliableSelectionCount > 0) return 'selected';
  if (input.isInspectMode) return 'selecting';
  return 'idle';
};

export const useVisualWorkflow = (input: VisualWorkflowInput): {
  visualWorkflowState: VisualWorkflowState | null;
  visualStatus: VisualWorkflowStatus | null;
} => {
  const visualWorkflowState = useMemo(
    () => deriveVisualWorkflowState(input),
    [
      input.hasError,
      input.hasPendingPatch,
      input.isApplyingVisualPatch,
      input.isInspectMode,
      input.isVisualMode,
      input.loading,
      input.reliableSelectionCount,
    ]
  );
  const visualStatus = visualWorkflowState ? VISUAL_WORKFLOW_META[visualWorkflowState] : null;
  return { visualWorkflowState, visualStatus };
};
