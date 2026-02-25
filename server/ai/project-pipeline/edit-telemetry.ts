/**
 * Edit-Mode Telemetry & Quality Metrics (Enterprise Feature 7)
 * 
 * Collects and exposes metrics about the edit pipeline:
 * - Anchor hit rate (how often sourceId-based edits land)
 * - Unapplied operations count
 * - Rollback reasons
 * - Prompt → diff quality score
 * - AST patch success rate
 */

export interface EditMetrics {
    totalEdits: number;
    anchorHits: number;
    anchorMisses: number;
    anchorHitRate: number;

    unappliedOps: number;
    unappliedOpsRate: number;

    rollbacks: number;
    rollbackReasons: Record<string, number>;

    astPatchesApplied: number;
    astPatchesFailed: number;
    astPatchSuccessRate: number;

    stylePolicyViolations: number;
    libraryQualityBlocks: number;

    averagePromptToEditLatencyMs: number;
    averagePromptToDiffQuality: number;
    editsByOutcome: Record<string, number>;

    windowStartMs: number;
    windowEndMs: number;
}

interface EditEvent {
    timestamp: number;
    type: 'edit_attempt' | 'anchor_hit' | 'anchor_miss' | 'unapplied_op' | 'rollback' | 'ast_patch_applied' | 'ast_patch_failed' | 'style_violation' | 'library_block' | 'edit_outcome' | 'prompt_diff_quality';
    metadata?: Record<string, unknown>;
}

class EditTelemetryCollector {
    private events: EditEvent[] = [];
    private maxEvents = 10_000;
    private latencies: number[] = [];

    /**
     * Record a telemetry event.
     */
    record(type: EditEvent['type'], metadata?: Record<string, unknown>): void {
        if (this.events.length >= this.maxEvents) {
            // Evict oldest 20%
            this.events = this.events.slice(Math.floor(this.maxEvents * 0.2));
        }
        this.events.push({ timestamp: Date.now(), type, metadata });
    }

    /**
     * Record edit latency (prompt submission → result).
     */
    recordLatency(ms: number): void {
        this.latencies.push(ms);
        if (this.latencies.length > 1000) {
            this.latencies = this.latencies.slice(500);
        }
    }

    /**
     * Compute aggregate metrics.
     */
    getMetrics(windowMs: number = 3600_000): EditMetrics {
        const now = Date.now();
        const cutoff = now - windowMs;
        const windowEvents = this.events.filter((e) => e.timestamp >= cutoff);

        const count = (type: EditEvent['type']) =>
            windowEvents.filter((e) => e.type === type).length;

        const totalEdits = count('edit_attempt');
        const anchorHits = count('anchor_hit');
        const anchorMisses = count('anchor_miss');
        const unappliedOps = count('unapplied_op');
        const rollbacks = count('rollback');
        const astPatchesApplied = count('ast_patch_applied');
        const astPatchesFailed = count('ast_patch_failed');
        const stylePolicyViolations = count('style_violation');
        const libraryQualityBlocks = count('library_block');

        // Rollback reasons
        const rollbackReasons: Record<string, number> = {};
        windowEvents
            .filter((e) => e.type === 'rollback')
            .forEach((e) => {
                const reason = (e.metadata?.reason as string) || 'unknown';
                rollbackReasons[reason] = (rollbackReasons[reason] || 0) + 1;
            });

        // Edit outcomes
        const editsByOutcome: Record<string, number> = {};
        windowEvents
            .filter((e) => e.type === 'edit_outcome')
            .forEach((e) => {
                const outcome = (e.metadata?.outcome as string) || 'unknown';
                editsByOutcome[outcome] = (editsByOutcome[outcome] || 0) + 1;
            });

        // Average latency
        const recentLatencies = this.latencies.slice(-100);
        const averagePromptToEditLatencyMs =
            recentLatencies.length > 0
                ? recentLatencies.reduce((a, b) => a + b, 0) / recentLatencies.length
                : 0;

        const totalAnchor = anchorHits + anchorMisses;
        const totalAst = astPatchesApplied + astPatchesFailed;
        const qualitySamples = windowEvents
            .filter((e) => e.type === 'prompt_diff_quality')
            .map((e) => Number(e.metadata?.score))
            .filter((value) => Number.isFinite(value));
        const averagePromptToDiffQuality = qualitySamples.length > 0
            ? qualitySamples.reduce((sum, value) => sum + value, 0) / qualitySamples.length
            : 0;

        return {
            totalEdits,
            anchorHits,
            anchorMisses,
            anchorHitRate: totalAnchor > 0 ? anchorHits / totalAnchor : 0,
            unappliedOps,
            unappliedOpsRate: totalEdits > 0 ? unappliedOps / totalEdits : 0,
            rollbacks,
            rollbackReasons,
            astPatchesApplied,
            astPatchesFailed,
            astPatchSuccessRate: totalAst > 0 ? astPatchesApplied / totalAst : 0,
            stylePolicyViolations,
            libraryQualityBlocks,
            averagePromptToEditLatencyMs: Math.round(averagePromptToEditLatencyMs),
            averagePromptToDiffQuality: Number(averagePromptToDiffQuality.toFixed(4)),
            editsByOutcome,
            windowStartMs: cutoff,
            windowEndMs: now,
        };
    }

    /**
     * Reset all metrics.
     */
    reset(): void {
        this.events = [];
        this.latencies = [];
    }
}

// Singleton
export const editTelemetry = new EditTelemetryCollector();
