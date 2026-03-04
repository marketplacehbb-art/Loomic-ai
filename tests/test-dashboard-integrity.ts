import fs from 'node:fs';
import path from 'node:path';

type Check = {
  name: string;
  pass: boolean;
  details?: string;
};

const repoRoot = process.cwd();

const read = (relativePath: string) =>
  fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');

const checks: Check[] = [];

const dashboardSource = read('client/src/pages/Dashboard.tsx');
checks.push({
  name: 'Dashboard no longer toggles dark mode via raw DOM classList',
  pass: !dashboardSource.includes("document.documentElement.classList.toggle('dark')"),
});
checks.push({
  name: 'Dashboard uses ThemeContext toggleTheme',
  pass: dashboardSource.includes('const { toggleTheme } = useTheme()'),
});
checks.push({
  name: 'Dashboard includes explicit empty state content',
  pass: dashboardSource.includes('No projects yet'),
});
checks.push({
  name: 'Dashboard uses publishedCount state for published metric',
  pass: dashboardSource.includes('publishedCount'),
});

const apiSource = read('client/src/lib/api.ts');
checks.push({
  name: 'API exposes getProjectStats for global published count',
  pass: apiSource.includes('async getProjectStats()'),
});
checks.push({
  name: 'Usage history keeps details object contract',
  pass: apiSource.includes('details: (log.details as any) || {}'),
});

const metricsSource = read('client/src/components/MetricsWidget.tsx');
checks.push({
  name: 'Metrics widget extracts provider robustly',
  pass: metricsSource.includes('const extractProvider = (log: any) => {'),
});
checks.push({
  name: 'Metrics widget extracts token count robustly',
  pass: metricsSource.includes('const extractTokenCount = (log: any) => {'),
});

const sourceControlSource = read('client/src/pages/SourceControl.tsx');
checks.push({
  name: 'Source Control resolves project id from query/storage',
  pass: sourceControlSource.includes('const projectId = useMemo(() => {'),
});
checks.push({
  name: 'Source Control does not persist push token in localStorage',
  pass: !sourceControlSource.includes("localStorage.setItem('git_push_token'"),
});
checks.push({
  name: 'Source Control binds git status to projectId',
  pass: sourceControlSource.includes('api.git.status(projectId)'),
});
checks.push({
  name: 'Source Control binds git commit to projectId',
  pass: sourceControlSource.includes('api.git.commit(commitMessage, projectId)'),
});
checks.push({
  name: 'Source Control binds git push to projectId',
  pass: sourceControlSource.includes('api.git.push(remoteUrl || \'origin\', branch, pushToken, projectId)'),
});

console.log('\nStarting Dashboard Integrity Tests...\n');
let failures = 0;
for (const check of checks) {
  if (check.pass) {
    console.log(`PASS: ${check.name}`);
  } else {
    failures += 1;
    console.error(`FAIL: ${check.name}`);
    if (check.details) {
      console.error(`  ${check.details}`);
    }
  }
}

if (failures > 0) {
  process.exitCode = 1;
  console.error(`\nDashboard integrity failed with ${failures} issue(s).`);
} else {
  console.log('\nAll dashboard integrity checks passed.');
}
