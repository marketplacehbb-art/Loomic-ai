import fs from 'fs';
import path from 'path';

const rootDir = process.cwd();
const sourcePath = path.resolve(rootDir, 'ui-component-library-schema.json');
const targetDir = path.resolve(rootDir, 'data', 'ui-library');
const componentsDir = path.join(targetDir, 'components');
const styleKitsDir = path.join(targetDir, 'style-kits');
const animationsDir = path.join(targetDir, 'animations');

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function slugify(value) {
  return String(value || 'unknown')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'unknown';
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

if (!fs.existsSync(sourcePath)) {
  console.error(`Missing source schema: ${sourcePath}`);
  process.exit(1);
}

const raw = fs.readFileSync(sourcePath, 'utf8');
const parsed = JSON.parse(raw);

const components = Array.isArray(parsed.components) ? parsed.components : [];
const styleKits = Array.isArray(parsed.styleKits) ? parsed.styleKits : [];
const animationPresets = Array.isArray(parsed.animationPresets) ? parsed.animationPresets : [];

ensureDir(targetDir);
ensureDir(componentsDir);
ensureDir(styleKitsDir);
ensureDir(animationsDir);

const groupedComponents = new Map();
for (const component of components) {
  const category = slugify(component?.category || 'misc');
  if (!groupedComponents.has(category)) {
    groupedComponents.set(category, []);
  }
  groupedComponents.get(category).push(component);
}

for (const [category, entries] of groupedComponents.entries()) {
  writeJson(path.join(componentsDir, `${category}.json`), {
    category,
    components: entries,
  });
}

writeJson(path.join(styleKitsDir, 'all.json'), {
  styleKits,
});

writeJson(path.join(animationsDir, 'all.json'), {
  animationPresets,
});

writeJson(path.join(targetDir, 'meta.json'), {
  $schema: parsed.$schema,
  $id: parsed.$id,
  title: parsed.title,
  description: parsed.description,
  version: parsed.version,
  library: parsed.library || {},
  generatedFrom: path.basename(sourcePath),
  splitAt: new Date().toISOString(),
  counts: {
    components: components.length,
    componentCategories: groupedComponents.size,
    styleKits: styleKits.length,
    animationPresets: animationPresets.length,
  },
});

console.log(
  JSON.stringify(
    {
      sourcePath,
      targetDir,
      components: components.length,
      componentCategories: groupedComponents.size,
      styleKits: styleKits.length,
      animationPresets: animationPresets.length,
    },
    null,
    2
  )
);
