import {
  VISUAL_WORKFLOW_META,
  deriveVisualWorkflowState,
  type VisualWorkflowInput,
} from '../client/src/hooks/useVisualWorkflow';

function assert(condition: unknown, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function buildInput(overrides: Partial<VisualWorkflowInput> = {}): VisualWorkflowInput {
  return {
    isVisualMode: true,
    isApplyingVisualPatch: false,
    loading: false,
    hasPendingPatch: false,
    hasError: false,
    reliableSelectionCount: 0,
    isInspectMode: false,
    ...overrides,
  };
}

function runStatePrecedenceTests(): void {
  assert(
    deriveVisualWorkflowState(buildInput({ isVisualMode: false })) === null,
    'Non-visual mode must not expose visual workflow state'
  );
  assert(
    deriveVisualWorkflowState(buildInput({ isApplyingVisualPatch: true, hasPendingPatch: true, hasError: true })) === 'applying',
    'Applying must have highest priority'
  );
  assert(
    deriveVisualWorkflowState(buildInput({ hasPendingPatch: true, hasError: true })) === 'review',
    'Review must win over error when a patch is pending'
  );
  assert(
    deriveVisualWorkflowState(buildInput({ hasError: true, reliableSelectionCount: 2 })) === 'error',
    'Error must win over selected'
  );
  assert(
    deriveVisualWorkflowState(buildInput({ reliableSelectionCount: 1, isInspectMode: true })) === 'selected',
    'Selected must win over selecting'
  );
  assert(
    deriveVisualWorkflowState(buildInput({ isInspectMode: true })) === 'selecting',
    'Inspect mode should map to selecting when nothing is selected'
  );
  assert(
    deriveVisualWorkflowState(buildInput()) === 'idle',
    'Default visual state should be idle'
  );
}

function runMetaTests(): void {
  const states = ['idle', 'selecting', 'selected', 'review', 'applying', 'error'] as const;
  for (const state of states) {
    const meta = VISUAL_WORKFLOW_META[state];
    assert(Boolean(meta), `Missing visual workflow meta for state: ${state}`);
    assert(typeof meta.label === 'string' && meta.label.length > 0, `Missing label for state: ${state}`);
    assert(typeof meta.tone === 'string' && meta.tone.length > 0, `Missing tone for state: ${state}`);
  }
}

function main(): void {
  console.log('\nStarting Visual Workflow State Tests...\n');
  runStatePrecedenceTests();
  console.log('PASS: state precedence');
  runMetaTests();
  console.log('PASS: workflow meta mapping');
  console.log('\nAll visual workflow tests passed.');
}

main();
