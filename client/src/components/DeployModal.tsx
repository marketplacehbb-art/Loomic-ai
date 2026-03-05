import React from 'react';

export type DeployProgressStep = 'idle' | 'preparing' | 'uploading' | 'building' | 'live' | 'error';

interface DeployModalProps {
  projectId?: string;
  busy: boolean;
  step: DeployProgressStep;
  deploymentUrl?: string | null;
  lastDeployAt?: string | null;
  error?: string | null;
  onDeploy: () => Promise<void> | void;
}

const steps = [
  'Preparing files...',
  'Uploading to Vercel...',
  'Building...',
  'Live!',
] as const;

const resolveStepIndex = (step: DeployProgressStep): number => {
  if (step === 'preparing') return 0;
  if (step === 'uploading') return 1;
  if (step === 'building') return 2;
  if (step === 'live') return 3;
  if (step === 'error') return 2;
  return -1;
};

const DeployModal: React.FC<DeployModalProps> = ({
  projectId,
  busy,
  step,
  deploymentUrl,
  lastDeployAt,
  error,
  onDeploy,
}) => {
  const activeIndex = resolveStepIndex(step);
  const canDeploy = Boolean(projectId) && !busy;
  const isLive = step === 'live' || Boolean(deploymentUrl);

  return (
    <div className="rounded-xl border border-blue-400/20 bg-blue-500/[0.07] p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.16em] text-blue-200/80">Vercel Deploy</p>
          <p className="mt-1 text-sm text-slate-300">One-click deployment for this project.</p>
          {lastDeployAt && (
            <p className="mt-1 text-xs text-slate-400">Last deploy: {new Date(lastDeployAt).toLocaleString()}</p>
          )}
        </div>
        <button
          onClick={() => void Promise.resolve(onDeploy())}
          disabled={!canDeploy}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-500 disabled:opacity-45"
        >
          {busy ? 'Deploying...' : 'Deploy to Vercel'}
        </button>
      </div>

      <div className="mt-4 grid gap-2">
        {steps.map((label, index) => {
          const done = activeIndex > index || (isLive && index <= 3);
          const active = activeIndex === index && !isLive;
          return (
            <div
              key={label}
              className={`flex items-center gap-2 rounded-lg border px-2.5 py-2 text-xs ${
                done
                  ? 'border-emerald-400/35 bg-emerald-500/10 text-emerald-200'
                  : active
                    ? 'border-blue-400/35 bg-blue-500/10 text-blue-200'
                    : 'border-white/10 bg-black/15 text-slate-400'
              }`}
            >
              <span
                className={`inline-block h-2 w-2 rounded-full ${
                  done ? 'bg-emerald-300' : active ? 'bg-blue-300 animate-pulse' : 'bg-slate-600'
                }`}
              />
              {label}
            </div>
          );
        })}
      </div>

      {deploymentUrl && (
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
          <a
            href={deploymentUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold text-blue-300 underline"
          >
            {deploymentUrl}
          </a>
          <button
            onClick={() => void navigator.clipboard?.writeText(deploymentUrl)}
            className="rounded-lg border border-white/20 px-2 py-1 font-semibold text-slate-200 transition hover:bg-white/10"
          >
            Copy URL
          </button>
        </div>
      )}

      {error && (
        <div className="mt-3 rounded-lg border border-rose-500/35 bg-rose-500/10 px-2.5 py-2 text-xs text-rose-200">
          {error}
        </div>
      )}
    </div>
  );
};

export default DeployModal;
