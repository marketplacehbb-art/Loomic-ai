#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

/**
 * Changelog / Release notes generator from git history.
 * Supports conventional commits and simple fallback categorization.
 */

export const SECTION_ORDER = [
  'Features',
  'Fixes',
  'Performance',
  'Security',
  'Refactors',
  'Documentation',
  'Tests',
  'CI & Build',
  'Chores',
  'Other',
];

function parseArgs(argv) {
  const parsed = {};
  argv.forEach((arg) => {
    if (!arg.startsWith('--')) return;
    const eq = arg.indexOf('=');
    if (eq === -1) {
      parsed[arg.slice(2)] = 'true';
      return;
    }
    const key = arg.slice(2, eq);
    const value = arg.slice(eq + 1);
    parsed[key] = value;
  });
  return parsed;
}

function runGit(args, fallback = '') {
  const result = spawnSync('git', args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (result.status !== 0) {
    return fallback;
  }
  return String(result.stdout || '').trim();
}

function detectLatestTag() {
  const latest = runGit(['describe', '--tags', '--abbrev=0'], '');
  return latest || '';
}

function detectCurrentRef() {
  return runGit(['rev-parse', '--short', 'HEAD'], 'HEAD') || 'HEAD';
}

function normalizeCommitMessage(message) {
  return String(message || '').replace(/\s+/g, ' ').trim();
}

function stripConventionalPrefix(message) {
  return normalizeCommitMessage(message).replace(/^([a-z]+)(\([^)]+\))?(!)?:\s*/i, '');
}

export function classifyCommitMessage(message) {
  const normalized = normalizeCommitMessage(message);
  const lower = normalized.toLowerCase();
  const typeMatch = normalized.match(/^([a-z]+)(\([^)]+\))?(!)?:\s*/i);
  const type = typeMatch ? typeMatch[1].toLowerCase() : '';

  if (type === 'feat') return 'Features';
  if (type === 'fix') return 'Fixes';
  if (type === 'perf') return 'Performance';
  if (type === 'refactor') return 'Refactors';
  if (type === 'docs' || type === 'doc') return 'Documentation';
  if (type === 'test') return 'Tests';
  if (type === 'ci' || type === 'build') return 'CI & Build';
  if (type === 'chore') return 'Chores';
  if (type === 'sec' || type === 'security') return 'Security';

  if (/security|vuln|cve|xss|csrf|sql injection|auth harden/.test(lower)) return 'Security';
  if (/fix|bug|hotfix|patch/.test(lower)) return 'Fixes';
  if (/feature|add|implement/.test(lower)) return 'Features';
  if (/perf|optimi[sz]e|latency|speed/.test(lower)) return 'Performance';
  if (/refactor|cleanup|simplify/.test(lower)) return 'Refactors';
  if (/readme|doc/.test(lower)) return 'Documentation';
  if (/test|spec/.test(lower)) return 'Tests';
  if (/ci|pipeline|workflow|build/.test(lower)) return 'CI & Build';

  return 'Other';
}

function readCommits(fromRef, toRef, maxCount) {
  const args = ['log', '--no-merges', `--max-count=${maxCount}`, '--pretty=format:%h\t%s'];
  if (fromRef && toRef) {
    args.push(`${fromRef}..${toRef}`);
  } else if (toRef) {
    args.push(toRef);
  }

  const output = runGit(args, '');
  if (!output) return [];

  return output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [sha, ...rest] = line.split('\t');
      const subject = normalizeCommitMessage(rest.join('\t'));
      return { sha: String(sha || '').trim(), subject };
    })
    .filter((entry) => entry.sha && entry.subject);
}

export function buildReleaseNotes(input) {
  const title = String(input?.title || 'Release Notes').trim();
  const fromRef = String(input?.fromRef || '').trim();
  const toRef = String(input?.toRef || '').trim();
  const generatedAt = new Date().toISOString();
  const commits = Array.isArray(input?.commits) ? input.commits : [];

  const grouped = new Map();
  SECTION_ORDER.forEach((section) => grouped.set(section, []));

  commits.forEach((commit) => {
    const section = classifyCommitMessage(commit.subject);
    const list = grouped.get(section) || [];
    list.push(commit);
    grouped.set(section, list);
  });

  const lines = [];
  lines.push(`# ${title}`);
  lines.push('');
  lines.push(`- Generated: ${generatedAt}`);
  lines.push(`- Range: ${fromRef || '(repo start)'} -> ${toRef || '(HEAD)'}`);
  lines.push(`- Commits: ${commits.length}`);
  lines.push('');

  SECTION_ORDER.forEach((section) => {
    const entries = grouped.get(section) || [];
    if (entries.length === 0) return;

    lines.push(`## ${section}`);
    entries.forEach((entry) => {
      const cleaned = stripConventionalPrefix(entry.subject);
      lines.push(`- ${cleaned} (${entry.sha})`);
    });
    lines.push('');
  });

  if (commits.length === 0) {
    lines.push('## Notes');
    lines.push('- No commits found in selected range.');
    lines.push('');
  }

  return `${lines.join('\n')}\n`;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const outputPath = path.resolve(process.cwd(), String(args.output || 'RELEASE_NOTES.md'));
  const fromRef = String(args.from || '').trim() || detectLatestTag();
  const toRef = String(args.to || '').trim() || detectCurrentRef();
  const title = String(args.title || `Release ${toRef}`).trim();
  const maxCountRaw = Number.parseInt(String(args.max || '250'), 10);
  const maxCount = Number.isFinite(maxCountRaw) && maxCountRaw > 0 ? maxCountRaw : 250;

  const commits = readCommits(fromRef, toRef, maxCount);
  const markdown = buildReleaseNotes({
    title,
    fromRef,
    toRef,
    commits,
  });

  fs.writeFileSync(outputPath, markdown, 'utf8');
  console.log(`[release-notes] Wrote ${commits.length} commits to ${outputPath}`);
}

const isMain = path.resolve(process.argv[1] || '') === fileURLToPath(import.meta.url);
if (isMain) {
  main();
}
