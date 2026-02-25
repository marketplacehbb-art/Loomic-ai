import { distance } from 'fastest-levenshtein';

interface IconInfo {
    name: string;
    category: string;
    aliases: string[];
}

interface IconMetadata {
    version: string;
    totalIcons: number;
    generated: string;
    source: string;
    generator: string;
}

interface IconData {
    icons: string[];
    metadata: IconMetadata;
}

/**
 * Enterprise Icon Registry (Build-Time Version)
 * Loads pre-generated icon list from JSON instead of runtime import
 */
class IconRegistry {
    private icons: Map<string, IconInfo> = new Map();
    private categories: Map<string, string[]> = new Map();
    private initialized: boolean = false;
    private initializationSource: 'none' | 'fallback' | 'full' = 'none';
    private iconData: IconData | null = null;

    private ensureInitialized(): void {
        if (this.initialized) return;
        this.loadFallbackIcons();
    }

    /**
     * Load icons from pre-generated JSON file
     */
    async discoverIcons(): Promise<void> {
        if (this.initialized && this.initializationSource === 'full') {
            return; // Already initialized
        }

        console.log('🔍 Loading lucide-react icons from build-time generated list...');

        try {
            this.icons.clear();
            this.categories.clear();

            // Load from generated JSON file
            const { readFileSync } = await import('fs');
            const { join } = await import('path');

            const jsonPath = join(process.cwd(), 'server/data/lucide-icons.json');
            const jsonContent = readFileSync(jsonPath, 'utf-8');
            this.iconData = JSON.parse(jsonContent);

            if (!this.iconData || !this.iconData.icons) {
                throw new Error('Invalid icon data format');
            }

            const iconNames = this.iconData.icons;

            if (!iconNames || iconNames.length === 0) {
                throw new Error('Icon list is empty');
            }

            // Categorize icons
            for (const iconName of iconNames) {
                const category = this.categorizeIcon(iconName);
                const aliases = this.getIconAliases(iconName);

                this.icons.set(iconName, {
                    name: iconName,
                    category,
                    aliases
                });

                if (!this.categories.has(category)) {
                    this.categories.set(category, []);
                }
                const categoryIcons = this.categories.get(category);
                if (categoryIcons) {
                    categoryIcons.push(iconName);
                }
            }

            this.initialized = true;
            this.initializationSource = 'full';
            if (this.iconData && this.iconData.metadata) {
                console.log(`✅ Loaded ${this.icons.size} icons from ${this.iconData.metadata.source}`);
                console.log(`📦 Version: ${this.iconData.metadata.version}`);
            } else {
                console.log(`✅ Loaded ${this.icons.size} icons`);
            }
        } catch (error: any) {
            console.error(`⚠️ Failed to load icon list: ${error.message}`);
            console.log('🔄 Falling back to minimal hardcoded icon list...');

            // Fallback: Load minimal hardcoded list
            this.loadFallbackIcons();
        }
    }

    /**
     * Fallback icon loading (minimal essential icons)
     */
    private loadFallbackIcons(): void {
        this.icons.clear();
        this.categories.clear();

        const fallbackIcons = [
            // Essential Navigation
            'Home', 'Menu', 'X', 'ChevronLeft', 'ChevronRight', 'ArrowLeft', 'ArrowRight',
            // Essential UI
            'User', 'Settings', 'Bell', 'Search', 'Filter', 'Plus', 'Minus', 'Check',
            // Essential Communication
            'Mail', 'Phone', 'MessageCircle', 'Calendar', 'Clock',
            // Essential Content
            'Star', 'Heart', 'Bookmark', 'Tag', 'File', 'Folder',
            // Essential Business
            'BarChart3', 'TrendingUp', 'DollarSign', 'ShoppingCart',
            // Essential Data
            'Database', 'Download', 'Upload', 'Trash2', 'Edit', 'Copy',
            // Essential Icons
            'Coffee', 'CupSoda'
        ];

        for (const iconName of fallbackIcons) {
            const category = this.categorizeIcon(iconName);
            const aliases = this.getIconAliases(iconName);

            this.icons.set(iconName, {
                name: iconName,
                category,
                aliases
            });

            if (!this.categories.has(category)) {
                this.categories.set(category, []);
            }
            const categoryIcons = this.categories.get(category);
            if (categoryIcons) {
                categoryIcons.push(iconName);
            }
        }

        this.initialized = true;
        this.initializationSource = 'fallback';
        console.log(`✅ Loaded ${this.icons.size} fallback icons`);
    }

    /**
     * Kategorisiere Icon basierend auf Namen
     */
    private categorizeIcon(name: string): string {
        // Food & Beverage
        if (/Coffee|Cup|Mug|Pizza|Cake|Beer|Wine|Cookie|Utensils|Beef|Fish|Sandwich|Apple|Banana|Salad/i.test(name)) {
            return 'Food & Beverage';
        }

        // Navigation
        if (/Home|Menu|Arrow|Chevron|Navigation|Map|Compass|Move|Corner/i.test(name)) {
            return 'Navigation';
        }

        // UI Controls
        if (/Button|Input|Check|Plus|Minus|Search|Filter|Settings|Toggle|Slider|Radio|Checkbox/i.test(name)) {
            return 'UI';
        }

        // Business & Finance
        if (/Dollar|Credit|Shopping|Cart|Trend|BarChart|PieChart|LineChart|Wallet|Coins|Receipt/i.test(name)) {
            return 'Business';
        }

        // Communication
        if (/Mail|Phone|Message|Chat|Bell|Share|Send|Inbox|Reply/i.test(name)) {
            return 'Communication';
        }

        // Data & Files
        if (/File|Folder|Database|Download|Upload|Save|Cloud|Server|HardDrive/i.test(name)) {
            return 'Data';
        }

        // Social
        if (/User|Users|Heart|ThumbsUp|Star|Award|Crown|Smile|Flag/i.test(name)) {
            return 'Social';
        }

        // Media
        if (/Play|Pause|Music|Video|Camera|Image|Film|Volume|Mic/i.test(name)) {
            return 'Media';
        }

        // Status & Alerts
        if (/Alert|Info|Warning|Error|Check|X|Circle|Shield|Lock|Unlock/i.test(name)) {
            return 'Status';
        }

        return 'Other';
    }

    /**
     * Definiere Synonyme für häufige Fehler
     */
    private getIconAliases(name: string): string[] {
        const aliasMap: Record<string, string[]> = {
            'CupSoda': ['Cup', 'SodaCup', 'DrinkCup', 'Beverage'],
            'Coffee': ['CoffeeCup', 'CoffeeMug', 'Espresso'],
            'ShoppingCart': ['Cart', 'Basket'],
            'User': ['Profile', 'Account', 'Person'],
            'Users': ['People', 'Group', 'Team'],
            'Mail': ['Email', 'Envelope', 'Letter'],
            'Phone': ['Call', 'Telephone', 'Mobile'],
            'Trash2': ['Trash', 'Delete', 'Bin', 'Remove'],
            'FileText': ['Document', 'File', 'Doc'],
            'Calendar': ['Date', 'Schedule'],
            'Clock': ['Time', 'Watch'],
            'Settings': ['Config', 'Preferences', 'Gear'],
            'Search': ['Find', 'Magnifier', 'Lookup'],
            'Bell': ['Notification', 'Alert', 'Ring'],
            'Home': ['House', 'Dashboard'],
            'Heart': ['Like', 'Love', 'Favorite'],
            'Star': ['Favorite', 'Rating'],
            'Info': ['HelpCircle', 'CircleHelp', 'QuestionCircle', 'Support', 'Help'],
            'CircleAlert': ['AlertCircle', 'WarningCircle'],
            'Download': ['Save', 'Export'],
            'Upload': ['Import', 'Add'],
            'Edit': ['Pencil', 'Modify', 'Change'],
            'Eye': ['View', 'Visible', 'Show'],
            'EyeOff': ['Hide', 'Hidden', 'Invisible'],
            'Lock': ['Secure', 'Private', 'Protected'],
            'Unlock': ['Unsecure', 'Public', 'Open'],
        };

        return aliasMap[name] || [];
    }

    /**
     * Get all available icon names
     */
    getIconNames(): string[] {
        this.ensureInitialized();
        return Array.from(this.icons.keys());
    }

    /**
     * Check if icon exists as real lucide export name
     */
    hasIcon(name: string): boolean {
        this.ensureInitialized();
        return this.icons.has(name);
    }

    /**
     * Resolve canonical export name for direct icon names or aliases
     */
    resolveCanonicalName(name: string): string | null {
        this.ensureInitialized();
        if (this.icons.has(name)) {
            return name;
        }

        for (const [iconName, info] of this.icons.entries()) {
            if (info.aliases.some(alias => alias.toLowerCase() === name.toLowerCase())) {
                return iconName;
            }
        }

        return null;
    }

    /**
     * Get icon by name or alias
     */
    getIcon(name: string): IconInfo | undefined {
        this.ensureInitialized();
        // Direct match
        if (this.icons.has(name)) {
            return this.icons.get(name);
        }

        // Alias match (case-insensitive)
        for (const [iconName, info] of this.icons.entries()) {
            if (info.aliases.some(alias => alias.toLowerCase() === name.toLowerCase())) {
                return info;
            }
        }

        return undefined;
    }

    /**
     * Get icons by category
     */
    getIconsByCategory(category: string): string[] {
        this.ensureInitialized();
        return this.categories.get(category) || [];
    }

    /**
     * Get all categories
     */
    getCategories(): string[] {
        this.ensureInitialized();
        return Array.from(this.categories.keys());
    }

    /**
     * Format icons for system prompt
     */
    formatForPrompt(): string {
        let output = '📋 LUCIDE-REACT AVAILABLE ICONS:\n\n';

        const categories = this.getCategories().sort();

        for (const category of categories) {
            const icons = this.getIconsByCategory(category);
            // Limit to first 20 icons per category for readability
            const displayIcons = icons.slice(0, 20);
            const remaining = icons.length - displayIcons.length;

            output += `- ${category}: ${displayIcons.join(', ')}`;
            if (remaining > 0) {
                output += ` (+${remaining} more)`;
            }
            output += '\n';
        }

        output += `\n✅ Total: ${this.icons.size} icons available\n`;
        output += `⚠️ CRITICAL: Only use icons from the categories above! Do NOT invent icon names!\n`;
        output += `💡 Common mistakes: "Cup" → use "CupSoda" | "Trash" → use "Trash2" | "Person" → use "User"\n`;

        return output;
    }

    /**
     * Get statistics
     */
    getStats(): {
        totalIcons: number;
        categories: number;
        topCategories: Array<{ category: string, count: number }>;
    } {
        this.ensureInitialized();
        const topCategories = Array.from(this.categories.entries())
            .map(([category, icons]) => ({ category, count: icons.length }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 5);

        return {
            totalIcons: this.icons.size,
            categories: this.categories.size,
            topCategories
        };
    }

    /**
     * Find similar icons using fuzzy matching (Levenshtein distance)
     */
    findSimilarIcons(searchTerm: string, maxResults: number = 3): Array<{ icon: string, score: number }> {
        this.ensureInitialized();
        const allIcons = this.getIconNames();
        const suggestions: Array<{ icon: string, score: number }> = [];

        for (const iconName of allIcons) {
            // Berechne Levenshtein-Distanz
            const dist = distance(searchTerm.toLowerCase(), iconName.toLowerCase());

            // Normalisiere Score (0 = perfekt, höher = schlechter)
            const maxLength = Math.max(searchTerm.length, iconName.length);
            const score = 1 - (dist / maxLength);

            suggestions.push({ icon: iconName, score });
        }

        // Sortiere nach Score (höher = besser) und limitiere Ergebnisse
        return suggestions
            .sort((a, b) => b.score - a.score)
            .slice(0, maxResults);
    }

    /**
     * Auto-correct icon name or get suggestions
     */
    autoCorrect(iconName: string, threshold: number = 0.6): {
        corrected: string | null;
        suggestions: string[];
        confidence: number;
    } {
        this.ensureInitialized();
        // Prüfe erst ob Icon exakt existiert
        if (this.icons.has(iconName)) {
            return {
                corrected: iconName,
                suggestions: [iconName],
                confidence: 1.0
            };
        }

        // Prüfe Aliase
        const aliasMatch = this.getIcon(iconName);
        if (aliasMatch) {
            return {
                corrected: aliasMatch.name,
                suggestions: [aliasMatch.name],
                confidence: 0.95 // Hohe confidence für Alias-Match
            };
        }

        // Fuzzy matching
        const similar = this.findSimilarIcons(iconName, 3);

        if (similar.length === 0) {
            return { corrected: null, suggestions: [], confidence: 0 };
        }

        const best = similar[0];

        return {
            corrected: best.score >= threshold ? best.icon : null,
            suggestions: similar.map(s => s.icon),
            confidence: best.score
        };
    }
}

// Singleton instance
export const iconRegistry = new IconRegistry();
