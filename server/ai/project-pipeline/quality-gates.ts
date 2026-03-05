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

  const interactiveElementsCount =
    (joined.match(/<button\b/g) || []).length +
    (joined.match(/<a\b/g) || []).length +
    (joined.match(/onClick=\{/g) || []).length;
  const hoverUtilitiesCount = (joined.match(/\bhover:[^'"`\s}]+/g) || []).length;
  const hasHoverStates = hoverUtilitiesCount >= Math.max(3, Math.floor(interactiveElementsCount * 0.6));
  const hasAnyHoverState = hoverUtilitiesCount > 0;

  const hasUnsplashImageUrls = /https:\/\/images\.unsplash\.com\/photo-[^\s"'`)\]]+/i.test(joined);
  const hasLoadingStates =
    /\bloading\b/i.test(joined) &&
    (/\bif\s*\(\s*loading\s*\)/.test(joined) || /animate-spin/.test(joined) || /loading\s*\?\s*</i.test(joined));
  const hasEmptyStates =
    (/\.length\s*===\s*0/.test(joined) || /\.length\s*<\s*1/.test(joined)) &&
    /\b(no|empty)\b[\w\s-]{0,30}\b(yet|available|found)\b/i.test(joined);
  const sectionTagCount = (joined.match(/<section\b/g) || []).length;
  const sectionFileCount = Object.keys(files)
    .map((path) => String(path || '').replace(/\\/g, '/'))
    .filter((path) => path.startsWith('src/components/sections/') && /\.(tsx|jsx)$/.test(path))
    .length;
  const hasAtLeastFiveSections = Math.max(sectionTagCount, sectionFileCount) >= 5;

  const hasCustomHooksForData =
    Object.keys(files)
      .map((path) => String(path || '').replace(/\\/g, '/'))
      .some((path) => /^src\/hooks\/use[A-Za-z0-9_-]+\.tsx?$/.test(path)) &&
    (/supabase\.from\(/.test(joined) || /use[A-Z][A-Za-z0-9_]*\(/.test(joined));

  const hasHardcodedDataArrays =
    /(?:const|let)\s+[A-Za-z_$][A-Za-z0-9_$]*\s*=\s*\[\s*\{[\s\S]{0,900}\}\s*(?:,\s*\{[\s\S]{0,900}\}\s*)+\]/.test(joined) &&
    !/supabase\.from\(/.test(joined);
  const hasPlaceholderText = /\b(?:lorem ipsum|your title here|placeholder text|insert text here|your subtitle here|feature 1|feature 2|feature 3)\b/i.test(joined);
  const hasResponsiveClasses = /\b(?:sm|md|lg|xl|2xl):[a-z]/.test(joined);

  let adjustment = 0;
  if (hasUnsplashImageUrls) {
    adjustment += 10;
  } else {
    findings.push(createFinding(
      'visual-unsplash-missing',
      'warning',
      'No real Unsplash image URLs detected.',
      'Use concrete Unsplash photo URLs relevant to the prompt domain.'
    ));
  }

  if (hasHoverStates) {
    adjustment += 10;
  }
  if (!hasAnyHoverState || !hasHoverStates) {
    adjustment -= 10;
    findings.push(createFinding(
      'visual-hover-missing',
      'warning',
      'Hover states are missing or too sparse for interactive elements.',
      'Add hover states consistently to buttons, links, cards, and interactive UI elements.'
    ));
  }

  if (hasLoadingStates) {
    adjustment += 10;
  } else {
    findings.push(createFinding(
      'visual-loading-state-missing',
      'warning',
      'No explicit loading states detected for async UI.',
      'Add loading states (e.g., loading flags with spinner or placeholder) for async operations.'
    ));
  }

  if (hasEmptyStates) {
    adjustment += 10;
  } else {
    findings.push(createFinding(
      'visual-empty-state-missing',
      'warning',
      'No explicit empty states detected for list/data views.',
      'Add clear empty-state UI when data arrays are empty.'
    ));
  }

  if (hasAtLeastFiveSections) {
    adjustment += 10;
  } else {
    findings.push(createFinding(
      'visual-sections-thin',
      'warning',
      'Fewer than 5 sections detected in generated layout.',
      'Expand the page with additional meaningful sections to improve visual richness.'
    ));
  }

  if (hasCustomHooksForData) {
    adjustment += 10;
  } else {
    findings.push(createFinding(
      'visual-hooks-missing',
      'warning',
      'Custom hooks for data access were not detected.',
      'Use dedicated hooks in src/hooks for data fetching/mutation instead of inline data handling.'
    ));
  }

  if (hasHardcodedDataArrays) {
    adjustment -= 20;
    findings.push(createFinding(
      'visual-hardcoded-data',
      'critical',
      'Hardcoded data arrays detected in generated code.',
      'Replace hardcoded arrays with Supabase-driven hooks or API-backed data sources.'
    ));
  }

  if (hasPlaceholderText) {
    adjustment -= 20;
    findings.push(createFinding(
      'visual-placeholder-penalty',
      'critical',
      'Placeholder text detected in generated UI.',
      'Replace all placeholder text with concrete, domain-specific production content.'
    ));
  }

  if (!hasResponsiveClasses) {
    adjustment -= 20;
    findings.push(createFinding(
      'visual-responsive-missing',
      'critical',
      'Responsive breakpoint classes are missing.',
      'Add mobile-first responsive Tailwind classes (md:, lg:, etc.) across layout and typography.'
    ));
  }

  const critical = findings.filter((finding) => finding.severity === 'critical').length;
  const warning = findings.filter((finding) => finding.severity === 'warning').length;
  const baselineScore = Math.max(0, 100 - (critical * 35 + warning * 12));
  const score = Math.max(0, Math.min(100, baselineScore + adjustment));

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
  const pass = criticalCount === 0 && overall >= 60;

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
