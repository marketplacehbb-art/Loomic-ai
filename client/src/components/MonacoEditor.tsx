import Editor from '@monaco-editor/react';
import { useState, useEffect, useMemo } from 'react';
import { useTheme } from '../contexts/ThemeContext';
import { buildFileTree, FileNode } from '../utils/file-tree';

interface MonacoEditorProps {
    files: Record<string, string>;
}

export function MonacoEditor({ files }: MonacoEditorProps) {
    const fileNames = Object.keys(files);
    const pickDefaultFile = (names: string[]) => {
        const preferred = ['src/App.tsx', 'App.tsx', 'src/main.tsx', 'index.html'];
        for (const candidate of preferred) {
            if (names.includes(candidate)) return candidate;
        }
        return names[0] || 'src/App.tsx';
    };

    const [activeFile, setActiveFile] = useState(pickDefaultFile(fileNames));
    const [copied, setCopied] = useState(false);
    const { theme } = useTheme();

    // Build the tree
    const fileTree = useMemo(() => buildFileTree(fileNames), [fileNames]);
    const fileStats = useMemo(() => {
        const source = fileNames.filter((name) => name.startsWith('src/')).length;
        const config = fileNames.filter((name) => !name.startsWith('src/')).length;
        return { total: fileNames.length, source, config };
    }, [fileNames]);

    // Update active file if current one is removed or files change
    useEffect(() => {
        if (fileNames.length > 0 && !fileNames.includes(activeFile)) {
            setActiveFile(pickDefaultFile(fileNames));
        }
    }, [fileNames, activeFile]);

    const getLanguage = (filename: string) => {
        if (filename.endsWith('.tsx')) return 'typescript';
        if (filename.endsWith('.ts')) return 'typescript';
        if (filename.endsWith('.jsx')) return 'javascript';
        if (filename.endsWith('.js')) return 'javascript';
        if (filename.endsWith('.css')) return 'css';
        if (filename.endsWith('.html')) return 'html';
        if (filename.endsWith('.json')) return 'json';
        return 'javascript';
    };

    const copyToClipboard = async () => {
        try {
            await navigator.clipboard.writeText(files[activeFile] || '');
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch (err) {
            console.error('Failed to copy:', err);
        }
    };

    // Recursive File Tree Renderer
    const FileTreeItem = ({ node, level = 0 }: { node: FileNode, level?: number }) => {
        const [isOpen, setIsOpen] = useState(node.isOpen ?? true);
        const isActive = node.path === activeFile;

        if (node.type === 'folder') {
            return (
                <div key={node.path}>
                    <div
                        onClick={() => setIsOpen(!isOpen)}
                        className={`flex items-center gap-1 py-1.5 px-2 cursor-pointer hover:bg-slate-200 dark:hover:bg-white/5 text-slate-600 dark:text-slate-400 select-none text-sm ${level === 0 ? 'font-semibold uppercase tracking-wide text-[11px]' : ''}`}
                        style={{ paddingLeft: `${level * 12 + 8}px` }}
                    >
                        <span className="material-icons-round text-sm opacity-70">
                            {isOpen ? 'expand_more' : 'chevron_right'}
                        </span>
                        <span className="material-icons-round text-sm text-yellow-500/80 mr-1">folder</span>
                        <span className="truncate">{node.name}</span>
                    </div>
                    {isOpen && node.children && (
                        <div>
                            {node.children.map(child => (
                                <FileTreeItem key={child.path} node={child} level={level + 1} />
                            ))}
                        </div>
                    )}
                </div>
            );
        }

        // File Node
        const getIconColor = (name: string) => {
            if (name.endsWith('html')) return 'text-orange-500';
            if (name.endsWith('css')) return 'text-blue-500';
            if (name.endsWith('json')) return 'text-yellow-500';
            if (name.endsWith('ts') || name.endsWith('tsx')) return 'text-blue-400';
            if (name.endsWith('js') || name.endsWith('jsx')) return 'text-yellow-400';
            return 'text-slate-400';
        }

        const extension = node.name.includes('.') ? node.name.split('.').pop()?.toUpperCase() : '';

        return (
            <div
                onClick={() => setActiveFile(node.path)}
                className={`flex items-center gap-2 py-1.5 px-2 cursor-pointer text-sm select-none transition-colors border-l-2 ${isActive
                    ? 'bg-slate-200 dark:bg-white/10 text-slate-900 dark:text-white border-primary'
                    : 'border-transparent text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/5'
                    }`}
                style={{ paddingLeft: `${level * 12 + 12}px` }}
            >
                <span className={`material-icons-round text-sm ${getIconColor(node.name)}`}>
                    description
                </span>
                <span className="truncate">{node.name}</span>
                {extension && (
                    <span className="ml-auto text-[9px] font-bold tracking-wider text-slate-400 dark:text-slate-500">
                        {extension}
                    </span>
                )}
            </div>
        );
    };

    return (
        <div className="flex w-full h-full bg-slate-50 dark:bg-[#1e1e1e] transition-colors duration-300">
            {/* Sidebar File Explorer */}
            <div className="w-64 flex flex-col border-r border-slate-200 dark:border-white/10 bg-slate-100 dark:bg-[#252526]">
                <div className="p-3 border-b border-slate-200 dark:border-white/5">
                    <div className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center justify-between">
                        <span>Project Files</span>
                        <span className="material-icons-round text-sm cursor-pointer hover:text-slate-800 dark:hover:text-white" onClick={copyToClipboard} title="Copy Active File">
                            {copied ? 'check' : 'content_copy'}
                        </span>
                    </div>
                    <div className="mt-2 text-[10px] text-slate-500 dark:text-slate-400 flex items-center gap-2">
                        <span>{fileStats.total} files</span>
                        <span>•</span>
                        <span>{fileStats.source} src</span>
                        <span>•</span>
                        <span>{fileStats.config} root</span>
                    </div>
                </div>
                <div className="flex-1 overflow-y-auto py-2 custom-scrollbar">
                    {fileTree.map(node => (
                        <FileTreeItem key={node.path} node={node} />
                    ))}
                </div>
            </div>

            {/* Editor Area */}
            <div className="flex-1 flex flex-col min-w-0">
                {/* File Breadcrumb / Tab Header */}
                <div className="h-9 flex items-center px-4 border-b border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#1e1e1e] text-sm text-slate-500 dark:text-slate-400 select-none">
                    <span className="material-icons-round text-sm mr-2 opacity-50">article</span>
                    {activeFile}
                </div>

                <div className="flex-1 relative">
                    <Editor
                        height="100%"
                        language={getLanguage(activeFile)}
                        value={files[activeFile] || ''}
                        theme={theme === 'dark' ? 'vs-dark' : 'light'}
                        options={{
                            minimap: { enabled: false },
                            fontSize: 14,
                            lineNumbers: 'on',
                            readOnly: false,
                            automaticLayout: true,
                            scrollBeyondLastLine: false,
                            padding: { top: 16 },
                            fontFamily: "'JetBrains Mono', 'Fira Code', 'Consolas', monospace",
                            fontLigatures: true
                        }}
                    />
                </div>
            </div>
        </div>
    );
}
