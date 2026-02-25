
import { Router } from 'express';
import { GitManager } from './git.js';

const router = Router();

const resolveProjectId = (req: any): string => {
    const bodyProjectId = typeof req.body?.projectId === 'string' ? req.body.projectId.trim() : '';
    if (bodyProjectId) return bodyProjectId;
    const authUserId = typeof req.authUser?.id === 'string' ? req.authUser.id.trim() : '';
    return authUserId ? `user-${authUserId}` : 'default';
};

// Middleware to ensure project exists? 
// For now, we trust the client sends a valid project_id which maps to a folder.

// POST /api/git/init
router.post('/init', async (req, res) => {
    try {
        const { files } = req.body || {};
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
        res.status(500).json({ success: false, error: error.message });
    }
});

// POST /api/git/status
router.post('/status', async (req, res) => {
    try {
        const projectId = resolveProjectId(req);

        const git = new GitManager(projectId);
        const status = await git.status();

        res.json({ success: true, status });
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// POST /api/git/commit
router.post('/commit', async (req, res) => {
    try {
        const { message, files } = req.body || {};
        if (!message) return res.status(400).json({ error: 'Missing message' });
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
        res.status(500).json({ success: false, error: error.message });
    }
});

// POST /api/git/history
router.post('/history', async (req, res) => {
    try {
        const projectId = resolveProjectId(req);

        const git = new GitManager(projectId);
        const history = await git.log();

        res.json({ success: true, history });
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// POST /api/git/branches
router.post('/branches', async (req, res) => {
    try {
        const projectId = resolveProjectId(req);

        const git = new GitManager(projectId);
        const branches = await git.getBranches();

        res.json({ success: true, branches });
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// POST /api/git/branches/checkout
// POST /api/git/branches/checkout
router.post('/branches/checkout', async (req, res) => {
    try {
        const { branch, create } = req.body || {};
        if (!branch) return res.status(400).json({ error: 'Missing branch' });
        const projectId = resolveProjectId(req);

        const git = new GitManager(projectId);

        if (create) {
            await git.createBranch(branch);
        } else {
            await git.checkout(branch);
        }

        res.json({ success: true, message: `Switched to ${branch}` });
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// POST /api/git/add
router.post('/add', async (req, res) => {
    try {
        const { files } = req.body || {};
        const projectId = resolveProjectId(req);
        const git = new GitManager(projectId);

        await git.add(files || '.');
        res.json({ success: true, message: 'Files added' });
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// POST /api/git/push
router.post('/push', async (req, res) => {
    try {
        const { remote, branch, token } = req.body || {};
        if (!branch) return res.status(400).json({ error: 'Missing branch' });
        const projectId = resolveProjectId(req);
        const git = new GitManager(projectId);

        const result = await git.push(remote, branch, token);
        res.json({ success: true, result });
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
});

export default router;
