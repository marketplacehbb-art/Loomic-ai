/**
 * Test API Client
 * Simple test to verify both LLM endpoints
 */

import { llmClient } from '../client/src/lib/llm-client';

async function testLLMProviders() {
  console.log('🧪 Testing LLM Providers...\n');

  const testPrompt = 'Write a simple React counter component in TypeScript';

  // Test Groq
  console.log('1️⃣ Testing Groq Provider...');
  try {
    const groqResponse = await llmClient.generate({
      provider: 'groq',
      prompt: testPrompt,
      systemPrompt: 'You are a React developer. Keep responses concise.',
      temperature: 0.7,
      maxTokens: 500
    });

    console.log('✅ Groq Response:');
    console.log(groqResponse.substring(0, 200) + '...\n');
  } catch (error) {
    console.error('❌ Groq Error:', error instanceof Error ? error.message : error, '\n');
  }

  // Test Gemini
  console.log('2️⃣ Testing Gemini Provider...');
  try {
    const geminiResponse = await llmClient.generate({
      provider: 'gemini',
      prompt: testPrompt,
      systemPrompt: 'You are a React developer. Keep responses concise.',
      temperature: 0.7,
      maxTokens: 500
    });

    console.log('✅ Gemini Response:');
    console.log(geminiResponse.substring(0, 200) + '...\n');
  } catch (error) {
    console.error('❌ Gemini Error:', error instanceof Error ? error.message : error, '\n');
  }

  console.log('🎉 Tests completed!');
}

// Run tests if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  testLLMProviders().catch(console.error);
}

export { testLLMProviders };
