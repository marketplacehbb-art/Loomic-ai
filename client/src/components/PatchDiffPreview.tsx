import { useState, useMemo } from 'react';

/**
 * Patch Diff Preview Component (Enterprise Feature 5)
 * 
 * Shows a confirmation dialog with a unified diff view
 * before applying edits to the codebase.
 */

interface PatchDiffPreviewProps {
    /** Changed files with before/after content */
    changes: Array<{
        path: string;
        before: string;
        after: string;
    }>;
    /** Operation label */
    label: string;
    /** Called when user confirms the patch */
    onConfirm: () => void;
    /** Called when user cancels */
    onCancel: () => void;
    /** Whether the patch is being applied */
    isApplying?: boolean;
}

interface DiffLine {
    type: 'added' | 'removed' | 'unchanged' | 'header';
    content: string;
    lineNumber?: number;
}

function computeUnifiedDiff(before: string, after: string): DiffLine[] {
    const beforeLines = before.split('\n');
    const afterLines = after.split('\n');

    // Simple LCS-based diff
    const m = beforeLines.length;
    const n = afterLines.length;

    // Build LCS table
    const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
    for (let i = 1; i <= m; i++) {
        for (let j = 1; j <= n; j++) {
            if (beforeLines[i - 1] === afterLines[j - 1]) {
                dp[i][j] = dp[i - 1][j - 1] + 1;
            } else {
                dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
            }
        }
    }

    // Backtrack to build diff
    let i = m, j = n;
    const stack: DiffLine[] = [];
    while (i > 0 || j > 0) {
        if (i > 0 && j > 0 && beforeLines[i - 1] === afterLines[j - 1]) {
            stack.push({ type: 'unchanged', content: beforeLines[i - 1], lineNumber: j });
            i--;
            j--;
        } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
            stack.push({ type: 'added', content: afterLines[j - 1], lineNumber: j });
            j--;
        } else {
            stack.push({ type: 'removed', content: beforeLines[i - 1], lineNumber: i });
            i--;
        }
    }

    return stack.reverse();
}

const diffLineColors: Record<DiffLine['type'], string> = {
    added: '#e6ffec',
    removed: '#ffebe9',
    unchanged: 'transparent',
    header: '#f1f1f1',
};

const diffLineTextColors: Record<DiffLine['type'], string> = {
    added: '#1a7f37',
    removed: '#cf222e',
    unchanged: '#24292f',
    header: '#656d76',
};

const diffLinePrefixes: Record<DiffLine['type'], string> = {
    added: '+',
    removed: '-',
    unchanged: ' ',
    header: '@',
};

export default function PatchDiffPreview({
    changes,
    label,
    onConfirm,
    onCancel,
    isApplying = false,
}: PatchDiffPreviewProps) {
    const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set(changes.map((c) => c.path)));

    const diffs = useMemo(() => {
        return changes.map((change) => ({
            path: change.path,
            lines: computeUnifiedDiff(change.before, change.after),
            addedCount: 0,
            removedCount: 0,
        })).map((d) => ({
            ...d,
            addedCount: d.lines.filter((l) => l.type === 'added').length,
            removedCount: d.lines.filter((l) => l.type === 'removed').length,
        }));
    }, [changes]);

    const totalAdded = diffs.reduce((sum, d) => sum + d.addedCount, 0);
    const totalRemoved = diffs.reduce((sum, d) => sum + d.removedCount, 0);

    const toggleFile = (path: string) => {
        setExpandedFiles((prev) => {
            const next = new Set(prev);
            if (next.has(path)) next.delete(path);
            else next.add(path);
            return next;
        });
    };

    return (
        <div style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
        }}>
            <div style={{
                backgroundColor: '#fff',
                borderRadius: '12px',
                width: '90%',
                maxWidth: '840px',
                maxHeight: '80vh',
                display: 'flex',
                flexDirection: 'column',
                boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
                overflow: 'hidden',
            }}>
                {/* Header */}
                <div style={{
                    padding: '16px 20px',
                    borderBottom: '1px solid #e5e7eb',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                }}>
                    <div>
                        <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 600 }}>
                            Review Changes
                        </h3>
                        <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#6b7280' }}>
                            {label} — {changes.length} file{changes.length !== 1 ? 's' : ''} changed,{' '}
                            <span style={{ color: '#1a7f37' }}>+{totalAdded}</span>{' '}
                            <span style={{ color: '#cf222e' }}>-{totalRemoved}</span>
                        </p>
                    </div>
                </div>

                {/* Diff content */}
                <div style={{ flex: 1, overflow: 'auto', padding: '0' }}>
                    {diffs.map((diff) => (
                        <div key={diff.path}>
                            <div
                                onClick={() => toggleFile(diff.path)}
                                style={{
                                    padding: '10px 20px',
                                    backgroundColor: '#f6f8fa',
                                    borderBottom: '1px solid #e5e7eb',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '8px',
                                    fontSize: '13px',
                                    fontFamily: 'monospace',
                                }}
                            >
                                <span>{expandedFiles.has(diff.path) ? '▼' : '▶'}</span>
                                <span style={{ fontWeight: 500 }}>{diff.path}</span>
                                <span style={{ color: '#1a7f37', marginLeft: 'auto' }}>+{diff.addedCount}</span>
                                <span style={{ color: '#cf222e' }}>-{diff.removedCount}</span>
                            </div>

                            {expandedFiles.has(diff.path) && (
                                <div style={{ fontFamily: 'monospace', fontSize: '12px', lineHeight: '20px' }}>
                                    {diff.lines.map((line, idx) => (
                                        <div
                                            key={idx}
                                            style={{
                                                backgroundColor: diffLineColors[line.type],
                                                color: diffLineTextColors[line.type],
                                                padding: '0 20px',
                                                whiteSpace: 'pre-wrap',
                                                wordBreak: 'break-all',
                                            }}
                                        >
                                            <span style={{ display: 'inline-block', width: '40px', color: '#8b949e', textAlign: 'right', marginRight: '12px', userSelect: 'none' }}>
                                                {line.lineNumber || ''}
                                            </span>
                                            <span style={{ userSelect: 'none', marginRight: '8px' }}>{diffLinePrefixes[line.type]}</span>
                                            {line.content}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    ))}
                </div>

                {/* Footer */}
                <div style={{
                    padding: '12px 20px',
                    borderTop: '1px solid #e5e7eb',
                    display: 'flex',
                    justifyContent: 'flex-end',
                    gap: '8px',
                }}>
                    <button
                        onClick={onCancel}
                        disabled={isApplying}
                        style={{
                            padding: '8px 16px',
                            borderRadius: '6px',
                            border: '1px solid #d1d5db',
                            backgroundColor: '#fff',
                            cursor: 'pointer',
                            fontSize: '13px',
                        }}
                    >
                        Cancel
                    </button>
                    <button
                        onClick={onConfirm}
                        disabled={isApplying}
                        style={{
                            padding: '8px 16px',
                            borderRadius: '6px',
                            border: 'none',
                            backgroundColor: '#2563eb',
                            color: '#fff',
                            cursor: isApplying ? 'not-allowed' : 'pointer',
                            fontSize: '13px',
                            fontWeight: 500,
                        }}
                    >
                        {isApplying ? 'Applying...' : 'Apply Changes'}
                    </button>
                </div>
            </div>
        </div>
    );
}
