/**
 * Feature Flags for 3-Phase Evolution System
 * Allows gradual rollout and easy rollback of new features
 */

export interface Phase1Flags {
  specPass: boolean;
  architecturePass: boolean;
  selfCritique: boolean;
  repairLoop: boolean;
}

export interface Phase2Flags {
  astRewrite: boolean;
  qualityScoring: boolean;
  multiFileGeneration: boolean;
}

export interface Phase3Flags {
  dynamicPromptConditioning: boolean;
  intentAgent: boolean;
  dependencyIntelligence: boolean;
  styleDNA: boolean;
  componentMemory: boolean;
}

export interface EnterpriseFlags {
  astPatchExecutor: boolean;
  stylePolicy: boolean;
  libraryQuality: boolean;
  diffPreview: boolean;
  operationUndo: boolean;
  editTelemetry: boolean;
}

export interface FeatureFlags {
  phase1: Phase1Flags;
  phase2: Phase2Flags;
  phase3: Phase3Flags;
  enterprise: EnterpriseFlags;
}

/**
 * Default feature flags - all disabled for safe rollout
 */
const defaultFlags: FeatureFlags = {
  phase1: {
    specPass: false,
    architecturePass: false,
    selfCritique: false,
    repairLoop: false,
  },
  phase2: {
    astRewrite: false,
    qualityScoring: false,
    multiFileGeneration: false,
  },
  phase3: {
    dynamicPromptConditioning: false,
    intentAgent: false,
    dependencyIntelligence: false,
    styleDNA: false,
    componentMemory: false,
  },
  enterprise: {
    astPatchExecutor: false,
    stylePolicy: false,
    libraryQuality: false,
    diffPreview: false,
    operationUndo: false,
    editTelemetry: false,
  },
};

/**
 * Get feature flags from environment or use defaults
 */
export function getFeatureFlags(): FeatureFlags {
  // Helper: only override default when the env variable is explicitly set.
  // Without this, `process.env.X === 'true'` evaluates to `false` for
  // unset variables, which silently overrides any future default changes.
  const envBool = (envKey: string, fallback: boolean): boolean =>
    process.env[envKey] !== undefined ? process.env[envKey] === 'true' : fallback;

  return {
    phase1: {
      specPass: envBool('FEATURE_SPEC_PASS', defaultFlags.phase1.specPass),
      architecturePass: envBool('FEATURE_ARCHITECTURE_PASS', defaultFlags.phase1.architecturePass),
      selfCritique: envBool('FEATURE_SELF_CRITIQUE', defaultFlags.phase1.selfCritique),
      repairLoop: envBool('FEATURE_REPAIR_LOOP', defaultFlags.phase1.repairLoop),
    },
    phase2: {
      astRewrite: envBool('FEATURE_AST_REWRITE', defaultFlags.phase2.astRewrite),
      qualityScoring: envBool('FEATURE_QUALITY_SCORING', defaultFlags.phase2.qualityScoring),
      multiFileGeneration: envBool('FEATURE_MULTI_FILE', defaultFlags.phase2.multiFileGeneration),
    },
    phase3: {
      dynamicPromptConditioning: envBool('FEATURE_DYNAMIC_PROMPT', defaultFlags.phase3.dynamicPromptConditioning),
      intentAgent: envBool('FEATURE_INTENT_AGENT', defaultFlags.phase3.intentAgent),
      dependencyIntelligence: envBool('FEATURE_DEPENDENCY_INTELLIGENCE', defaultFlags.phase3.dependencyIntelligence),
      styleDNA: envBool('FEATURE_STYLE_DNA', defaultFlags.phase3.styleDNA),
      componentMemory: envBool('FEATURE_COMPONENT_MEMORY', defaultFlags.phase3.componentMemory),
    },
    enterprise: {
      astPatchExecutor: envBool('FEATURE_AST_PATCH', defaultFlags.enterprise.astPatchExecutor),
      stylePolicy: envBool('FEATURE_STYLE_POLICY', defaultFlags.enterprise.stylePolicy),
      libraryQuality: envBool('FEATURE_LIBRARY_QUALITY', defaultFlags.enterprise.libraryQuality),
      diffPreview: envBool('FEATURE_DIFF_PREVIEW', defaultFlags.enterprise.diffPreview),
      operationUndo: envBool('FEATURE_OPERATION_UNDO', defaultFlags.enterprise.operationUndo),
      editTelemetry: envBool('FEATURE_EDIT_TELEMETRY', defaultFlags.enterprise.editTelemetry),
    },
  };
}

/**
 * Get feature flags with request-level overrides
 * Allows per-request feature flag control via request body
 */
export function getFeatureFlagsForRequest(requestFlags?: Partial<FeatureFlags>): FeatureFlags {
  const baseFlags = getFeatureFlags();

  if (!requestFlags) {
    return baseFlags;
  }

  // Deep merge request flags with base flags
  return {
    phase1: { ...baseFlags.phase1, ...requestFlags.phase1 },
    phase2: { ...baseFlags.phase2, ...requestFlags.phase2 },
    phase3: { ...baseFlags.phase3, ...requestFlags.phase3 },
    enterprise: { ...baseFlags.enterprise, ...requestFlags.enterprise },
  };
}

// Singleton instance
export const featureFlags = getFeatureFlags();
