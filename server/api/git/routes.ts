import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { GitManager } from './git.js';
import { sanitizeErrorForLog, sanitizeErrorMessage } from '../../utils/error-sanitizer.js';
import type { AuthenticatedRequest } from '../../middleware/auth.js';
import {
    getGitHubConnectionStatus,
    getGitHubConnectionWithToken,
    loadProjectFilesForGitHubPush,
    normalizeGitHubFilePath,
    saveGitHubConnection,
    verifyGitHubProjectOwnership,
} from './github-integration.js';

const router = Router();

const MAX_FILE_COUNT = 1000;
const MAX_FILE_BYTES = 300_000;
const MAX_TOTAL_FILE_BYTES = 8_000_000;

const isSafeWorkspacePath = (value: string): boolean => {
    const normalized = String(value || '').trim();
    if (!normalized) return false;
    if (normalized.includes('\0')) return false;
    if (normalized.startsWith('/') || normalized.startsWith('\\')) return false;
    if (/^[A-Za-z]:[\\/]/.test(normalized)) return false;
    const segments = normalized.split(/[\\/]+/).filter(Boolean);
    if (segments.length === 0) return false;
    if (segments.some((segment) => segment === '..')) return false;
    return true;
};

const projectIdSchema = z.string()
    .trim()
    .min(1)
    .max(128)
    .regex(/^[A-Za-z0-9._:-]+$/, 'Invalid projectId format');

const fileMapSchema = z.record(z.string(), z.string()).superRefine((files, ctx) => {
    const entries = Object.entries(files || {});
    if (entries.length > MAX_FILE_COUNT) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Too many files (max ${MAX_FILE_COUNT})`,
        });
        return;
    }

    let totalBytes = 0;
    for (const [path, content] of entries) {
        const normalizedPath = String(path || '').trim();
        if (!isSafeWorkspacePath(normalizedPath)) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: `Unsafe file path: ${normalizedPath || '<empty>'}`,
                path: [path],
            });
            continue;
        }

        const size = Buffer.byteLength(String(content || ''), 'utf8');
        if (size > MAX_FILE_BYTES) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: `File too large: ${normalizedPath} (${size} bytes, max ${MAX_FILE_BYTES})`,
                path: [path],
            });
        }
        totalBytes += size;
    }

    if (totalBytes > MAX_TOTAL_FILE_BYTES) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Total file payload too large (${totalBytes} bytes, max ${MAX_TOTAL_FILE_BYTES})`,
        });
    }
});

const gitInitBodySchema = z.object({
    projectId: projectIdSchema.optional(),
    files: fileMapSchema.optional(),
}).strict();

const gitStatusBodySchema = z.object({
    projectId: projectIdSchema.optional(),
}).strict();

const gitCommitBodySchema = z.object({
    projectId: projectIdSchema.optional(),
    message: z.string().trim().min(1, 'Missing message').max(300, 'Commit message too long'),
    files: fileMapSchema.optional(),
}).strict();

const gitHistoryBodySchema = z.object({
    projectId: projectIdSchema.optional(),
}).strict();

const gitBranchesBodySchema = z.object({
    projectId: projectIdSchema.optional(),
}).strict();

const gitCheckoutBodySchema = z.object({
    projectId: projectIdSchema.optional(),
    branch: z.string().trim().min(1, 'Missing branch').max(120),
    create: z.boolean().optional(),
}).strict();

const gitAddBodySchema = z.object({
    projectId: projectIdSchema.optional(),
    files: z.union([
        z.string().trim().min(1).max(240),
        z.array(z.string().trim().min(1).max(240)).min(1).max(200),
    ]).optional(),
}).strict();

const gitPushBodySchema = z.object({
    projectId: projectIdSchema.optional(),
    remote: z.string().trim().min(1).max(512),
    branch: z.string().trim().min(1, 'Missing branch').max(120),
    token: z.string().trim().min(1).max(4096).optional(),
}).strict();

const gitHubConnectBodySchema = z.object({
    projectId: projectIdSchema,
    token: z.string().trim().min(1, 'Missing token').max(4096),
}).strict();

const gitHubPushBodySchema = z.object({
    projectId: projectIdSchema,
    repoName: z.string()
        .trim()
        .min(1, 'Missing repoName')
        .max(120)
        .regex(/^[A-Za-z0-9._-]+$/, 'Invalid repoName'),
    createNew: z.boolean(),
    commitMessage: z.string().trim().min(1).max(220).optional(),
}).strict();

const gitHubStatusQuerySchema = z.object({
    projectId: projectIdSchema,
}).strict();

export const gitRouteSchemas = {
    init: gitInitBodySchema,
    status: gitStatusBodySchema,
    githubStatus: gitHubStatusQuerySchema,
    connect: gitHubConnectBodySchema,
    commit: gitCommitBodySchema,
    history: gitHistoryBodySchema,
    branches: gitBranchesBodySchema,
    checkout: gitCheckoutBodySchema,
    add: gitAddBodySchema,
    push: gitPushBodySchema,
    githubPush: gitHubPushBodySchema,
};

const resolveProjectId = (req: any): string => {
    const bodyProjectId = typeof req.body?.projectId === 'string' ? req.body.projectId.trim() : '';
    if (bodyProjectId) return bodyProjectId;
    const authUserId = typeof req.authUser?.id === 'string' ? req.authUser.id.trim() : '';
    return authUserId ? `user-${authUserId}` : 'default';
};

function respondValidationError(res: Response, error: z.ZodError) {
    return res.status(400).json({
        success: false,
        error: 'Invalid request payload',
        details: error.issues.map((issue) => ({
            path: issue.path.join('.'),
            message: issue.message,
        })),
    });
}

function parseBody<T extends z.ZodTypeAny>(
    schema: T,
    req: Request,
    res: Response
): z.infer<T> | null {
    const parsed = schema.safeParse(req.body || {});
    if (!parsed.success) {
        respondValidationError(res, parsed.error);
        return null;
    }
    return parsed.data;
}

function respondGitError(res: any, error: unknown, fallback: string) {
    console.error('[Git API] Error:', {
        message: sanitizeErrorForLog(error),
    });
    return res.status(500).json({
        success: false,
        error: sanitizeErrorMessage(error, { fallback, maxLength: 220 }),
    });
}

const resolveAuthUserId = (req: Request): string => {
    const authReq = req as AuthenticatedRequest;
    const userId = typeof authReq.authUser?.id === 'string' ? authReq.authUser.id.trim() : '';
    return userId;
};

function parseQuery<T extends z.ZodTypeAny>(
    schema: T,
    req: Request,
    res: Response
): z.infer<T> | null {
    const parsed = schema.safeParse(req.query || {});
    if (!parsed.success) {
        respondValidationError(res, parsed.error);
        return null;
    }
    return parsed.data;
}

const GITHUB_API_BASE = 'https://api.github.com';

const buildGitHubHeaders = (token: string): Record<string, string> => ({
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${token}`,
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'AI-Builder-GitHub-Sync',
});

const encodeGitHubPath = (filePath: string): string =>
    filePath
        .split('/')
        .map((segment) => encodeURIComponent(segment))
        .join('/');

async function readGitHubErrorMessage(response: globalThis.Response): Promise<string> {
    const payload = await response.json().catch(() => null);
    const message = typeof payload?.message === 'string' ? payload.message.trim() : '';
    const suffix = message ? `: ${message}` : '';
    return `GitHub API ${response.status}${suffix}`;
}

// Middleware to ensure project exists? 
// For now, we trust the client sends a valid project_id which maps to a folder.

// POST /api/git/init
router.post('/init', async (req, res) => {
    try {
        const parsed = parseBody(gitInitBodySchema, req, res);
        if (!parsed) return;
        const { files } = parsed;
        const projectId = resolveProjectId(req);

        const git = new GitManager(projectId);

        // If files provided, sync them first
        if (files) {
            await git.syncFiles(files);
        }

        // Init is handled in ensureRepo called by other methods, but we can force it
        // Actually GitManager.ensureRepo() handles init.
        // Let's explicitly sync.

        res.json({ success: true, message: 'Repo initialized' });
    } catch (error: any) {
        return respondGitError(res, error, 'Failed to initialize repository');
    }
});

// POST /api/git/connect
router.post('/connect', async (req, res) => {
    try {
        const parsed = parseBody(gitHubConnectBodySchema, req, res);
        if (!parsed) return;

        const userId = resolveAuthUserId(req);
        if (!userId) {
            return res.status(401).json({ success: false, error: 'Unauthorized' });
        }

        const isOwner = await verifyGitHubProjectOwnership(parsed.projectId, userId);
        if (!isOwner) {
            return res.status(403).json({ success: false, error: 'Project access denied' });
        }

        const validation = await fetch(`${GITHUB_API_BASE}/user`, {
            method: 'GET',
            headers: buildGitHubHeaders(parsed.token),
        });
        if (!validation.ok) {
            const message = await readGitHubErrorMessage(validation);
            return res.status(validation.status === 401 ? 401 : 400).json({
                success: false,
                error: `GitHub token validation failed (${message})`,
            });
        }

        const userPayload = await validation.json().catch(() => ({} as any));
        const username = typeof userPayload?.login === 'string' ? userPayload.login.trim() : '';
        if (!username) {
            return res.status(400).json({
                success: false,
                error: 'GitHub token validated but username is unavailable',
            });
        }

        await saveGitHubConnection({
            userId,
            projectId: parsed.projectId,
            token: parsed.token,
            username,
            connected: true,
        });

        return res.json({
            connected: true,
            username,
        });
    } catch (error: any) {
        return respondGitError(res, error, 'Failed to connect GitHub');
    }
});

// GET /api/git/status (GitHub sync state)
router.get('/status', async (req, res) => {
    try {
        const parsed = parseQuery(gitHubStatusQuerySchema, req, res);
        if (!parsed) return;

        const userId = resolveAuthUserId(req);
        if (!userId) {
            return res.status(401).json({ success: false, error: 'Unauthorized' });
        }

        const isOwner = await verifyGitHubProjectOwnership(parsed.projectId, userId);
        if (!isOwner) {
            return res.status(403).json({ success: false, error: 'Project access denied' });
        }

        const status = await getGitHubConnectionStatus(userId, parsed.projectId);
        return res.json({
            connected: status.connected,
            repoUrl: status.repoUrl,
            lastSync: status.lastSync,
            username: status.username,
        });
    } catch (error: any) {
        return respondGitError(res, error, 'Failed to load GitHub sync status');
    }
});

// POST /api/git/status
router.post('/status', async (req, res) => {
    try {
        const parsed = parseBody(gitStatusBodySchema, req, res);
        if (!parsed) return;
        const projectId = resolveProjectId(req);

        const git = new GitManager(projectId);
        const status = await git.status();

        res.json({ success: true, status });
    } catch (error: any) {
        return respondGitError(res, error, 'Failed to read git status');
    }
});

// POST /api/git/commit
router.post('/commit', async (req, res) => {
    try {
        const parsed = parseBody(gitCommitBodySchema, req, res);
        if (!parsed) return;
        const { message, files } = parsed;
        const projectId = resolveProjectId(req);

        const git = new GitManager(projectId);

        // If files provided (latest state), sync them before commit?
        // This is important because the "Editor" state is the source of truth, not the disk.
        if (files) {
            await git.syncFiles(files);
        }

        await git.addValues('.');
        const result = await git.commit(message);

        res.json({ success: true, result });
    } catch (error: any) {
        return respondGitError(res, error, 'Failed to create git commit');
    }
});

// POST /api/git/history
router.post('/history', async (req, res) => {
    try {
        const parsed = parseBody(gitHistoryBodySchema, req, res);
        if (!parsed) return;
        const projectId = resolveProjectId(req);

        const git = new GitManager(projectId);
        const history = await git.log();

        res.json({ success: true, history });
    } catch (error: any) {
        return respondGitError(res, error, 'Failed to read git history');
    }
});

// POST /api/git/branches
router.post('/branches', async (req, res) => {
    try {
        const parsed = parseBody(gitBranchesBodySchema, req, res);
        if (!parsed) return;
        const projectId = resolveProjectId(req);

        const git = new GitManager(projectId);
        const branches = await git.getBranches();

        res.json({ success: true, branches });
    } catch (error: any) {
        return respondGitError(res, error, 'Failed to list branches');
    }
});

router.post('/branches/checkout', async (req, res) => {
    try {
        const parsed = parseBody(gitCheckoutBodySchema, req, res);
        if (!parsed) return;
        const { branch, create } = parsed;
        const projectId = resolveProjectId(req);

        const git = new GitManager(projectId);

        if (create) {
            await git.createBranch(branch);
        } else {
            await git.checkout(branch);
        }

        res.json({ success: true, message: `Switched to ${branch}` });
    } catch (error: any) {
        return respondGitError(res, error, 'Failed to switch branch');
    }
});

// POST /api/git/add
router.post('/add', async (req, res) => {
    try {
        const parsed = parseBody(gitAddBodySchema, req, res);
        if (!parsed) return;
        const { files } = parsed;
        const projectId = resolveProjectId(req);
        const git = new GitManager(projectId);

        await git.add(files || '.');
        res.json({ success: true, message: 'Files added' });
    } catch (error: any) {
        return respondGitError(res, error, 'Failed to add files');
    }
});

// POST /api/git/push
router.post('/push', async (req, res) => {
    try {
        const gitHubParsed = gitHubPushBodySchema.safeParse(req.body || {});
        if (gitHubParsed.success) {
            const { projectId, repoName, createNew, commitMessage } = gitHubParsed.data;
            const userId = resolveAuthUserId(req);
            if (!userId) {
                return res.status(401).json({ success: false, error: 'Unauthorized' });
            }

            const isOwner = await verifyGitHubProjectOwnership(projectId, userId);
            if (!isOwner) {
                return res.status(403).json({ success: false, error: 'Project access denied' });
            }

            const connection = await getGitHubConnectionWithToken(userId, projectId);
            if (!connection.connected || !connection.token) {
                return res.status(400).json({
                    success: false,
                    error: 'GitHub is not connected for this project',
                });
            }

            let owner = String(connection.username || '').trim();
            if (!owner) {
                return res.status(400).json({
                    success: false,
                    error: 'Missing GitHub username. Reconnect token first.',
                });
            }

            const token = connection.token;
            let defaultBranch = 'main';
            let repoUrl = typeof connection.repoUrl === 'string' ? connection.repoUrl.trim() : '';

            if (createNew) {
                const createRepoResponse = await fetch(`${GITHUB_API_BASE}/user/repos`, {
                    method: 'POST',
                    headers: {
                        ...buildGitHubHeaders(token),
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        name: repoName,
                        auto_init: false,
                    }),
                });

                if (!createRepoResponse.ok) {
                    const message = await readGitHubErrorMessage(createRepoResponse);
                    return res.status(createRepoResponse.status === 422 ? 409 : 400).json({
                        success: false,
                        error: `Failed to create repository (${message})`,
                    });
                }

                const createdRepo = await createRepoResponse.json().catch(() => ({} as any));
                const createdOwner = typeof createdRepo?.owner?.login === 'string' ? createdRepo.owner.login.trim() : '';
                owner = createdOwner || owner;
                defaultBranch =
                    typeof createdRepo?.default_branch === 'string' && createdRepo.default_branch.trim()
                        ? createdRepo.default_branch.trim()
                        : defaultBranch;
                repoUrl = typeof createdRepo?.html_url === 'string' ? createdRepo.html_url.trim() : repoUrl;
            } else {
                const getRepoResponse = await fetch(
                    `${GITHUB_API_BASE}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repoName)}`,
                    {
                        method: 'GET',
                        headers: buildGitHubHeaders(token),
                    }
                );
                if (!getRepoResponse.ok) {
                    const message = await readGitHubErrorMessage(getRepoResponse);
                    return res.status(getRepoResponse.status === 404 ? 404 : 400).json({
                        success: false,
                        error: `Failed to access repository (${message})`,
                    });
                }
                const existingRepo = await getRepoResponse.json().catch(() => ({} as any));
                const existingOwner = typeof existingRepo?.owner?.login === 'string' ? existingRepo.owner.login.trim() : '';
                owner = existingOwner || owner;
                defaultBranch =
                    typeof existingRepo?.default_branch === 'string' && existingRepo.default_branch.trim()
                        ? existingRepo.default_branch.trim()
                        : defaultBranch;
                repoUrl = typeof existingRepo?.html_url === 'string' ? existingRepo.html_url.trim() : repoUrl;
            }

            const { projectName, files } = await loadProjectFilesForGitHubPush({
                userId,
                projectId,
            });

            const fileEntries = Object.entries(files)
                .map(([path, content]) => [normalizeGitHubFilePath(path), content] as const)
                .filter(([path, content]) => Boolean(path) && typeof content === 'string');

            if (fileEntries.length === 0) {
                return res.status(400).json({
                    success: false,
                    error: 'No valid files available for GitHub push',
                });
            }

            const message = String(commitMessage || '').trim() || `Sync ${projectName} from AI Builder`;
            const repoContentBase = `${GITHUB_API_BASE}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repoName)}/contents`;

            for (const [filePath, content] of fileEntries) {
                const encodedPath = encodeGitHubPath(filePath);
                const existingFileResponse = await fetch(
                    `${repoContentBase}/${encodedPath}?ref=${encodeURIComponent(defaultBranch)}`,
                    {
                        method: 'GET',
                        headers: buildGitHubHeaders(token),
                    }
                );

                let sha: string | undefined;
                if (existingFileResponse.ok) {
                    const existingPayload = await existingFileResponse.json().catch(() => ({} as any));
                    if (typeof existingPayload?.sha === 'string' && existingPayload.sha.trim()) {
                        sha = existingPayload.sha.trim();
                    }
                } else if (existingFileResponse.status !== 404) {
                    const responseMessage = await readGitHubErrorMessage(existingFileResponse);
                    throw new Error(`Failed to inspect ${filePath} (${responseMessage})`);
                }

                const upsertPayload: Record<string, unknown> = {
                    message,
                    content: Buffer.from(content, 'utf8').toString('base64'),
                    branch: defaultBranch,
                };
                if (sha) upsertPayload.sha = sha;

                const pushFileResponse = await fetch(`${repoContentBase}/${encodedPath}`, {
                    method: 'PUT',
                    headers: {
                        ...buildGitHubHeaders(token),
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(upsertPayload),
                });

                if (!pushFileResponse.ok) {
                    const responseMessage = await readGitHubErrorMessage(pushFileResponse);
                    throw new Error(`Failed to push ${filePath} (${responseMessage})`);
                }
            }

            const finalRepoUrl = repoUrl || `https://github.com/${owner}/${repoName}`;
            const lastSync = new Date().toISOString();
            await saveGitHubConnection({
                userId,
                projectId,
                connected: true,
                token,
                username: owner,
                repoName,
                repoUrl: finalRepoUrl,
                lastSync,
            });

            return res.json({
                success: true,
                repoUrl: finalRepoUrl,
            });
        }

        const parsed = parseBody(gitPushBodySchema, req, res);
        if (!parsed) return;
        const { remote, branch, token } = parsed;
        const projectId = resolveProjectId(req);
        const git = new GitManager(projectId);

        const result = await git.push(remote, branch, token);
        res.json({ success: true, result });
    } catch (error: any) {
        return respondGitError(res, error, 'Failed to push changes');
    }
});

export default router;
