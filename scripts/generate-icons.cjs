/**
 * Build-Time Icon List Generator
 * Extracts all lucide-react icon names from TypeScript definitions
 * Runs automatically after npm install
 */

const fs = require('fs');
const path = require('path');

// ANSI color codes for console
const colors = {
    reset: '\x1b[0m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    red: '\x1b[31m',
    blue: '\x1b[34m'
};

function log(message, color = 'reset') {
    console.log(`${colors[color]}${message}${colors.reset}`);
}

/**
 * Find lucide-react type definition file
 */
function findLucideTypeDef() {
    const possiblePaths = [
        // Option 1: @types/lucide-react
        path.join(process.cwd(), 'node_modules/@types/lucide-react/index.d.ts'),
        // Option 2: lucide-react built-in types
        path.join(process.cwd(), 'node_modules/lucide-react/dist/lucide-react.d.ts'),
        path.join(process.cwd(), 'node_modules/lucide-react/dist/index.d.ts'),
        // Option 3: Client node_modules
        path.join(process.cwd(), 'client/node_modules/lucide-react/dist/lucide-react.d.ts'),
        path.join(process.cwd(), 'client/node_modules/lucide-react/dist/index.d.ts'),
    ];

    for (const typePath of possiblePaths) {
        if (fs.existsSync(typePath)) {
            log(`✅ Found type definition: ${typePath}`, 'green');
            return typePath;
        }
    }

    return null;
}

/**
 * Extract icon names from TypeScript definition file
 */
function extractIconNames(typeDefPath) {
    log('🔍 Reading type definition file...', 'blue');

    const fs = require('fs');
    const content = fs.readFileSync(typeDefPath, 'utf-8');
    const iconNames = new Set();

    // Pattern 1: export declare const IconName: LucideIcon;
    const pattern1 = /export\s+(?:declare\s+)?const\s+([A-Z][a-zA-Z0-9]*)\s*:\s*LucideIcon/g;
    let match;

    while ((match = pattern1.exec(content)) !== null) {
        iconNames.add(match[1]);
    }

    // Pattern 2: export { IconName }
    const pattern2 = /export\s*{([^}]+)}/g;
    while ((match = pattern2.exec(content)) !== null) {
        const exports = match[1].split(',');
        exports.forEach(exp => {
            const name = exp.trim().split(/\s+/)[0];
            // Only add if starts with capital letter and not a type/interface
            if (/^[A-Z][a-zA-Z0-9]*$/.test(name) &&
                name !== 'LucideIcon' &&
                name !== 'Icon' &&
                name !== 'IconNode' &&
                !name.startsWith('Lucide')) {
                iconNames.add(name);
            }
        });
    }

    // Pattern 3: Individual export statements
    const pattern3 = /export\s+(?:declare\s+)?(?:const|let|var)\s+([A-Z][a-zA-Z0-9]*)/g;
    while ((match = pattern3.exec(content)) !== null) {
        const name = match[1];
        if (name !== 'LucideIcon' &&
            name !== 'Icon' &&
            name !== 'IconNode' &&
            !name.startsWith('Lucide') &&
            !name.endsWith('Props')) {
            iconNames.add(name);
        }
    }

    return Array.from(iconNames).sort();
}

/**
 * Get lucide-react version
 */
function getLucideVersion() {
    try {
        const pkgPath = path.join(process.cwd(), 'node_modules/lucide-react/package.json');
        if (fs.existsSync(pkgPath)) {
            const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
            return pkg.version;
        }

        // Try client node_modules
        const clientPkgPath = path.join(process.cwd(), 'client/node_modules/lucide-react/package.json');
        if (fs.existsSync(clientPkgPath)) {
            const pkg = JSON.parse(fs.readFileSync(clientPkgPath, 'utf-8'));
            return pkg.version;
        }
    } catch (error) {
        log(`⚠️  Could not read lucide-react version: ${error.message}`, 'yellow');
    }
    return 'unknown';
}

/**
 * Generate fallback icon list (Top 100 most common icons)
 */
function getFallbackIcons() {
    return [
        // Navigation (20)
        'Home', 'Menu', 'ChevronLeft', 'ChevronRight', 'ChevronDown', 'ChevronUp',
        'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'X', 'Check',
        'Plus', 'Minus', 'MoveLeft', 'MoveRight', 'Navigation', 'MapPin',
        'Compass', 'Map',

        // UI Controls (20)
        'User', 'Settings', 'Bell', 'Search', 'Filter', 'Eye', 'EyeOff',
        'Edit', 'Edit2', 'Edit3', 'Copy', 'Trash', 'Trash2', 'Save',
        'Download', 'Upload', 'Share', 'Share2', 'MoreVertical', 'MoreHorizontal',

        // Communication (15)
        'Mail', 'Phone', 'MessageCircle', 'MessageSquare', 'Send', 'Inbox',
        'AtSign', 'Video', 'Mic', 'MicOff', 'PhoneCall', 'PhoneMissed',
        'Voicemail', 'Reply', 'ReplyAll',

        // Content (15)
        'Calendar', 'Clock', 'Star', 'Heart', 'Bookmark', 'Tag', 'Flag',
        'Image', 'Film', 'Music', 'File', 'FileText', 'Folder', 'FolderOpen',
        'Package',

        // Business (15)
        'BarChart', 'BarChart2', 'BarChart3', 'LineChart', 'PieChart',
        'TrendingUp', 'TrendingDown', 'DollarSign', 'ShoppingCart', 'ShoppingBag',
        'CreditCard', 'Wallet', 'Receipt', 'Tag', 'Percent',

        // Data & Files (10)
        'Database', 'Server', 'HardDrive', 'Cloud', 'CloudUpload', 'CloudDownload',
        'ArchiveIcon', 'Paperclip', 'Link', 'ExternalLink',

        // Food & Beverage (4)
        'Coffee', 'CupSoda', 'Pizza', 'Utensils'
    ];
}

/**
 * Main execution
 */
function generateIcons() {
    const fs = require('fs');
    const path = require('path');

    log('\n🚀 Lucide-React Icon List Generator', 'blue');
    log('=====================================\n', 'blue');

    // Step 1: Find type definition
    const typeDefPath = findLucideTypeDef();

    let icons = [];
    let source = 'type-definitions';

    if (typeDefPath) {
        try {
            // Step 2: Extract icons
            icons = extractIconNames(typeDefPath);
            log(`✅ Extracted ${icons.length} icons from type definitions`, 'green');

            if (icons.length === 0) {
                throw new Error('No icons found in type definitions');
            }
        } catch (error) {
            log(`❌ Failed to extract from type definitions: ${error.message}`, 'red');
            log('⚠️  Falling back to hardcoded icon list...', 'yellow');
            icons = getFallbackIcons();
            source = 'fallback';
        }
    } else {
        log('⚠️  lucide-react type definitions not found', 'yellow');
        log('⚠️  Using fallback icon list (100 most common icons)', 'yellow');
        icons = getFallbackIcons();
        source = 'fallback';
    }

    // Step 3: Get version
    const version = getLucideVersion();

    // Step 4: Create output data
    const output = {
        icons,
        metadata: {
            version,
            totalIcons: icons.length,
            generated: new Date().toISOString(),
            source,
            generator: 'scripts/generate-icons.js'
        }
    };

    // Step 5: Ensure output directory exists
    const outputDir = path.join(process.cwd(), 'server/data');
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
        log(`📁 Created directory: ${outputDir}`, 'blue');
    }

    // Step 6: Write to file
    const outputPath = path.join(outputDir, 'lucide-icons.json');
    fs.writeFileSync(outputPath, JSON.stringify(output, null, 2), 'utf-8');

    log(`\n✅ Icon list generated successfully!`, 'green');
    log(`📄 Output: ${outputPath}`, 'green');
    log(`📊 Total icons: ${icons.length}`, 'green');
    log(`📦 Lucide version: ${version}`, 'green');
    log(`🔄 Source: ${source}`, 'green');

    if (source === 'fallback') {
        log(`\n⚠️  NOTE: Using fallback list. Install lucide-react to get full icon list.`, 'yellow');
    }

    log('\n✨ Done!\n', 'green');
}

// Run generator
try {
    generateIcons();
} catch (error) {
    log(`\n❌ Error generating icon list: ${error.message}`, 'red');
    log('⚠️  Icon registry will use fallback list at runtime\n', 'yellow');
    process.exit(0); // Don't fail build, just warn
}
