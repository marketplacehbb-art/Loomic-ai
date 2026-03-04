/**
 * LLM Config
 */

export const LLM_PROVIDERS = {
  gemini: {
    name: 'Google Gemini',
    model: 'gemini-2.0-flash',
    description: 'Google\'s latest model',
    icon: '*'
  },
  groq: {
    name: 'Groq Llama',
    model: 'meta-llama/llama-4-maverick-17b-128e-instruct',
    description: 'Ultra-low latency Llama inference',
    icon: '*'
  },
  openai: {
    name: 'OpenAI',
    model: 'gpt-4o',
    description: 'General-purpose flagship model',
    icon: '*'
  },
  nvidia: {
    name: 'NVIDIA Qwen',
    model: 'qwen/qwen3.5-397b-a17b',
    description: 'Large-code-capable Qwen model via NVIDIA NIM',
    icon: '*'
  }
} as const;

export const DEFAULT_SYSTEM_PROMPT = `You are an expert React + TypeScript developer.
Generate production-ready code with:
- Proper TypeScript types
- React best practices
- Tailwind CSS for styling
- Clear comments and documentation`;
