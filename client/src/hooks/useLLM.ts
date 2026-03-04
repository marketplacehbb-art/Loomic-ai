/**
 * Custom React Hook for LLM Integration
 */

import { useState, useCallback } from 'react';
import { llmClient, type GenerateRequest, type GenerateResponse } from '@lib/llm-client';

interface UseLLMOptions {
  provider?: 'gemini' | 'groq' | 'openai' | 'nvidia';
  temperature?: number;
  maxTokens?: number;
}

interface GenerateOptions {
  validate?: boolean;
  bundle?: boolean;
}

export function useLLM(options: UseLLMOptions = {}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [response, setResponse] = useState<GenerateResponse | null>(null);
  const [streamedContent, setStreamedContent] = useState('');

  const generate = useCallback(
    async (prompt: string, systemPrompt?: string, genOptions?: GenerateOptions) => {
      setLoading(true);
      setError(null);
      setResponse(null);
      setStreamedContent('');

      try {
        const result = await llmClient.generate({
          provider: options.provider || 'gemini',
          prompt,
          systemPrompt,
          temperature: options.temperature,
          maxTokens: options.maxTokens,
          validate: genOptions?.validate,
          bundle: genOptions?.bundle
        } as GenerateRequest);

        setResponse(result);
        return result;
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Unknown error';
        setError(errorMsg);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    // Use primitive values so the callback isn't recreated when the caller
    // passes a new options object literal with the same values.
    [options.provider, options.temperature, options.maxTokens]
  );

  const generateStream = useCallback(
    async (prompt: string, systemPrompt?: string, genOptions?: GenerateOptions) => {
      setLoading(true);
      setError(null);
      setStreamedContent('');

      try {
        await llmClient.generateStream(
          {
            provider: options.provider || 'gemini',
            prompt,
            systemPrompt,
            temperature: options.temperature,
            maxTokens: options.maxTokens,
            validate: genOptions?.validate,
            bundle: genOptions?.bundle
          } as GenerateRequest,
          (chunk) => {
            setStreamedContent((prev) => prev + chunk);
          }
        );
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Unknown error';
        setError(errorMsg);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    // Same: use primitives to avoid spurious re-creation.
    [options.provider, options.temperature, options.maxTokens]
  );

  return {
    generate,
    generateStream,
    loading,
    error,
    response,
    streamedContent
  };
}
