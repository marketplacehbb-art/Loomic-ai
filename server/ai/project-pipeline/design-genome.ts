export interface DesignGenome {
  id: string;
  createdAt: string;
  palette: string[];
  radiusScale: string[];
  shadowScale: string[];
  typographyHints: string[];
  motionHints: string[];
  layoutHints: string[];
}

export interface DesignDiversityAdvice {
  similarityToRecent: number;
  avoidTraits: string[];
  directive: string;
}

function collectMatches(input: string, regex: RegExp): string[] {
  const matches = new Set<string>();
  for (const match of input.matchAll(regex)) {
    if (match[0]) matches.add(match[0]);
  }
  return [...matches];
}

function createGenomeId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function jaccardSimilarity(left: string[], right: string[]): number {
  const a = new Set(left);
  const b = new Set(right);
  if (a.size === 0 && b.size === 0) return 1;
  const intersection = [...a].filter((item) => b.has(item)).length;
  const union = new Set([...a, ...b]).size;
  return union === 0 ? 0 : intersection / union;
}

function flattenGenomeTraits(genome: DesignGenome): string[] {
  return [
    ...genome.palette,
    ...genome.radiusScale,
    ...genome.shadowScale,
    ...genome.typographyHints,
    ...genome.motionHints,
    ...genome.layoutHints,
  ];
}

class DesignGenomeStore {
  private readonly maxEntries = 80;
  private readonly byProject = new Map<string, DesignGenome[]>();
  private readonly globalHistory: DesignGenome[] = [];

  write(projectId: string | undefined, genome: DesignGenome): void {
    this.globalHistory.push(genome);
    if (this.globalHistory.length > this.maxEntries) {
      this.globalHistory.splice(0, this.globalHistory.length - this.maxEntries);
    }
    if (!projectId || projectId.trim().length === 0) return;
    const key = projectId.trim();
    const existing = this.byProject.get(key) || [];
    const next = [...existing, genome].slice(-20);
    this.byProject.set(key, next);
  }

  getRecent(projectId: string | undefined, limit = 8): DesignGenome[] {
    if (projectId && projectId.trim().length > 0) {
      const key = projectId.trim();
      const local = this.byProject.get(key) || [];
      if (local.length > 0) return local.slice(-Math.max(1, limit));
    }
    return this.globalHistory.slice(-Math.max(1, limit));
  }
}

const store = new DesignGenomeStore();

export function extractDesignGenomeFromFiles(files: Record<string, string>): DesignGenome {
  const joined = Object.values(files || {})
    .filter((value): value is string => typeof value === 'string')
    .join('\n');

  const palette = collectMatches(joined, /\b(?:bg|text|border)-[a-z]+-\d{2,3}\b/g).slice(0, 16);
  const radiusScale = collectMatches(joined, /\brounded(?:-(?:sm|md|lg|xl|2xl|3xl|full))?\b/g).slice(0, 8);
  const shadowScale = collectMatches(joined, /\bshadow(?:-(?:sm|md|lg|xl|2xl|inner))?\b/g).slice(0, 8);
  const typographyHints = collectMatches(joined, /\btext-(?:xs|sm|base|lg|xl|2xl|3xl|4xl|5xl)\b/g).slice(0, 10);
  const motionHints = collectMatches(joined, /\b(?:transition(?:-[a-z]+)?|duration-\d+|animate-[a-z0-9-]+|hover:[a-z0-9:-]+)\b/g).slice(0, 16);
  const layoutHints = collectMatches(joined, /\b(?:grid(?:-cols-\d+)?|flex|items-[a-z]+|justify-[a-z]+|gap-\d+|max-w-[a-z0-9-]+)\b/g).slice(0, 16);

  return {
    id: createGenomeId(),
    createdAt: new Date().toISOString(),
    palette,
    radiusScale,
    shadowScale,
    typographyHints,
    motionHints,
    layoutHints,
  };
}

export function storeDesignGenome(projectId: string | undefined, genome: DesignGenome): void {
  store.write(projectId, genome);
}

export function getDesignDiversityAdvice(
  projectId: string | undefined,
  candidateGenome: DesignGenome
): DesignDiversityAdvice {
  const recent = store.getRecent(projectId, 8);
  if (recent.length === 0) {
    return {
      similarityToRecent: 0,
      avoidTraits: [],
      directive: 'No recent genome history detected. Select a strong, distinctive visual identity.',
    };
  }

  const candidateTraits = flattenGenomeTraits(candidateGenome);
  const similarities = recent.map((genome) => jaccardSimilarity(candidateTraits, flattenGenomeTraits(genome)));
  const similarityToRecent = similarities.reduce((acc, value) => acc + value, 0) / similarities.length;

  const recentTraitFrequency = new Map<string, number>();
  recent.forEach((genome) => {
    flattenGenomeTraits(genome).forEach((trait) => {
      recentTraitFrequency.set(trait, (recentTraitFrequency.get(trait) || 0) + 1);
    });
  });

  const avoidTraits = [...recentTraitFrequency.entries()]
    .filter(([, count]) => count >= Math.max(2, Math.ceil(recent.length * 0.6)))
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([trait]) => trait);

  const directive = similarityToRecent > 0.55
    ? `Recent projects are visually similar (${(similarityToRecent * 100).toFixed(0)}%). Intentionally change palette, typography rhythm, card treatment, and motion style. Avoid traits: ${avoidTraits.join(', ')}.`
    : `Current style diversity is acceptable (${(similarityToRecent * 100).toFixed(0)}% similarity). Keep contrast and hierarchy strong while maintaining uniqueness.`;

  return {
    similarityToRecent,
    avoidTraits,
    directive,
  };
}
