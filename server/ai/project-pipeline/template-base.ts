export type TemplateFiles = Record<string, string>;

const isProd = process.env.NODE_ENV === 'production';
const defaultRobots = isProd
  ? `User-agent: *
Allow: /
`
  : `User-agent: *
Disallow: /
`;

const BASE_TEMPLATE: TemplateFiles = {
  '.gitignore': `node_modules
dist
.env
`,
  'README.md': `# AI Generated App

Generated with AI Builder project pipeline.
`,
  'index.html': `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="description" content="Generated with AI Builder." />
    <meta property="og:title" content="AI Builder App" />
    <meta property="og:description" content="Generated with AI Builder." />
    <meta property="og:image" content="/assets/placeholder.svg" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:image" content="/assets/placeholder.svg" />
    <title>AI Builder App</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
`,
  'package.json': JSON.stringify(
    {
      name: 'ai-generated-app',
      private: true,
      version: '0.0.0',
      type: 'module',
      scripts: {
        dev: 'vite',
        build: 'tsc && vite build',
        preview: 'vite preview',
      },
      dependencies: {
        react: '^18.3.1',
        'react-dom': '^18.3.1',
      },
      devDependencies: {
        '@types/react': '^18.3.1',
        '@types/react-dom': '^18.3.1',
        '@vitejs/plugin-react': '^4.3.4',
        typescript: '^5.6.3',
        vite: '^5.4.11',
      },
    },
    null,
    2
  ),
  'vite.config.ts': `import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
});
`,
  'tsconfig.json': JSON.stringify(
    {
      compilerOptions: {
        target: 'ES2020',
        useDefineForClassFields: true,
        lib: ['ES2020', 'DOM', 'DOM.Iterable'],
        module: 'ESNext',
        skipLibCheck: true,
        moduleResolution: 'bundler',
        allowImportingTsExtensions: true,
        resolveJsonModule: true,
        isolatedModules: true,
        noEmit: true,
        jsx: 'react-jsx',
      },
      include: ['src'],
      references: [{ path: './tsconfig.node.json' }],
    },
    null,
    2
  ),
  'tsconfig.node.json': JSON.stringify(
    {
      compilerOptions: {
        composite: true,
        skipLibCheck: true,
        module: 'ESNext',
        moduleResolution: 'bundler',
        allowSyntheticDefaultImports: true,
      },
      include: ['vite.config.ts'],
    },
    null,
    2
  ),
  'src/main.tsx': `import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.tsx';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
`,
  'src/App.tsx': `export default function App() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <h1 className="text-2xl font-bold">AI Builder</h1>
    </div>
  );
}
`,
  'src/index.css': `@tailwind base;
@tailwind components;
@tailwind utilities;

html, body, #root {
  width: 100%;
  min-height: 100%;
}
`,
  'src/vite-env.d.ts': `/// <reference types="vite/client" />
`,
  'public/robots.txt': defaultRobots,
  'public/sitemap.xml': `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://example.com/</loc>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>
</urlset>
`,
  'public/placeholder.svg': `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">
  <rect width="200" height="200" fill="#e2e8f0" />
  <text x="100" y="100" text-anchor="middle" dominant-baseline="middle" fill="#334155" font-size="16">AI Builder</text>
</svg>
`,
  'public/assets/placeholder.svg': `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">
  <rect width="200" height="200" fill="#e2e8f0" />
  <text x="100" y="100" text-anchor="middle" dominant-baseline="middle" fill="#334155" font-size="16">AI Builder</text>
</svg>
`,
};

export function getBaseTemplateFiles(): TemplateFiles {
  return { ...BASE_TEMPLATE };
}

export const ROOT_FILE_PRIORITY: string[] = [
  'package.json',
  'vite.config.ts',
  'tsconfig.json',
  'tsconfig.node.json',
  'index.html',
  'README.md',
];
