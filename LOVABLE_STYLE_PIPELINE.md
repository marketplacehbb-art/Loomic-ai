# Lovable-Style Pipeline (Implemented)

## Phase 1: Template Baseline
- Added a fixed Vite/React base template.
- Base files are always present before/after generation.
- Implementation: `server/ai/project-pipeline/template-base.ts`

## Phase 2: File Planning
- Added deterministic file planning based on prompt intent and existing files.
- Planner outputs files to create/update before code generation.
- Implementation: `server/ai/project-pipeline/file-planner.ts`

## Phase 3: Project Assembly
- Added assembler to merge:
  - template files,
  - existing project files,
  - generated output.
- Ensures `src/App.tsx` and `src/main.tsx` are valid.
- Merges detected dependencies into `package.json`.
- Implementation: `server/ai/project-pipeline/project-assembler.ts`

## Phase 4: Structured Code View
- Upgraded editor tree sorting/UX to look more like structured app builders.
- Root folders/files now have priority ordering (e.g. `src`, `public`, `package.json`).
- Explorer now shows file stats and better visual hierarchy.
- Implementation:
  - `client/src/utils/file-tree.ts`
  - `client/src/components/MonacoEditor.tsx`
  - `client/src/components/CodePreview.tsx`

## Phase 5: Multi-Template + Block Composition
- Added metadata-driven template blocks and presets.
- Added composable presets (landing, dashboard, auth, blank).
- Added automatic block selection based on prompt intent.
- Added templates API endpoint for frontend selector.
- Implementation:
  - `server/ai/template-library/types.ts`
  - `server/ai/template-library/blocks.ts`
  - `server/ai/template-library/registry.ts`
  - `server/ai/template-library/composer.ts`
  - `server/api/generate.ts`
  - `client/src/pages/Generator.tsx`

## Integration Point
- Pipeline wired into generation endpoint:
  - `server/api/generate.ts`
- Response now includes `pipeline` metadata for visibility.
