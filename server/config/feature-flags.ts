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
  // Check environment variables for feature flags
  const envFlags = {
    phase1: {
      specPass: process.env.FEATURE_SPEC_PASS === 'true',
      architecturePass: process.env.FEATURE_ARCHITECTURE_PASS === 'true',
      selfCritique: process.env.FEATURE_SELF_CRITIQUE === 'true',
      repairLoop: process.env.FEATURE_REPAIR_LOOP === 'true',
    },
    phase2: {
      astRewrite: process.env.FEATURE_AST_REWRITE === 'true',
      qualityScoring: process.env.FEATURE_QUALITY_SCORING === 'true',
      multiFileGeneration: process.env.FEATURE_MULTI_FILE === 'true',
    },
    phase3: {
      dynamicPromptConditioning: process.env.FEATURE_DYNAMIC_PROMPT === 'true',
      intentAgent: process.env.FEATURE_INTENT_AGENT === 'true',
      dependencyIntelligence: process.env.FEATURE_DEPENDENCY_INTELLIGENCE === 'true',
      styleDNA: process.env.FEATURE_STYLE_DNA === 'true',
      componentMemory: process.env.FEATURE_COMPONENT_MEMORY === 'true',
    },
    enterprise: {
      astPatchExecutor: process.env.FEATURE_AST_PATCH === 'true',
      stylePolicy: process.env.FEATURE_STYLE_POLICY === 'true',
      libraryQuality: process.env.FEATURE_LIBRARY_QUALITY === 'true',
      diffPreview: process.env.FEATURE_DIFF_PREVIEW === 'true',
      operationUndo: process.env.FEATURE_OPERATION_UNDO === 'true',
      editTelemetry: process.env.FEATURE_EDIT_TELEMETRY === 'true',
    },
  };

  // Merge with defaults (env vars override defaults)
  return {
    phase1: { ...defaultFlags.phase1, ...envFlags.phase1 },
    phase2: { ...defaultFlags.phase2, ...envFlags.phase2 },
    phase3: { ...defaultFlags.phase3, ...envFlags.phase3 },
    enterprise: { ...defaultFlags.enterprise, ...envFlags.enterprise },
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
