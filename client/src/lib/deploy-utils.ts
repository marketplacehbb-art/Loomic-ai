import sdk from '@stackblitz/sdk';

/**
 * Prepares the file system for deployment by ensuring essential config files exist.
 * Adds package.json, vite.config.ts, vercel.json, and _redirects if missing.
 */
export const prepareForDeployment = (files: Record<string, string>, dependencies: Record<string, string> = {}) => {
    const newFiles = { ...files };

    // 1. Ensure package.json exists
    if (!newFiles['package.json']) {
        const cleanDeps = { ...dependencies };
        // Remove ESM CDN links if present in dependencies (shouldn't be there usually, but just in case)
        Object.keys(cleanDeps).forEach(key => {
            if (cleanDeps[key].includes('http')) {
                // Keep version if possible or default to latest
                cleanDeps[key] = "latest";
            }
        });

        // Add essential dev deps if missing
        if (!cleanDeps['react']) cleanDeps['react'] = "^18.3.1";
        if (!cleanDeps['react-dom']) cleanDeps['react-dom'] = "^18.3.1";
        if (!cleanDeps['lucide-react']) cleanDeps['lucide-react'] = "latest";

        newFiles['package.json'] = JSON.stringify({
            name: "ai-generated-app",
            private: true,
            version: "0.0.0",
            type: "module",
            scripts: {
                "dev": "vite",
                "build": "tsc && vite build",
                "lint": "eslint . --ext ts,tsx --report-unused-disable-directives --max-warnings 0",
                "preview": "vite preview"
            },
            dependencies: cleanDeps,
            devDependencies: {
                "@types/react": "^18.3.3",
                "@types/react-dom": "^18.3.0",
                "@vitejs/plugin-react": "^4.3.1",
                "autoprefixer": "^10.4.19",
                "postcss": "^8.4.38",
                "tailwindcss": "^3.4.4",
                "typescript": "^5.5.3",
                "vite": "^5.4.1"
            }
        }, null, 2);
    }

    // 2. Ensure vite.config.ts exists
    if (!newFiles['vite.config.ts']) {
        newFiles['vite.config.ts'] = `
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
})
`;
    }

    // 3. Ensure index.html exists
    if (!newFiles['index.html']) {
        newFiles['index.html'] = `
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>AI App</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
`;
    }

    // Ensure main.tsx exists if referenced
    if (!newFiles['src/main.tsx'] && !newFiles['main.tsx']) {
        // If we have App.tsx but no entry point
        if (newFiles['App.tsx']) {
            newFiles['src/main.tsx'] = `
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from '../App.tsx'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
`;
        }
    }

    // 4. Vercel Config
    if (!newFiles['vercel.json']) {
        newFiles['vercel.json'] = JSON.stringify({
            "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }]
        }, null, 2);
    }

    // 5. Netlify Config
    if (!newFiles['_redirects']) {
        newFiles['_redirects'] = "/*  /index.html  200";
    }

    return newFiles;
};

/**
 * Opens the current project in StackBlitz
 */
export const openinStackBlitz = (files: Record<string, string>, dependencies: Record<string, string> = {}) => {
    const preparedFiles = prepareForDeployment(files, dependencies);

    sdk.openProject({
        title: 'AI Generated Project',
        description: 'Created with AI Builder',
        template: 'node',
        files: preparedFiles
    }, {
        newWindow: true,
        openFile: 'src/App.tsx'
    });
};
