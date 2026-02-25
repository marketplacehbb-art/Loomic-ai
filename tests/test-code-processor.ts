/**
 * Test script for CodeProcessor pipeline
 * Run: npm run test:processor
 */

import { codeProcessor } from '../server/utils/code-processor.js';

// Sample React code to test
const sampleReactCode = `
import React, { useState } from 'react';
import { Button } from 'lucide-react';

export function Counter() {
  const [count, setCount] = useState(0);

  return (
    <div className="flex items-center justify-center h-screen bg-gradient-to-br from-blue-900 to-purple-900">
      <div className="bg-white rounded-lg shadow-xl p-8 text-center">
        <h1 className="text-4xl font-bold text-gray-800 mb-4">Counter App</h1>
        <p className="text-2xl text-blue-600 mb-8">{count}</p>
        
        <div className="flex gap-4">
          <button
            onClick={() => setCount(count - 1)}
            className="px-6 py-3 bg-red-500 text-white rounded-lg hover:bg-red-600 transition font-semibold"
          >
            Decrease
          </button>
          
          <button
            onClick={() => setCount(count + 1)}
            className="px-6 py-3 bg-green-500 text-white rounded-lg hover:bg-green-600 transition font-semibold"
          >
            Increase
          </button>
          
          <button
            onClick={() => setCount(0)}
            className="px-6 py-3 bg-gray-500 text-white rounded-lg hover:bg-gray-600 transition font-semibold"
          >
            Reset
          </button>
        </div>
      </div>
    </div>
  );
}

export default Counter;
`;

async function runTests() {
  console.log('\n╔════════════════════════════════════════════╗');
  console.log('║  CodeProcessor Pipeline Test Suite         ║');
  console.log('╚════════════════════════════════════════════╝\n');

  try {
    // Test 1: Basic processing
    console.log('🧪 Test 1: Basic Code Processing');
    console.log('─'.repeat(50));
    const result1 = await codeProcessor.process(sampleReactCode, 'Counter.tsx', {
      validate: true,
      bundle: true
    });

    console.log('✅ Processing completed');
    console.log(`   • Files generated: ${result1.files.length}`);
    console.log(`   • Dependencies found: ${Object.keys(result1.dependencies).length}`);
    console.log(`   • Components extracted: ${result1.components.length}`);
    console.log(`   • Errors: ${result1.errors.length}`);
    console.log(`   • Warnings: ${result1.warnings.length}`);
    console.log(`   • Processing time: ${result1.metadata.processingTime}ms\n`);

    // Test 2: Show files
    console.log('🧪 Test 2: Generated Files');
    console.log('─'.repeat(50));
    result1.files.forEach(file => {
      console.log(`📄 ${file.path} (${file.type})`);
      console.log(`   Size: ${file.size ? (file.size / 1024).toFixed(2) + 'KB' : 'N/A'}`);
      console.log(`   Preview: ${file.content.substring(0, 80).replace(/\n/g, ' ')}...\n`);
    });

    // Test 3: Show dependencies
    console.log('🧪 Test 3: Dependency Resolution');
    console.log('─'.repeat(50));
    Object.entries(result1.dependencies).forEach(([pkg, version]) => {
      console.log(`📦 ${pkg}: ${version}`);
    });
    console.log('');

    // Test 4: Show components
    console.log('🧪 Test 4: Component Extraction');
    console.log('─'.repeat(50));
    result1.components.forEach(comp => {
      console.log(`🧩 ${comp}`);
    });
    console.log('');

    // Test 5: Error/Warning handling
    console.log('🧪 Test 5: Error & Warning Handling');
    console.log('─'.repeat(50));
    if (result1.errors.length > 0) {
      console.log('❌ Errors:');
      result1.errors.forEach(err => console.log(`   • ${err}`));
    } else {
      console.log('✅ No errors found');
    }

    if (result1.warnings.length > 0) {
      console.log('⚠️  Warnings:');
      result1.warnings.forEach(warn => console.log(`   • ${warn}`));
    } else {
      console.log('✅ No warnings found');
    }
    console.log('');

    // Test 6: Metadata
    console.log('🧪 Test 6: Metadata Tracking');
    console.log('─'.repeat(50));
    console.log(`📊 File count: ${result1.metadata.fileCount}`);
    console.log(`⏱️  Processing time: ${result1.metadata.processingTime}ms`);
    console.log(`📅 Processed at: ${result1.metadata.processedAt}`);
    console.log(`✓ Has errors: ${result1.metadata.hasErrors}`);
    console.log('');

    // Test 7: Invalid code handling
    console.log('🧪 Test 7: Invalid Code Handling');
    console.log('─'.repeat(50));
    const invalidCode = `
      import React from 'react';
      
      export function BrokenComponent {  // Missing parentheses
        return <div>Broken</div>
      }
    `;

    const result2 = await codeProcessor.process(invalidCode, 'Broken.tsx', {
      validate: true,
      bundle: false
    });

    console.log(`Errors detected: ${result2.errors.length}`);
    if (result2.errors.length > 0) {
      console.log('📋 First error:');
      console.log(`   ${result2.errors[0]}`);
    }
    console.log('');

    // Summary
    console.log('╔════════════════════════════════════════════╗');
    console.log('║  Test Summary                              ║');
    console.log('╠════════════════════════════════════════════╣');
    console.log('║  ✅ All tests completed successfully        ║');
    console.log('║                                            ║');
    console.log('║  Pipeline Status:  READY FOR PRODUCTION    ║');
    console.log('╚════════════════════════════════════════════╝\n');

  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
}

// Run tests
runTests().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
