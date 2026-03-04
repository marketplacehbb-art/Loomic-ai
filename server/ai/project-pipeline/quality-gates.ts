import { qualityScorer } from '../processor-evolution/quality-scorer.js';

export type GateSeverity = 'critical' | 'warning' | 'info';

export interface GateFinding {
  id: string;
  severity: GateSeverity;
  message: string;
  suggestion: string;
}

export interface QualityGateReport {
  pass: boolean;
  findings: GateFinding[];
  visual: {
    score: number;
    findings: GateFinding[];
  };
  accessibility: {
    score: number;
  };
  performance: {
    score: number;
  };
  overall: number;
}

function createFinding(
  id: string,
  severity: GateSeverity,
  message: string,
  suggestion: string
): GateFinding {
  return { id, severity, message, suggestion };
}

function runVisualQa(files: Record<string, string>, prompt: string): { score: number; findings: GateFinding[] } {
  const findings: GateFinding[] = [];
  const joined = Object.values(files).join('\n');
  const lowerPrompt = prompt.toLowerCase();
  const hasDomainIntent = /pizza|pizzeria|restaurant|food|menu|shop|store|ecommerce|checkout|cart|coffee|cafe/.test(lowerPrompt);

  if (/Feature 1|Feature 2|Feature 3|Lorem ipsum|Welcome to [A-Za-z]/.test(joined)) {
    findings.push(createFinding(
      'visual-generic-copy',
      'critical',
      'Generic placeholder copy detected in generated UI.',
      'Replace placeholders with domain-specific copy and concrete value propositions.'
    ));
  }

  if (
    hasDomainIntent &&
    /Design and launch polished products faster\.|Curated sections \+ AI customization\. Keep full control over code and structure\.|Go from idea to polished layout quickly\./.test(joined)
  ) {
    findings.push(createFinding(
      'visual-domain-mismatch-copy',
      'warning',
      'Domain prompt detected, but generated copy still contains generic template messaging.',
      'Rewrite hero/feature/footer copy with domain-specific language, offers, and CTA wording.'
    ));
  }

  const transitionCount = (joined.match(/\btransition(?:-[a-z]+)?\b/g) || []).length;
  if (transitionCount < 3) {
    findings.push(createFinding(
      'visual-motion-thin',
      'warning',
      'Very little motion utility usage detected.',
      'Add subtle transitions for buttons, cards and section reveals to increase polish.'
    ));
  }

  const accentPalette = (joined.match(/\b(?:bg|text|border)-(?:blue|indigo|cyan|slate)-\d{2,3}\b/g) || []).length;
  if (accentPalette > 40 && /modern|premium|beautiful|schön|schoen/.test(lowerPrompt)) {
    findings.push(createFinding(
      'visual-palette-monotony',
      'warning',
      'Palette appears repetitive for a premium/modern request.',
      'Introduce stronger palette contrast and distinct accent hierarchy.'
    ));
  }

  const explicitMultiPageIntent = /mehrere seiten|mehr seiten|multi-page|multipage|multi page|additional page|add page|another page|weitere seite|zusatzseite/.test(lowerPrompt);
  const routeSignalCount = [
    /\bproducts?\b/,
    /\bcheckout\b/,
    /\blogin\b/,
    /\bregister\b/,
    /\bpricing\b/,
    /\bfaq\b/,
    /\babout\b/,
    /\bcontact\b/,
    /\bdashboard\b/,
  ].reduce((count, pattern) => count + (pattern.test(lowerPrompt) ? 1 : 0), 0);
  const hasMultiPageIntent = explicitMultiPageIntent || routeSignalCount >= 2;
  const hasHashRouter = /\bHashRouter\b/.test(joined);
  const hasRoutePrimitives = /\bRoutes?\b/.test(joined);
  const hasBrowserRouter = /\bBrowserRouter\b/.test(joined);
  if (hasMultiPageIntent && (!hasRoutePrimitives || !hasHashRouter)) {
    findings.push(createFinding(
      'visual-routing-missing',
      'critical',
      'Prompt indicates multi-page intent but HashRouter + route primitives are missing.',
      'Use HashRouter + Routes/Route + navigation links for all requested pages.'
    ));
  }
  if (hasBrowserRouter) {
    findings.push(createFinding(
      'visual-routing-browserrouter-incompatible',
      'critical',
      'BrowserRouter detected in generated project; preview iframe requires HashRouter.',
      'Replace BrowserRouter with HashRouter to ensure route rendering in generator preview.'
    ));
  }

  const critical = findings.filter((finding) => finding.severity === 'critical').length;
  const warning = findings.filter((finding) => finding.severity === 'warning').length;
  const score = Math.max(0, 100 - (critical * 35 + warning * 12));

  return { score, findings };
}

export async function evaluateQualityGates(input: {
  files: Record<string, string>;
  primaryPath?: string;
  prompt: string;
}): Promise<QualityGateReport> {
  const primaryPath = input.primaryPath || 'src/App.tsx';
  const primaryCode = input.files[primaryPath] || input.files['src/App.tsx'] || Object.values(input.files)[0] || '';
  const staticScore = await qualityScorer.score(primaryCode, primaryPath.replace(/^src\//, '') || 'App.tsx');
  const visual = runVisualQa(input.files, input.prompt);

  const findings: GateFinding[] = [
    ...visual.findings,
  ];

  if (staticScore.metrics.accessibility < 55) {
    findings.push(createFinding(
      'a11y-low-score',
      'warning',
      `Accessibility score is low (${staticScore.metrics.accessibility}).`,
      'Increase semantic HTML, labels/alt text, and keyboard-friendly interaction patterns.'
    ));
  }

  if (staticScore.metrics.performance < 55) {
    findings.push(createFinding(
      'perf-low-score',
      'warning',
      `Performance score is low (${staticScore.metrics.performance}).`,
      'Reduce heavy re-renders, large inline structures and repeated expensive patterns.'
    ));
  }

  const criticalCount = findings.filter((finding) => finding.severity === 'critical').length;
  const warningCount = findings.filter((finding) => finding.severity === 'warning').length;
  const overall = Math.max(0, Math.round((visual.score * 0.45) + (staticScore.overall * 0.35) + (staticScore.metrics.accessibility * 0.1) + (staticScore.metrics.performance * 0.1)));
  const pass = criticalCount === 0 && overall >= 58;

  if (!pass && criticalCount === 0) {
    findings.push(createFinding(
      'quality-gate-soft-fail',
      'info',
      'Quality gate soft fail due to low overall polish score.',
      'Improve typography hierarchy, spacing rhythm and interaction quality before publishing.'
    ));
  }

  return {
    pass,
    findings,
    visual,
    accessibility: { score: staticScore.metrics.accessibility },
    performance: { score: staticScore.metrics.performance },
    overall,
  };
}
