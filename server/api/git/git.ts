
import simpleGit, { SimpleGit } from 'simple-git';
import path from 'path';
import fs from 'fs';

const REPOS_DIR = path.join(process.cwd(), 'server', 'data', 'repos');

export class GitManager {
    private git: SimpleGit;
    private baseDir: string;
    private projectId: string;

    constructor(projectId: string = 'default') {
        this.projectId = this.sanitizeProjectId(projectId);
        this.baseDir = path.join(REPOS_DIR, this.projectId);
        this.git = simpleGit(this.baseDir);
    }

    private sanitizeProjectId(projectId: string): string {
        const normalized = String(projectId || 'default').trim();
        if (!normalized) return 'default';
        // Limit project IDs to a safe subset for filesystem folder names.
        if (!/^[a-zA-Z0-9_-]+$/.test(normalized)) {
            throw new Error('Invalid projectId');
        }
        return normalized;
    }

    private ensureRepoDir() {
        if (!fs.existsSync(REPOS_DIR)) {
            fs.mkdirSync(REPOS_DIR, { recursive: true });
        }
        if (!fs.existsSync(this.baseDir)) {
            fs.mkdirSync(this.baseDir, { recursive: true });
        }
    }

    private async ensureRepo() {
        this.ensureRepoDir();
        this.git = simpleGit(this.baseDir);

        const isRepo = await this.git.checkIsRepo();
        if (!isRepo) {
            await this.git.init();
            await this.git.addConfig('user.name', 'AI Builder');
            await this.git.addConfig('user.email', 'ai-builder@local.dev');
        }
    }

    async init(): Promise<void> {
        await this.ensureRepo();
        const gitignorePath = path.join(this.baseDir, '.gitignore');
        if (!fs.existsSync(gitignorePath)) {
            fs.writeFileSync(gitignorePath, 'node_modules\n.env\ndist\n.DS_Store\n');
        }
    }

    async status() {
        await this.ensureRepo();
        return await this.git.status();
    }

    async log() {
        await this.ensureRepo();
        try {
            return await this.git.log();
        } catch (e) {
            return { all: [] }; // No commits yet
        }
    }

    /**
     * Security: Ensure path is within project root
     */
    private sanitizePath(inputPath: string): string {
        const relative = path.normalize(String(inputPath || '').trim());
        if (!relative) {
            throw new Error('Invalid empty path');
        }
        if (path.isAbsolute(relative)) {
            throw new Error(`Security Error: Absolute paths are not allowed (${inputPath})`);
        }

        const resolvedPath = path.resolve(this.baseDir, relative);
        const rootWithSep = this.baseDir.endsWith(path.sep) ? this.baseDir : `${this.baseDir}${path.sep}`;

        if (!(resolvedPath === this.baseDir || resolvedPath.startsWith(rootWithSep))) {
            throw new Error(`Security Error: Access to ${inputPath} denied. Path must be within project root.`);
        }

        return relative;
    }

    async add(files: string | string[]) {
        await this.ensureRepo();
        if (Array.isArray(files)) {
            files.forEach(f => this.sanitizePath(f));
        } else {
            this.sanitizePath(files);
        }
        return await this.git.add(files);
    }

    async commit(message: string) {
        await this.ensureRepo();
        return await this.git.commit(message);
    }

    async branches() {
        await this.ensureRepo();
        try {
            const branchSummary = await this.git.branch();
            return {
                current: branchSummary.current,
                all: branchSummary.all,
                detached: branchSummary.detached
            };
        } catch (e) {
            // Fallback for empty repo
            return { current: '', all: [], detached: false };
        }
    }

    async checkout(branch: string) {
        await this.ensureRepo();
        // Fetch inputs from client: "checkout" usually implies switching. 
        // If it fails, it might be due to uncommitted changes or branch not found.
        try {
            await this.git.checkout(branch);
        } catch (error: any) {
            // Check if error is because branch doesn't exist
            if (error.message && error.message.includes('did not match any file(s) known to git')) {
                throw new Error(`Branch '${branch}' does not exist. Use createBranch to create it.`);
            }
            throw error;
        }
    }

    async syncFiles(files: Record<string, string>) {
        await this.ensureRepo();
        // Implementation to sync virtual files to disk
        for (const [filePath, content] of Object.entries(files)) {
            const safeRelativePath = this.sanitizePath(filePath);
            const fullPath = path.resolve(this.baseDir, safeRelativePath);
            const dir = path.dirname(fullPath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
            fs.writeFileSync(fullPath, content);
        }
    }

    async addValues(files: string | string[]) {
        // Wrapper for add
        return this.add(files);
    }

    async getBranches() {
        return this.branches();
    }

    async createBranch(branch: string) {
        await this.ensureRepo();
        // checkoutLocalBranch creates AND checks out
        return await this.git.checkoutLocalBranch(branch);
    }

    async push(remote: string = 'origin', branch: string, token?: string) {
        await this.ensureRepo();
        // Handling auth using remote URL manipulation or simple-git options is tricky securely.
        // For now assuming the user provided HTTPS URL might include token or SSH is setup.
        // If token provided, we inject it: https://oauth2:TOKEN@github.com/user/repo.git

        let remoteUrl = remote;
        if (token && remote.startsWith('https://')) {
            const urlObj = new URL(remote);
            urlObj.username = 'oauth2';
            urlObj.password = token;
            remoteUrl = urlObj.toString();
        }

        // Check if remote exists, add/replace if needed
        const remotes = await this.git.getRemotes(true);
        const origin = remotes.find(r => r.name === 'origin');

        if (!origin) {
            await this.git.addRemote('origin', remoteUrl);
        } else if (origin.refs.push !== remoteUrl) {
            await this.git.removeRemote('origin');
            await this.git.addRemote('origin', remoteUrl);
        }

        return await this.git.push('origin', branch, ['--set-upstream']);
    }
}
