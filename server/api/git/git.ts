
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
        this.git = simpleGit();
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

    private tryParseHttpUrl(rawValue: string): URL | null {
        try {
            const parsed = new URL(rawValue);
            if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
                return null;
            }
            return parsed;
        } catch {
            return null;
        }
    }

    private stripHttpCredentials(rawValue: string): string {
        const parsed = this.tryParseHttpUrl(rawValue);
        if (!parsed) return rawValue;
        parsed.username = '';
        parsed.password = '';
        return parsed.toString();
    }

    private buildEphemeralPushUrl(remoteUrl: string, token?: string): string | null {
        const parsed = this.tryParseHttpUrl(remoteUrl);
        if (!parsed) return null;

        if (token) {
            parsed.username = 'oauth2';
            parsed.password = token;
            return parsed.toString();
        }

        if (parsed.username || parsed.password) {
            return remoteUrl;
        }

        return null;
    }

    private async upsertRemote(remoteName: string, remoteUrl: string, remotes?: Awaited<ReturnType<SimpleGit['getRemotes']>>) {
        const existingRemotes = remotes || await this.git.getRemotes(true);
        const existing = existingRemotes.find((entry) => entry.name === remoteName);
        if (!existing) {
            await this.git.addRemote(remoteName, remoteUrl);
            return;
        }

        if (existing.refs.fetch !== remoteUrl || existing.refs.push !== remoteUrl) {
            await this.git.removeRemote(remoteName);
            await this.git.addRemote(remoteName, remoteUrl);
        }
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

        const repoMarkerPath = path.join(this.baseDir, '.git');
        const hasOwnRepo = fs.existsSync(repoMarkerPath);
        if (!hasOwnRepo) {
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
        const remotes = await this.git.getRemotes(true);

        const remoteName = remote.trim() || 'origin';
        const httpRemote = this.tryParseHttpUrl(remoteName);

        if (httpRemote) {
            const sanitizedRemoteUrl = this.stripHttpCredentials(remoteName);
            await this.upsertRemote('origin', sanitizedRemoteUrl, remotes);

            const ephemeralPushUrl = this.buildEphemeralPushUrl(remoteName, token);
            if (ephemeralPushUrl) {
                return await this.git.raw(['push', ephemeralPushUrl, `${branch}:${branch}`]);
            }

            return await this.git.push('origin', branch, ['--set-upstream']);
        }

        const namedRemote = remotes.find((entry) => entry.name === remoteName);
        const configuredPushUrl = namedRemote?.refs.push || namedRemote?.refs.fetch || '';
        const ephemeralPushUrl = configuredPushUrl
            ? this.buildEphemeralPushUrl(configuredPushUrl, token)
            : null;

        if (ephemeralPushUrl) {
            return await this.git.raw(['push', ephemeralPushUrl, `${branch}:${branch}`]);
        }

        return await this.git.push(remoteName, branch, ['--set-upstream']);
    }
}
