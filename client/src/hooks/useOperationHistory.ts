import { useState, useCallback, useRef } from 'react';

/**
 * Operation-Level Undo/Redo Hook (Enterprise Feature 6)
 * 
 * Provides per-operation undo/redo with labels and diffs,
 * enabling fine-grained rollback of individual edits.
 */

export interface OperationEntry {
    id: string;
    label: string;
    timestamp: number;
    /** Files snapshot BEFORE the operation */
    beforeFiles: Record<string, string>;
    /** Dependencies BEFORE the operation */
    beforeDependencies?: Record<string, string>;
    /** Files snapshot AFTER the operation */
    afterFiles: Record<string, string>;
    /** Dependencies AFTER the operation */
    afterDependencies?: Record<string, string>;
    /** Which files were changed */
    changedPaths: string[];
    /** Metadata about the operation */
    metadata?: {
        prompt?: string;
        editAnchor?: string;
        generationMode?: string;
        outcome?: string;
    };
}

export interface UseOperationHistoryReturn {
    /** Current position in the history stack */
    currentIndex: number;
    /** Total number of operations */
    totalOperations: number;
    /** Can undo */
    canUndo: boolean;
    /** Can redo */
    canRedo: boolean;
    /** All operations */
    operations: OperationEntry[];
    /** Push a new operation onto the stack */
    push: (entry: Omit<OperationEntry, 'id' | 'timestamp'>) => void;
    /** Undo the last operation, returns the before-files */
    undo: () => OperationEntry | null;
    /** Redo the next operation, returns the after-files */
    redo: () => OperationEntry | null;
    /** Get the diff for a specific operation */
    getDiff: (id: string) => { path: string; before: string; after: string }[];
    /** Clear all history */
    clear: () => void;
}

let nextId = 1;

export function useOperationHistory(maxEntries: number = 50): UseOperationHistoryReturn {
    const [operations, setOperations] = useState<OperationEntry[]>([]);
    const [currentIndex, setCurrentIndex] = useState(-1);
    const operationsRef = useRef(operations);
    const indexRef = useRef(currentIndex);

    // Keep refs in sync
    operationsRef.current = operations;
    indexRef.current = currentIndex;

    const push = useCallback((entry: Omit<OperationEntry, 'id' | 'timestamp'>) => {
        const op: OperationEntry = {
            ...entry,
            id: `op-${nextId++}`,
            timestamp: Date.now(),
        };

        setOperations((prev) => {
            // Truncate any redo entries after current position
            const truncated = prev.slice(0, indexRef.current + 1);
            const updated = [...truncated, op];
            // Enforce max entries
            if (updated.length > maxEntries) {
                return updated.slice(updated.length - maxEntries);
            }
            return updated;
        });

        setCurrentIndex((prev) => {
            const truncatedLength = Math.min(prev + 1, operationsRef.current.length);
            return Math.min(truncatedLength, maxEntries - 1);
        });
    }, [maxEntries]);

    const undo = useCallback((): OperationEntry | null => {
        if (indexRef.current < 0) return null;
        const op = operationsRef.current[indexRef.current];
        setCurrentIndex((prev) => prev - 1);
        return op;
    }, []);

    const redo = useCallback((): OperationEntry | null => {
        const nextIndex = indexRef.current + 1;
        if (nextIndex >= operationsRef.current.length) return null;
        const op = operationsRef.current[nextIndex];
        setCurrentIndex(nextIndex);
        return op;
    }, []);

    const getDiff = useCallback((id: string) => {
        const op = operationsRef.current.find((o) => o.id === id);
        if (!op) return [];

        return op.changedPaths.map((path) => ({
            path,
            before: op.beforeFiles[path] || '',
            after: op.afterFiles[path] || '',
        }));
    }, []);

    const clear = useCallback(() => {
        setOperations([]);
        setCurrentIndex(-1);
    }, []);

    return {
        currentIndex,
        totalOperations: operations.length,
        canUndo: currentIndex >= 0,
        canRedo: currentIndex < operations.length - 1,
        operations,
        push,
        undo,
        redo,
        getDiff,
        clear,
    };
}
