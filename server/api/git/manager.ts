
import simpleGit, { SimpleGit, CleanOptions } from 'simple-git';
import path from 'path';
import fs from 'fs/promises';
import { existsSync } from 'fs';

const REPOS_DIR = path.join(process.cwd(), 'server', 'data', 'repos');

export class GitManager {
    private git: SimpleGit;
    private projectId: string;
    private repoPath: string;

    constructor(projectId: string) {
        this.projectId = projectId;
        this.repoPath = path.join(REPOS_DIR, projectId);

        // Ensure repos dir exists
        if (!existsSync(REPOS_DIR)) {
            // We can't use async in constructor, so we assume it will be created before usage or check in methods
        }

        this.git = simpleGit();
    }

    private async ensureRepo() {
        if (!existsSync(REPOS_DIR)) {
            await fs.mkdir(REPOS_DIR, { recursive: true });
        }
        if (!existsSync(this.repoPath)) {
            await fs.mkdir(this.repoPath, { recursive: true });
            const git = simpleGit(this.repoPath);
            await git.init();
            // Config for local commits
            await git.addConfig('user.name', 'AI Builder');
            await git.addConfig('user.email', 'ai-builder@local.dev');
        }
        this.git = simpleGit(this.repoPath);
    }

    /**
     * Materialize project files from DB JSON to disk
     */
    async syncFiles(files: Record<string, string>) {
        await this.ensureRepo();

        // Clear directory first? Or just overwrite?
        // Overwrite is safer to keep git history valid, but deleted files need handling.
        // For V1, we'll just write all files.
        // Ideally we should delete files that are not in the map, but let's skip that for now.

        for (const [filePath, content] of Object.entries(files)) {
            const fullPath = path.join(this.repoPath, filePath);
            const dir = path.dirname(fullPath);
            await fs.mkdir(dir, { recursive: true });
            await fs.writeFile(fullPath, content);
        }
    }

    async status() {
        await this.ensureRepo();
        return this.git.status();
    }

    async addValues(files: string[] | '.') {
        await this.ensureRepo();
        return this.git.add(files);
    }

    async commit(message: string) {
        await this.ensureRepo();
        return this.git.commit(message);
    }

    async log() {
        await this.ensureRepo();
        return this.git.log();
    }

    async getBranches() {
        await this.ensureRepo();
        return this.git.branchLocal();
    }

    async createBranch(name: string) {
        await this.ensureRepo();
        return this.git.checkoutLocalBranch(name);
    }

    async checkout(name: string) {
        await this.ensureRepo();
        return this.git.checkout(name);
    }

    async deleteBranch(name: string) {
        await this.ensureRepo();
        return this.git.deleteLocalBranch(name);
    }
}
