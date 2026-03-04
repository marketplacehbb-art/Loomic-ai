import type { NextFunction, Request, Response } from 'express';

export type ReleaseMode = 'stable' | 'canary' | 'maintenance';
export type ReleaseTrack = 'stable' | 'canary' | 'blocked';

export interface ReleaseStatus {
  mode: ReleaseMode;
  killSwitch: boolean;
  canaryPercent: number;
  enforceCanary: boolean;
  version: string;
  updatedAt: string;
  reason?: string;
}

interface ReleaseConfig extends ReleaseStatus {
  salt: string;
  allowlistUserIds: Set<string>;
  denylistUserIds: Set<string>;
  adminToken: string;
}

export interface ReleaseDecision {
  allow: boolean;
  track: ReleaseTrack;
  reasonCode?: string;
  reason?: string;
  bucket: number;
}

function parseBoolean(input: unknown, fallback: boolean): boolean {
  if (typeof input === 'boolean') return input;
  const value = String(input ?? '').trim().toLowerCase();
  if (!value) return fallback;
  if (['1', 'true', 'yes', 'on'].includes(value)) return true;
  if (['0', 'false', 'no', 'off'].includes(value)) return false;
  return fallback;
}

function parsePercent(input: unknown, fallback: number): number {
  const value = Number.parseFloat(String(input ?? ''));
  if (!Number.isFinite(value)) return fallback;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function parseMode(input: unknown, fallback: ReleaseMode): ReleaseMode {
  const value = String(input ?? '').trim().toLowerCase();
  if (value === 'stable' || value === 'canary' || value === 'maintenance') return value;
  return fallback;
}

function parseIdSet(input: unknown): Set<string> {
  const raw = String(input ?? '').trim();
  if (!raw) return new Set<string>();
  const entries = raw
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  return new Set(entries);
}

function hashBucket(input: string): number {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash >>> 0) % 100;
}

function nowIso(): string {
  return new Date().toISOString();
}

function getIdentity(req: Request): { userId: string; identity: string } {
  const userId = String((req as any)?.authUser?.id || '').trim();
  if (userId) return { userId, identity: `user:${userId}` };
  const ip = String(req.ip || req.socket?.remoteAddress || 'unknown').trim() || 'unknown';
  return { userId: '', identity: `ip:${ip}` };
}

let releaseConfig: ReleaseConfig = {
  mode: parseMode(process.env.RELEASE_MODE, 'stable'),
  killSwitch: parseBoolean(process.env.RELEASE_KILL_SWITCH, false),
  canaryPercent: parsePercent(process.env.RELEASE_CANARY_PERCENT, 100),
  enforceCanary: parseBoolean(process.env.RELEASE_CANARY_ENFORCE, false),
  version: String(process.env.RELEASE_VERSION || process.env.npm_package_version || 'dev'),
  updatedAt: nowIso(),
  reason: undefined,
  salt: String(process.env.RELEASE_CANARY_SALT || 'ai-builder-release'),
  allowlistUserIds: parseIdSet(process.env.RELEASE_CANARY_ALLOWLIST_USER_IDS),
  denylistUserIds: parseIdSet(process.env.RELEASE_DENYLIST_USER_IDS),
  adminToken: String(process.env.RELEASE_ADMIN_TOKEN || '').trim(),
};

function sanitizeStatus(config: ReleaseConfig): ReleaseStatus {
  return {
    mode: config.mode,
    killSwitch: config.killSwitch,
    canaryPercent: config.canaryPercent,
    enforceCanary: config.enforceCanary,
    version: config.version,
    updatedAt: config.updatedAt,
    reason: config.reason,
  };
}

export function getReleaseStatus(): ReleaseStatus {
  return sanitizeStatus(releaseConfig);
}

export function updateReleaseConfig(input: {
  mode?: ReleaseMode;
  killSwitch?: boolean;
  canaryPercent?: number;
  enforceCanary?: boolean;
  reason?: string;
}): ReleaseStatus {
  releaseConfig = {
    ...releaseConfig,
    mode: typeof input.mode === 'string' ? parseMode(input.mode, releaseConfig.mode) : releaseConfig.mode,
    killSwitch:
      typeof input.killSwitch === 'boolean'
        ? input.killSwitch
        : releaseConfig.killSwitch,
    canaryPercent:
      typeof input.canaryPercent === 'number'
        ? parsePercent(input.canaryPercent, releaseConfig.canaryPercent)
        : releaseConfig.canaryPercent,
    enforceCanary:
      typeof input.enforceCanary === 'boolean'
        ? input.enforceCanary
        : releaseConfig.enforceCanary,
    reason:
      typeof input.reason === 'string' && input.reason.trim().length > 0
        ? input.reason.trim().slice(0, 180)
        : releaseConfig.reason,
    updatedAt: nowIso(),
  };
  return sanitizeStatus(releaseConfig);
}

export function evaluateReleaseDecision(req: Request): ReleaseDecision {
  const { userId, identity } = getIdentity(req);
  const bucket = hashBucket(`${releaseConfig.salt}:${identity}`);

  if (releaseConfig.killSwitch) {
    return {
      allow: false,
      track: 'blocked',
      reasonCode: 'RELEASE_KILL_SWITCH',
      reason: 'Release kill switch is active.',
      bucket,
    };
  }

  if (releaseConfig.mode === 'maintenance') {
    return {
      allow: false,
      track: 'blocked',
      reasonCode: 'RELEASE_MAINTENANCE',
      reason: 'Service is in maintenance mode.',
      bucket,
    };
  }

  if (userId && releaseConfig.denylistUserIds.has(userId)) {
    return {
      allow: false,
      track: 'blocked',
      reasonCode: 'RELEASE_DENYLIST',
      reason: 'User is blocked from current release channel.',
      bucket,
    };
  }

  if (releaseConfig.mode === 'stable') {
    return {
      allow: true,
      track: 'stable',
      bucket,
    };
  }

  const forcedCanary = userId && releaseConfig.allowlistUserIds.has(userId);
  const selectedCanary = forcedCanary || bucket < releaseConfig.canaryPercent;

  if (selectedCanary) {
    return {
      allow: true,
      track: 'canary',
      bucket,
    };
  }

  if (releaseConfig.enforceCanary) {
    return {
      allow: false,
      track: 'blocked',
      reasonCode: 'RELEASE_CANARY_NOT_SELECTED',
      reason: 'Request not selected for canary rollout.',
      bucket,
    };
  }

  return {
    allow: true,
    track: 'stable',
    bucket,
  };
}

function extractAdminToken(req: Request): string {
  const authHeader = String(req.header('authorization') || req.header('Authorization') || '').trim();
  const bearer = authHeader.match(/^Bearer\s+(.+)$/i)?.[1]?.trim() || '';
  if (bearer) return bearer;
  return String(req.header('x-release-admin-token') || '').trim();
}

export function verifyReleaseAdminToken(req: Request): boolean {
  const configured = String(releaseConfig.adminToken || '').trim();
  if (!configured) return false;
  const provided = extractAdminToken(req);
  return Boolean(provided && provided === configured);
}

export function releaseGate(req: Request, res: Response, next: NextFunction): void {
  const decision = evaluateReleaseDecision(req);
  res.setHeader('x-release-mode', releaseConfig.mode);
  res.setHeader('x-release-track', decision.track);
  res.setHeader('x-release-version', releaseConfig.version);

  (req as any).release = {
    ...decision,
    mode: releaseConfig.mode,
    version: releaseConfig.version,
  };

  if (!decision.allow) {
    res.status(503).json({
      success: false,
      error: decision.reason || 'Release gate blocked request',
      code: decision.reasonCode || 'RELEASE_BLOCKED',
      release: {
        mode: releaseConfig.mode,
        track: decision.track,
        version: releaseConfig.version,
      },
      retryable: true,
    });
    return;
  }

  next();
}
