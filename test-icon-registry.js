/**
 * Test Script for Icon Registry
 * Verifies icon discovery, fuzzy matching, and registry functionality
 */

import { iconRegistry } from './server/utils/icon-registry.js';

async function runTests() {
    console.log('🧪 Starting Icon Registry Tests...\n');

    // Test 1: Icon Discovery
    console.log('Test 1: Icon Discovery');
    console.log('================================');
    await iconRegistry.discoverIcons();
    const stats = iconRegistry.getStats();
    console.log(`✅ Discovered ${stats.totalIcons} icons`);
    console.log(`✅ Found ${stats.categories} categories`);
    console.log(`✅ Top categories:`, stats.topCategories);

    const expectedIconCount = 200; // Minimum expected
    if (stats.totalIcons >= expectedIconCount) {
        console.log(`✅ PASS: Icon count (${stats.totalIcons}) >= ${expectedIconCount}\n`);
    } else {
        console.log(`❌ FAIL: Icon count (${stats.totalIcons}) < ${expectedIconCount}\n`);
    }

    // Test 2: Fuzzy Matching - Cup → CupSoda
    console.log('Test 2: Fuzzy Matching (Cup → CupSoda)');
    console.log('================================');
    const cupCorrection = iconRegistry.autoCorrect('Cup');
    console.log(`Input: "Cup"`);
    console.log(`Corrected: "${cupCorrection.corrected}"`);
    console.log(`Confidence: ${(cupCorrection.confidence * 100).toFixed(0)}%`);
    console.log(`Suggestions: [${cupCorrection.suggestions.join(', ')}]`);

    if (cupCorrection.corrected === 'CupSoda' && cupCorrection.confidence >= 0.9) {
        console.log(`✅ PASS: Cup correctly mapped to CupSoda with ${(cupCorrection.confidence * 100).toFixed(0)}% confidence\n`);
    } else {
        console.log(`❌ FAIL: Expected CupSoda with >90% confidence\n`);
    }

    // Test 3: Typo Correction
    console.log('Test 3: Typo Correction (Cupp → CupSoda)');
    console.log('================================');
    const typoCorrection = iconRegistry.autoCorrect('Cupp');
    console.log(`Input: "Cupp" (typo)`);
    console.log(`Corrected: "${typoCorrection.corrected}"`);
    console.log(`Confidence: ${(typoCorrection.confidence * 100).toFixed(0)}%`);
    console.log(`Suggestions: [${typoCorrection.suggestions.join(', ')}]`);

    if (typoCorrection.suggestions.length > 0) {
        console.log(`✅ PASS: Typo provides suggestions\n`);
    } else {
        console.log(`⚠️ WARN: No suggestions for typo\n`);
    }

    // Test 4: Direct Icon Lookup
    console.log('Test 4: Direct Icon Lookup');
    console.log('================================');
    const hasHome = iconRegistry.hasIcon('Home');
    const hasUser = iconRegistry.hasIcon('User');
    const hasCupSoda = iconRegistry.hasIcon('CupSoda');
    const hasFakeIcon = iconRegistry.hasIcon('ThisIconDoesNotExist');

    console.log(`hasIcon('Home'): ${hasHome}`);
    console.log(`hasIcon('User'): ${hasUser}`);
    console.log(`hasIcon('CupSoda'): ${hasCupSoda}`);
    console.log(`hasIcon('ThisIconDoesNotExist'): ${hasFakeIcon}`);

    if (hasHome && hasUser && hasCupSoda && !hasFakeIcon) {
        console.log(`✅ PASS: Icon lookup working correctly\n`);
    } else {
        console.log(`❌ FAIL: Icon lookup has issues\n`);
    }

    // Test 5: Category Listing
    console.log('Test 5: Category Listing');
    console.log('================================');
    const categories = iconRegistry.getCategories();
    console.log(`Categories: [${categories.join(', ')}]`);

    if (categories.includes('Food & Beverage') && categories.includes('Navigation')) {
        console.log(`✅ PASS: Key categories found\n`);
    } else {
        console.log(`❌ FAIL: Missing expected categories\n`);
    }

    // Test 6: Prompt Output
    console.log('Test 6: Prompt Formatting');
    console.log('================================');
    const promptOutput = iconRegistry.formatForPrompt();
    const hasIconCount = promptOutput.includes('Total:');
    const hasCategories = promptOutput.includes('Food & Beverage');
    const hasWarning = promptOutput.includes('CRITICAL');

    console.log(`Prompt length: ${promptOutput.length} characters`);
    console.log(`Contains total count: ${hasIconCount}`);
    console.log(`Contains categories: ${hasCategories}`);
    console.log(`Contains warnings: ${hasWarning}`);

    if (hasIconCount && hasCategories && hasWarning) {
        console.log(`✅ PASS: Prompt formatting correct\n`);
    } else {
        console.log(`❌ FAIL: Prompt formatting incomplete\n`);
    }

    // Summary
    console.log('\n' + '='.repeat(50));
    console.log('📊 Test Summary');
    console.log('='.repeat(50));
    console.log(`Total Icons: ${stats.totalIcons}`);
    console.log(`Categories: ${stats.categories}`);
    console.log(`Cup → CupSoda: ${cupCorrection.corrected} (${(cupCorrection.confidence * 100).toFixed(0)}%)`);
    console.log('='.repeat(50));
    console.log('✅ All tests completed!');
}

runTests().catch(console.error);
