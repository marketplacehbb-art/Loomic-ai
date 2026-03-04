import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { GitManager } from './git.js';
import { sanitizeErrorForLog, sanitizeErrorMessage } from '../../utils/error-sanitizer.js';

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

export const gitRouteSchemas = {
    init: gitInitBodySchema,
    status: gitStatusBodySchema,
    commit: gitCommitBodySchema,
    history: gitHistoryBodySchema,
    branches: gitBranchesBodySchema,
    checkout: gitCheckoutBodySchema,
    add: gitAddBodySchema,
    push: gitPushBodySchema,
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
