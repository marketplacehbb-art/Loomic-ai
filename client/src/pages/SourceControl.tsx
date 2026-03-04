import { useState, useEffect, useMemo } from 'react';
import { api } from '../lib/api';
import clsx from 'clsx';
import { useSearchParams } from 'react-router-dom';
import Sidebar from '../components/Sidebar';

interface GitStatus {
    status: {
        not_added: string[];
        conflicted: string[];
        created: string[];
        deleted: string[];
        modified: string[];
        renamed: string[];
        staged: string[];
        files: { path: string, index: string, working_dir: string }[];
    }
    log: {
        all: { hash: string, date: string, message: string, author_name: string }[];
    };
}

interface BranchInfo {
    current: string;
    all: string[];
    detached: boolean;
}

export default function SourceControl() {
    const [searchParams] = useSearchParams();
    const [loading, setLoading] = useState(false);
    const [gitState, setGitState] = useState<GitStatus | null>(null);
    const [commitMessage, setCommitMessage] = useState('');
    const [branchInfo, setBranchInfo] = useState<BranchInfo | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);
    // Branch Ops
    const [isCreatingBranch, setIsCreatingBranch] = useState(false);
    const [newBranchName, setNewBranchName] = useState('');

    // Push Config
    const [remoteUrl, setRemoteUrl] = useState(() => localStorage.getItem('git_remote_url') || '');
    const [pushToken, setPushToken] = useState('');
    const [showPushSettings, setShowPushSettings] = useState(false);
    const projectId = useMemo(() => {
        const fromQuery = (searchParams.get('project_id') || '').trim();
        const fromStorage = (localStorage.getItem('active_project_id') || '').trim();
        const resolved = fromQuery || fromStorage;
        if (resolved) {
            localStorage.setItem('active_project_id', resolved);
            return resolved;
        }
        return null;
    }, [searchParams]);

    useEffect(() => {
        if (!projectId) {
            setError('No project selected. Open Source Control from a specific project.');
            return;
        }
        setError(null);
        setSuccess(null);
        loadStatus();
        loadBranches();
    }, [projectId]);

    // Persist settings
    useEffect(() => {
        localStorage.setItem('git_remote_url', remoteUrl);
    }, [remoteUrl]);

    const loadStatus = async () => {
        if (!projectId) return;
        try {
            setLoading(true);
            const data = await api.git.status(projectId);
            // Data structure from server is { success: true, status: ... }
            if (data.status) {
                setGitState({ status: data.status, log: { all: [] } }); // Log fetched separately usually or via status if combined
                // We fetch history separately
                await loadHistory();
            }
        } catch (e: any) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    };

    const loadHistory = async () => {
        if (!projectId) return;
        try {
            const historyData = await api.git.history(projectId); // { success: true, history: { all: [] } }
            setGitState(prev => prev ? { ...prev, log: historyData.history } : { status: {} as any, log: historyData.history });
        } catch (e) {
            console.error(e);
        }
    }

    const loadBranches = async () => {
        if (!projectId) return;
        try {
            const data = await api.git.getBranches(projectId);
            // data is { success: true, branches: { current: string, all: string[] } }
            if (data.branches) {
                setBranchInfo(data.branches);
            }
        } catch (e) {
            // Might fail if no repo
        }
    };

    const handleInit = async () => {
        if (!projectId) return;
        try {
            setLoading(true);
            await api.git.init(projectId);
            await loadStatus();
            await loadBranches();
            setError(null);
        } catch (e: any) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    };

    const handleCommit = async () => {
        if (!projectId) return;
        if (!commitMessage) return;
        try {
            setLoading(true);
            // Auto-stage all for now (simplified flow)
            await api.git.add('.', projectId);
            await api.git.commit(commitMessage, projectId);
            setCommitMessage('');
            await loadStatus();
            await loadBranches();
        } catch (e: any) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    };

    const handleCreateBranch = async () => {
        if (!projectId) return;
        if (!newBranchName) return;
        try {
            setLoading(true);
            const res = await api.git.checkout(newBranchName, true, projectId);

            if (!res.success) throw new Error(res.error);

            setNewBranchName('');
            setIsCreatingBranch(false);
            await loadBranches();
            await loadStatus();
        } catch (e: any) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    };

    const handleSwitchBranch = async (branch: string) => {
        if (!projectId) return;
        if (branch === branchInfo?.current) return;
        try {
            setLoading(true);
            await api.git.checkout(branch, false, projectId);
            await loadBranches();
            await loadStatus();
        } catch (e: any) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    };

    const handlePush = async () => {
        if (!projectId) return;
        try {
            setLoading(true);
            const branch = branchInfo?.current || 'main';
            await api.git.push(remoteUrl || 'origin', branch, pushToken, projectId);
            setSuccess(`Push successful on ${branch}.`);
        } catch (e: any) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    };

    // If API returns error likely means no repo
    const noRepo = error?.includes('not a git repository') || (!gitState && !loading && !branchInfo);

    return (
        <div className="flex bg-slate-50 dark:bg-background-dark min-h-screen">
            <Sidebar />
            <div className="flex-1 p-8 ml-64 overflow-y-auto w-full">
                <header className="flex justify-between items-center mb-8">
                    <div>
                        <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">Source Control</h1>
                        <p className="text-slate-500 dark:text-slate-400">
                            Manage version control for your project.
                            {projectId ? ` Active project: ${projectId}` : ''}
                        </p>
                    </div>
                </header>

                {error && !noRepo && (
                    <div className="bg-red-50 text-red-600 p-4 rounded-lg mb-6 border border-red-200">
                        {error}
                    </div>
                )}
                {success && (
                    <div className="bg-emerald-50 text-emerald-700 p-4 rounded-lg mb-6 border border-emerald-200">
                        {success}
                    </div>
                )}

                {noRepo ? (
                    <div className="flex flex-col items-center justify-center p-12 bg-white dark:bg-card-dark rounded-xl border border-slate-200 dark:border-white/5 shadow-sm text-center">
                        <div className="w-16 h-16 bg-slate-100 dark:bg-white/5 rounded-full flex items-center justify-center mb-4">
                            <span className="material-symbols-rounded text-3xl text-slate-400">folder_off</span>
                        </div>
                        <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-2">No Repository Found</h3>
                        <p className="text-slate-500 mb-6 max-w-md">Initialize a Git repository to start tracking changes, committing versions, and collaborating.</p>
                        <button
                            onClick={handleInit}
                            disabled={loading}
                            className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-dark transition-colors disabled:opacity-50"
                        >
                            {loading ? 'Initializing...' : 'Initialize Repository'}
                        </button>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                        {/* LEFT COLUMN: Controls & Changes */}
                        <div className="lg:col-span-1 space-y-6">

                            {/* Branch Control */}
                            <div className="bg-white dark:bg-card-dark rounded-xl border border-slate-200 dark:border-white/5 shadow-sm p-4">
                                <div className="flex items-center justify-between mb-3">
                                    <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                                        <span className="material-icons-round text-primary text-base">call_split</span>
                                        Branch
                                    </h3>
                                    <button
                                        onClick={() => setIsCreatingBranch(!isCreatingBranch)}
                                        className="text-primary text-xs hover:underline"
                                    >
                                        {isCreatingBranch ? 'Cancel' : '+ New Branch'}
                                    </button>
                                </div>

                                {isCreatingBranch ? (
                                    <div className="flex gap-2">
                                        <input
                                            value={newBranchName}
                                            onChange={e => setNewBranchName(e.target.value)}
                                            placeholder="new-branch-name"
                                            className="flex-1 p-2 text-sm bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-lg"
                                        />
                                        <button
                                            onClick={handleCreateBranch}
                                            className="p-2 bg-primary text-white rounded-lg disabled:opacity-50"
                                            disabled={!newBranchName || loading}
                                        >
                                            <span className="material-icons-round text-sm">check</span>
                                        </button>
                                    </div>
                                ) : (
                                    <select
                                        value={branchInfo?.current || ''}
                                        onChange={e => handleSwitchBranch(e.target.value)}
                                        disabled={loading}
                                        className="w-full p-2 text-sm bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-lg outline-none focus:ring-2 focus:ring-primary/20"
                                    >
                                        {branchInfo?.all.map(b => (
                                            <option key={b} value={b}>{b}</option>
                                        ))}
                                    </select>
                                )}
                            </div>

                            {/* Changes & Commit */}
                            <div className="bg-white dark:bg-card-dark rounded-xl border border-slate-200 dark:border-white/5 shadow-sm p-4 flex flex-col h-[500px]">
                                <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
                                    <span className="material-icons-round text-amber-500 text-base">edit_note</span>
                                    Changes ({gitState?.status?.files.length || 0})
                                </h3>

                                <div className="flex-1 overflow-y-auto mb-4 space-y-2 pr-1">
                                    {gitState?.status?.files.length === 0 && (
                                        <div className="h-full flex flex-col items-center justify-center text-slate-400">
                                            <span className="material-icons-round text-2xl mb-2 opacity-50">check_circle</span>
                                            <p className="text-sm">No pending changes</p>
                                        </div>
                                    )}
                                    {gitState?.status?.files.map((file, idx) => (
                                        <div key={idx} className="flex items-center gap-2 p-2 rounded hover:bg-slate-50 dark:hover:bg-white/5 border border-transparent dark:border-white/5 text-xs group">
                                            <span className={clsx("w-1.5 h-1.5 rounded-full shrink-0",
                                                file.index === 'M' || file.working_dir === 'M' ? 'bg-amber-500' :
                                                    file.index === '?' || file.working_dir === '?' ? 'bg-green-500' : 'bg-red-500')}></span>
                                            <span className="font-mono text-slate-700 dark:text-slate-300 truncate flex-1" title={file.path}>{file.path}</span>
                                            <span className="text-[10px] uppercase font-bold text-slate-400 group-hover:text-primary">
                                                {file.working_dir === '?' ? 'New' : 'Mod'}
                                            </span>
                                        </div>
                                    ))}
                                </div>

                                <div className="space-y-3 pt-4 border-t border-slate-100 dark:border-white/5">
                                    <textarea
                                        value={commitMessage}
                                        onChange={(e) => setCommitMessage(e.target.value)}
                                        placeholder="Commit message..."
                                        className="w-full h-20 p-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-lg text-sm focus:ring-2 focus:ring-primary focus:border-transparent outline-none resize-none"
                                    ></textarea>
                                    <button
                                        onClick={handleCommit}
                                        disabled={loading || !commitMessage || gitState?.status?.files.length === 0}
                                        className="w-full py-2 bg-slate-900 dark:bg-white text-white dark:text-slate-900 rounded-lg font-bold text-sm hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                                    >
                                        {loading && <span className="material-icons-round animate-spin text-sm">sync</span>}
                                        Commit
                                    </button>
                                </div>
                            </div>

                            {/* Push Config */}
                            <div className="bg-white dark:bg-card-dark rounded-xl border border-slate-200 dark:border-white/5 shadow-sm p-4">
                                <button
                                    onClick={() => setShowPushSettings(!showPushSettings)}
                                    className="w-full flex justify-between items-center text-sm font-bold text-slate-900 dark:text-white mb-2"
                                >
                                    <span className="flex items-center gap-2">
                                        <span className="material-icons-round text-blue-500 text-base">cloud_upload</span>
                                        Remote Settings
                                    </span>
                                    <span className={`material-icons-round transition-transform ${showPushSettings ? 'rotate-180' : ''}`}>expand_more</span>
                                </button>

                                {showPushSettings && (
                                    <div className="space-y-3 mt-3 animate-in fade-in slide-in-from-top-2">
                                        <div>
                                            <label className="block text-[10px] font-medium text-slate-500 uppercase mb-1">Repo URL</label>
                                            <input
                                                type="text"
                                                value={remoteUrl}
                                                onChange={e => setRemoteUrl(e.target.value)}
                                                placeholder="https://github.com/user/repo"
                                                className="w-full p-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-lg text-xs"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-[10px] font-medium text-slate-500 uppercase mb-1">Access Token</label>
                                            <input
                                                type="password"
                                                value={pushToken}
                                                onChange={e => setPushToken(e.target.value)}
                                                placeholder="ghp_..."
                                                className="w-full p-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-lg text-xs"
                                            />
                                        </div>
                                    </div>
                                )}

                                <button
                                    onClick={handlePush}
                                    disabled={loading || !remoteUrl}
                                    className="w-full mt-3 py-2 bg-blue-600 text-white rounded-lg font-medium text-sm hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                                >
                                    Push to {branchInfo?.current || 'Origin'}
                                </button>
                            </div>
                        </div>

                        {/* RIGHT COLUMN: History */}
                        <div className="lg:col-span-2">
                            <div className="bg-white dark:bg-card-dark rounded-xl border border-slate-200 dark:border-white/5 shadow-sm p-6 h-full min-h-[500px] flex flex-col">
                                <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
                                    <span className="material-icons-round text-slate-400">history</span>
                                    Commit History
                                </h3>

                                <div className="flex-1 overflow-y-auto pr-2">
                                    <div className="relative border-l border-slate-200 dark:border-white/10 ml-3 space-y-6 pl-6 pb-2">
                                        {gitState?.log?.all.map((commit, idx) => (
                                            <div key={idx} className="relative group">
                                                <div className="absolute -left-[31px] top-1 w-3 h-3 rounded-full bg-slate-300 dark:bg-slate-600 border-2 border-white dark:border-card-dark group-hover:bg-primary transition-colors"></div>
                                                <div className="flex flex-col gap-1">
                                                    <div className="flex justify-between items-start">
                                                        <p className="text-sm font-semibold text-slate-900 dark:text-white">{commit.message}</p>
                                                        <span className="text-[10px] bg-slate-100 dark:bg-white/10 px-1.5 py-0.5 rounded text-slate-500 font-mono">
                                                            {commit.hash.substring(0, 7)}
                                                        </span>
                                                    </div>
                                                    <div className="flex items-center gap-3 text-xs text-slate-500">
                                                        <span className="flex items-center gap-1">
                                                            <span className="material-icons-round text-[14px]">person</span>
                                                            {commit.author_name}
                                                        </span>
                                                        <span>•</span>
                                                        <span className="flex items-center gap-1">
                                                            <span className="material-icons-round text-[14px]">calendar_today</span>
                                                            {new Date(commit.date).toLocaleDateString()} {new Date(commit.date).toLocaleTimeString()}
                                                        </span>
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                        {(!gitState?.log?.all || gitState.log.all.length === 0) && (
                                            <p className="text-sm text-slate-400 italic">No commit history found.</p>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
