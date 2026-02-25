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
  deepseek: {
    name: 'DeepSeek',
    model: 'deepseek-coder',
    description: 'Specialized coding model',
    icon: '*'
  },
  openai: {
    name: 'OpenAI',
    model: 'gpt-4o',
    description: 'General-purpose flagship model',
    icon: '*'
  }
} as const;

export const DEFAULT_SYSTEM_PROMPT = `You are an expert React + TypeScript developer.
Generate production-ready code with:
- Proper TypeScript types
- React best practices
- Tailwind CSS for styling
- Clear comments and documentation`;
