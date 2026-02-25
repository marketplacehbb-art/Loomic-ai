import { Project, ImportDeclaration } from 'ts-morph';
import { iconRegistry } from '../../utils/icon-registry.js';

function escapeRegExp(input: string): string {
    return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function applyIdentifierReplacements(code: string, replacements: Map<string, string>): string {
    let output = code;
    const entries = Array.from(replacements.entries())
        .filter(([from, to]) => from !== to)
        .sort((a, b) => b[0].length - a[0].length);

    for (const [from, to] of entries) {
        const pattern = new RegExp(`\\b${escapeRegExp(from)}\\b`, 'g');
        output = output.replace(pattern, to);
    }

    return output;
}

/**
 * Enterprise Icon Validator Pipeline Step
 * Validates and sanitizes Lucide icon imports using AST manipulation
 */
export class IconValidator {
    private static instance: IconValidator;
    private project: Project;

    private constructor() {
        // Singleton Project instance for performance
        this.project = new Project({
            useInMemoryFileSystem: true,
            compilerOptions: {
                skipLibCheck: true
            }
        });
    }

    public static getInstance(): IconValidator {
        if (!IconValidator.instance) {
            IconValidator.instance = new IconValidator();
        }
        return IconValidator.instance;
    }

    /**
     * Validate and fix icon imports in the provided code
     */
    public validate(code: string): string {
        // Create a virtual source file
        const sourceFile = this.project.createSourceFile('temp.tsx', code, { overwrite: true });

        // Find all lucide-react imports
        const lucideImports = sourceFile
            .getImportDeclarations()
            .filter((decl: ImportDeclaration) => decl.getModuleSpecifierValue() === 'lucide-react');

        if (lucideImports.length === 0) {
            return code; // No icons to validate
        }

        // Process named imports across all lucide-react declarations
        const namedImports = lucideImports.flatMap((decl) => decl.getNamedImports());

        // Check existing imports BEFORE processing to avoid duplicates
        const existingImports = new Set(namedImports.map(imp => imp.getName()));
        const identifierReplacements = new Map<string, string>();

        for (const namedImport of namedImports) {
            const importedName = namedImport.getName();
            const aliasNode = namedImport.getAliasNode();
            const localName = aliasNode ? aliasNode.getText() : importedName;

            // 1. Resolve canonical export name (direct export or alias)
            const canonicalName =
                iconRegistry.resolveCanonicalName(importedName) ||
                iconRegistry.resolveCanonicalName(localName);
            if (canonicalName) {
                if (canonicalName !== importedName || canonicalName !== localName) {
                    identifierReplacements.set(localName, canonicalName);

                    if (existingImports.has(canonicalName)) {
                        console.log(`[IconValidator] Canonical icon "${canonicalName}" already imported. Removing alias "${importedName}".`);
                        namedImport.remove();
                        continue;
                    }

                    console.log(`[IconValidator] Canonicalizing icon "${importedName}" -> "${canonicalName}"`);
                    if (aliasNode) {
                        namedImport.renameAlias(canonicalName);
                    }
                    namedImport.setName(canonicalName);
                    existingImports.add(canonicalName);
                }
                continue;
            }

            console.warn(`[IconValidator] Invalid icon detected: "${importedName}"`);

            // 2. Try Auto-Correction (Alias or Fuzzy)
            const correction = iconRegistry.autoCorrect(importedName);

            if (correction.corrected && correction.confidence > 0.6) {
                // Check if corrected icon already exists
                if (existingImports.has(correction.corrected)) {
                    console.log(`[IconValidator] Corrected icon "${correction.corrected}" already imported. Removing invalid "${importedName}".`);
                    identifierReplacements.set(localName, correction.corrected);
                    namedImport.remove();
                    continue;
                }
                 
                console.log(`[IconValidator] Auto-correcting "${importedName}" -> "${correction.corrected}"`);
                if (aliasNode) {
                    namedImport.renameAlias(correction.corrected);
                }
                namedImport.setName(correction.corrected);     // Update the import name
                identifierReplacements.set(localName, correction.corrected);
                existingImports.add(correction.corrected);    // Track new import
            } else {
                // 3. Fallback to Info (valid lucide export)
                // Check if Info already exists
                if (existingImports.has('Info')) {
                    console.log(`[IconValidator] Info already imported. Removing invalid "${importedName}".`);
                    identifierReplacements.set(localName, 'Info');
                    namedImport.remove();
                    continue;
                }

                console.log(`[IconValidator] No close match for "${importedName}". Replacing with fallback "Info".`);
                if (aliasNode) {
                    namedImport.renameAlias('Info');
                }
                namedImport.setName('Info');
                identifierReplacements.set(localName, 'Info');
                existingImports.add('Info'); // Track new import
            }
        }

        // Consolidate all lucide imports into the first declaration and dedupe names globally
        const primaryImport = lucideImports[0];
        const uniqueNames: string[] = [];
        const seenNames = new Set<string>();

        lucideImports.forEach((decl) => {
            decl.getNamedImports().forEach((imp) => {
                const name = imp.getName();
                if (!seenNames.has(name)) {
                    seenNames.add(name);
                    uniqueNames.push(name);
                }
            });
        });

        // Reset primary named imports and rebuild deduped set
        primaryImport.getNamedImports().forEach((imp) => imp.remove());
        uniqueNames.forEach((name) => primaryImport.addNamedImport(name));

        // Remove all additional lucide-react declarations
        lucideImports.slice(1).forEach((decl) => decl.remove());

        // Remove empty import if no names are left
        if (primaryImport.getNamedImports().length === 0 && !primaryImport.getDefaultImport() && !primaryImport.getNamespaceImport()) {
            primaryImport.remove();
        }

        const normalizedCode = sourceFile.getFullText();
        return applyIdentifierReplacements(normalizedCode, identifierReplacements);
    }
}

export const iconValidator = IconValidator.getInstance();
