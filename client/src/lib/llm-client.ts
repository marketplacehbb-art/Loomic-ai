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
  provider: 'gemini' | 'deepseek' | 'openai';
  prompt: string;
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
  provider: string;
  timestamp: string;
  duration?: number;
  processingTime?: number;
  noOp?: {
    detected: boolean;
    reason: string;
  };
  pipeline?: {
    mode: 'template+plan+assemble';
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
    const response = await fetch(`${this.baseUrl}/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        ...request,
        validate: request.validate !== false,
        bundle: request.bundle !== false
      })
    });

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
    const response = await fetch(`${this.baseUrl}/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ ...request, stream: true })
    });

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error('Response body is empty');

    const decoder = new TextDecoder();
    let chunk = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        chunk += decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');

        for (let i = 0; i < lines.length - 1; i++) {
          const line = lines[i].trim();
          if (line) {
            try {
              const data = JSON.parse(line);
              if (data.choices?.[0]?.delta?.content) {
                onChunk(data.choices[0].delta.content);
              }
            } catch (e) {
              // Continue on parse error
            }
          }
        }

        chunk = lines[lines.length - 1];
      }

      if (chunk.trim()) {
        const data = JSON.parse(chunk);
        if (data.choices?.[0]?.delta?.content) {
          onChunk(data.choices[0].delta.content);
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  getAvailableProviders(): string[] {
    return ['gemini', 'deepseek', 'openai'];
  }
}

export const llmClient = new LLMClient();
