/**
 * LLM API Client
 * Frontend interface to /api/generate endpoint
 */

export interface ProcessedFile {
  path: string;
  content: string;
  type: string;
  size?: number;
}

export interface GenerateRequest {
  provider: 'gemini' | 'groq' | 'openai' | 'nvidia';
  prompt: string;
  mode?: 'generate' | 'repair';
  errorContext?: string;
  templateId?: string;
  systemPrompt?: string;
  temperature?: number;
  stream?: boolean;
  maxTokens?: number;
  validate?: boolean;
  bundle?: boolean;
  integrations?: {
    supabase?: {
      connected?: boolean;
      environment?: 'test' | 'live' | null;
      projectRef?: string | null;
      hasTestConnection?: boolean;
      hasLiveConnection?: boolean;
    } | null;
  };
}

export interface GenerateResponse {
  success: boolean;
  code?: string;
  files?: ProcessedFile[];
  dependencies?: Record<string, string>;
  components?: string[];
  errors?: string[];
  warnings?: string[];
  error?: string;
  errorCategory?: 'rate_limit' | 'provider_down' | 'auth_error';
  suggestedProvider?: 'gemini' | 'groq' | 'openai' | 'nvidia';
  retryable?: boolean;
  provider: string;
  timestamp: string;
  duration?: number;
  processingTime?: number;
  noOp?: {
    detected: boolean;
    reason: string;
  };
  repairStatus?: 'skipped' | 'succeeded' | 'failed';
  repairError?: string;
  metadata?: {
    hydratedContext?: {
      intent: string;
      targetFiles: string[];
      componentList: string[];
      colorScheme: string;
      complexity: 'simple' | 'moderate' | 'complex';
    } | null;
  };
  pipeline?: {
    mode: 'template+plan+assemble';
    generationMode?: 'new' | 'edit';
    templateId?: string;
    selectedBlocks?: string[];
    plan?: {
      projectType: string;
      features: string[];
      pages: string[];
      repairs: string[];
      dependencyExpansion: string[];
      valid: boolean;
      warnings: string[];
      errors: string[];
    };
    sectionDiff?: {
      mode: 'full-project' | 'section-isolated';
      structuralChange: boolean;
      targetedCategories: string[];
      semantic: {
        intent: string;
        scope: string;
        intensity: string;
        confidence: number;
        touchesStructure: boolean;
        reasons: string[];
      };
      added: string[];
      removed: string[];
      unchanged: string[];
      allowAppUpdate: boolean;
      allowedUpdatePaths: string[];
    };
    smartDiff?: {
      added: string[];
      removed: string[];
      updated: string[];
      unchangedCount: number;
      changedCount: number;
      changeRatio: number;
      structuralChange: boolean;
      contentOnlyChange: boolean;
      configChange: boolean;
    };
    snapshot?: {
      currentId: string;
      previousId?: string;
      createdAt: string;
      projectId?: string;
      fileCount: number;
    };
    autoRepair?: {
      enabled: boolean;
      attempted: boolean;
      applied: boolean;
      maxAttempts: number;
      attemptsExecuted: number;
      initialErrorCount: number;
      finalErrorCount: number;
      abortedReason?: string;
      logs?: Array<{
        attempt: number;
        beforeErrors: number;
        afterErrors: number;
        status: 'improved' | 'resolved' | 'aborted' | 'failed';
        reason?: string;
      }>;
    };
    qualityGate?: {
      pass: boolean;
      overall: number;
      visualScore: number;
      accessibilityScore: number;
      performanceScore: number;
      criticalCount: number;
      warningCount: number;
      findings: Array<{
        id: string;
        severity: 'critical' | 'warning' | 'info';
        message: string;
        suggestion: string;
      }>;
    };
    qualitySummary?: {
      score: number;
      grade: 'A' | 'B' | 'C' | 'D' | 'E';
      status: 'excellent' | 'good' | 'needs_improvement' | 'critical';
      pass: boolean;
      criticalCount: number;
      warningCount: number;
      topIssues: string[];
      recommendedAction?: string;
      repair: {
        attempted: boolean;
        applied: boolean;
        initialErrorCount: number;
        finalErrorCount: number;
        attemptsExecuted: number;
        abortedReason?: string;
      };
      critique?: {
        score: number;
        needsRepair: boolean;
        issueCount: number;
        criticalIssueCount: number;
      };
    };
    plannedCreate: number;
    plannedUpdate: number;
    templateFiles: number;
    llmContextFiles: number;
  };
}

export class LLMClient {
  private baseUrl: string;

  constructor(baseUrl: string = '/api') {
    this.baseUrl = baseUrl;
  }

  async generate(request: GenerateRequest): Promise<GenerateResponse> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 90_000);
    let response: Response;

    try {
      response = await fetch(`${this.baseUrl}/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          ...request,
          validate: request.validate !== false,
          bundle: request.bundle !== false
        }),
        signal: controller.signal,
      });
    } catch (error: any) {
      if (error?.name === 'AbortError') {
        throw new Error('Generation timed out after 90 seconds. Please try again.');
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      let errorMessage = `API error: ${response.status}`;
      try {
        const errorData = await response.json();
        errorMessage = errorData.error || errorMessage;
      } catch (e) {
        // If JSON parsing fails, use text or status text
        const text = await response.text().catch(() => '');
        errorMessage = text || response.statusText || errorMessage;
      }
      throw new Error(errorMessage);
    }

    return response.json() as Promise<GenerateResponse>;
  }

  async generateStream(
    request: GenerateRequest,
    onChunk: (chunk: string) => void
  ): Promise<void> {
    void request;
    void onChunk;
    throw new Error('Streaming is not available yet. Use generate() until the streaming API is implemented.');
  }

  getAvailableProviders(): string[] {
    return ['gemini', 'groq', 'openai', 'nvidia'];
  }
}

export const llmClient = new LLMClient();
