import { styleDNAInjector, type StyleDNA } from '../server/ai/elite-features/style-dna-injector.js';

function assert(condition: unknown, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

async function runPatternNormalizationTest(): Promise<void> {
  const code = `
import React from 'react';

export default function app() {
  const [value, setValue] = React.useState(0);
  return <div class="p-4">{value}</div>;
}
`;

  const dna: StyleDNA = {
    namingConventions: {
      components: 'PascalCase',
      functions: 'camelCase',
      variables: 'camelCase',
      constants: 'UPPER_SNAKE_CASE',
    },
    codeStructure: {
      importOrder: ['react', 'other'],
      componentStructure: 'separated',
      spacing: 'standard',
    },
    patterns: {
      hooks: 'standard',
      stateManagement: 'useState',
      styling: 'tailwind',
    },
    preferences: {
      useTypeScript: true,
      useJSDoc: true,
      useExplicitTypes: true,
      preferArrowFunctions: true,
    },
  };

  const result = await styleDNAInjector.injectStyle(code, dna, 'App.tsx');
  assert(result.styleApplied, 'style DNA should apply at least one change');
  assert(result.code.includes('function App'), 'default component should be PascalCase');
  assert(result.code.includes('useState('), 'React.useState should be normalized');
  assert(result.code.includes('className="p-4"'), 'class should be converted to className');
  assert(result.code.includes(': JSX.Element'), 'explicit return type should be added');
}

async function runExtractDefaultTest(): Promise<void> {
  const extracted = await styleDNAInjector.extractStyleDNA({});
  assert(extracted.patterns.styling === 'tailwind', 'default style should be tailwind');
  assert(extracted.namingConventions.components === 'PascalCase', 'default component naming should be PascalCase');
}

async function main(): Promise<void> {
  console.log('\nStarting Style DNA Injector Tests...\n');

  await runPatternNormalizationTest();
  console.log('PASS: style normalization pipeline');

  await runExtractDefaultTest();
  console.log('PASS: default extraction fallback');

  console.log('\nAll style DNA injector tests passed.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

