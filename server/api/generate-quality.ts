import { type QualityGateReport } from '../ai/project-pipeline/quality-gates.js';
import { type AutoRepairSummary } from './generate-auto-repair.js';

export type QualityStatus = 'excellent' | 'good' | 'needs_improvement' | 'critical';

export interface QualitySummary {
  score: number;
  grade: 'A' | 'B' | 'C' | 'D' | 'E';
  status: QualityStatus;
  pass: boolean;
  criticalCount: number;
  warningCount: number;
  topIssues: string[];
  recommendedAction?: string;
  repair: {
    attempted: boolean;
    applied: boolean;
    initialErrorCount: number;
    finalErrorCount: number;
    attemptsExecuted: number;
    abortedReason?: string;
  };
  critique?: {
    score: number;
    needsRepair: boolean;
    issueCount: number;
    criticalIssueCount: number;
  };
}

export interface OrchestratorCritiqueSnapshot {
  score?: number;
  needsRepair?: boolean;
  issues?: Array<{
    severity?: 'critical' | 'major' | 'minor';
  }>;
}

export function toQualityGrade(score: number): 'A' | 'B' | 'C' | 'D' | 'E' {
  if (score >= 90) return 'A';
  if (score >= 80) return 'B';
  if (score >= 70) return 'C';
  if (score >= 60) return 'D';
  return 'E';
}

function toQualityStatus(input: {
  score: number;
  pass: boolean;
  criticalCount: number;
  warningCount: number;
}): QualityStatus {
  if (input.criticalCount > 0 || input.score < 50) {
    return 'critical';
  }
  if (!input.pass || input.warningCount >= 3 || input.score < 70) {
    return 'needs_improvement';
  }
  if (input.score >= 85 && input.warningCount === 0) {
    return 'excellent';
  }
  return 'good';
}

export function buildQualitySummary(input: {
  qualityGate: QualityGateReport;
  autoRepair: AutoRepairSummary;
  critique?: OrchestratorCritiqueSnapshot | null;
}): QualitySummary {
  const criticalCount = input.qualityGate.findings.filter((finding) => finding.severity === 'critical').length;
  const warningCount = input.qualityGate.findings.filter((finding) => finding.severity === 'warning').length;
  const score = Math.max(0, Math.min(100, Math.round(input.qualityGate.overall)));
  const topIssues = input.qualityGate.findings
    .filter((finding) => finding.severity === 'critical' || finding.severity === 'warning')
    .slice(0, 3)
    .map((finding) => finding.message);

  const recommendedAction = (() => {
    if (criticalCount > 0) {
      const topCritical = input.qualityGate.findings.find((finding) => finding.severity === 'critical');
      return topCritical?.suggestion || 'Fix critical quality findings before publishing this result.';
    }
    if (input.autoRepair.attempted && !input.autoRepair.applied && input.autoRepair.finalErrorCount > 0) {
      return 'Validation repairs did not fully resolve issues. Retry with a narrower edit prompt or switch provider.';
    }
    if (!input.qualityGate.pass || warningCount > 0) {
      const topWarning = input.qualityGate.findings.find((finding) => finding.severity === 'warning');
      return topWarning?.suggestion || 'Address warning-level quality findings before shipping.';
    }
    return undefined;
  })();

  const critique = input.critique
    ? {
      score: typeof input.critique.score === 'number'
        ? Math.max(0, Math.min(100, Math.round(input.critique.score)))
        : 0,
      needsRepair: Boolean(input.critique.needsRepair),
      issueCount: Array.isArray(input.critique.issues) ? input.critique.issues.length : 0,
      criticalIssueCount: Array.isArray(input.critique.issues)
        ? input.critique.issues.filter((issue) => issue?.severity === 'critical').length
        : 0,
    }
    : undefined;

  return {
    score,
    grade: toQualityGrade(score),
    status: toQualityStatus({
      score,
      pass: input.qualityGate.pass,
      criticalCount,
      warningCount,
    }),
    pass: input.qualityGate.pass,
    criticalCount,
    warningCount,
    topIssues,
    recommendedAction,
    repair: {
      attempted: input.autoRepair.attempted,
      applied: input.autoRepair.applied,
      initialErrorCount: input.autoRepair.initialErrorCount,
      finalErrorCount: input.autoRepair.finalErrorCount,
      attemptsExecuted: input.autoRepair.attemptsExecuted,
      abortedReason: input.autoRepair.abortedReason,
    },
    critique,
  };
}
