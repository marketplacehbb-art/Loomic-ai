import * as esbuild from 'esbuild-wasm';
import { injectJsxSourceIds } from '../utils/jsx-source-id-utils';

let initializationPromise: Promise<void> | null = null;

interface BundleOptions {
    files?: Record<string, string>;
    entryPath?: string;
}

const normalizePath = (input: string): string => {
    const raw = input.replace(/\\/g, '/');
    const parts = raw.split('/');
    const stack: string[] = [];

    for (const part of parts) {
        if (!part || part === '.') continue;
        if (part === '..') {
            if (stack.length > 0) stack.pop();
            continue;
        }
        stack.push(part);
    }

    return stack.join('/');
};

const dirname = (path: string): string => {
    const normalized = normalizePath(path);
    const idx = normalized.lastIndexOf('/');
    if (idx === -1) return '';
    return normalized.slice(0, idx);
};

const joinPath = (base: string, target: string): string => {
    if (target.startsWith('/')) return normalizePath(target.slice(1));
    if (!base) return normalizePath(target);
    return normalizePath(`${base}/${target}`);
};

const hasKnownExtension = (path: string): boolean =>
    /\.(tsx|ts|jsx|js|css|json)$/.test(path);

const inferLoader = (path: string): esbuild.Loader => {
    if (path.endsWith('.tsx')) return 'tsx';
    if (path.endsWith('.ts')) return 'ts';
    if (path.endsWith('.jsx')) return 'jsx';
    if (path.endsWith('.js')) return 'js';
    if (path.endsWith('.css')) return 'css';
    if (path.endsWith('.json')) return 'json';
    return 'tsx';
};

const resolveFromVirtualFiles = (candidate: string, files: Record<string, string>): string | null => {
    const normalized = normalizePath(candidate);
    if (files[normalized] !== undefined) return normalized;

    if (!hasKnownExtension(normalized)) {
        const extensions = ['.tsx', '.ts', '.jsx', '.js', '.css', '.json'];
        for (const ext of extensions) {
            const withExt = `${normalized}${ext}`;
            if (files[withExt] !== undefined) return withExt;
        }
        for (const ext of extensions) {
            const indexPath = `${normalized}/index${ext}`;
            if (files[indexPath] !== undefined) return indexPath;
        }
    }

    return null;
};

const normalizeFiles = (files: Record<string, string>): Record<string, string> => {
    const normalized: Record<string, string> = {};
    Object.entries(files).forEach(([path, content]) => {
        const cleanPath = normalizePath(path.replace(/^\.?\//, ''));
        if (!cleanPath) return;
        normalized[cleanPath] = content;
    });
    return normalized;
};

const injectSourceIdsIntoVirtualFiles = (files: Record<string, string>): Record<string, string> => {
    const next: Record<string, string> = {};
    Object.entries(files).forEach(([path, content]) => {
        if (/\.[tj]sx$/i.test(path)) {
            next[path] = injectJsxSourceIds(content, path);
            return;
        }
        next[path] = content;
    });
    return next;
};

const cleanMarkdownCode = (rawCode: string): string =>
    rawCode.replace(/```(?:tsx|jsx|typescript|javascript)?\n([\s\S]*?)```/g, '$1').trim();

const resolveAliasSpecifier = (specifier: string): string | null => {
    if (specifier.startsWith('@/')) return normalizePath(`src/${specifier.slice(2)}`);
    if (specifier.startsWith('@components/')) return normalizePath(`src/components/${specifier.slice('@components/'.length)}`);
    if (specifier.startsWith('@lib/')) return normalizePath(`src/lib/${specifier.slice('@lib/'.length)}`);
    if (specifier.startsWith('@hooks/')) return normalizePath(`src/hooks/${specifier.slice('@hooks/'.length)}`);
    if (specifier.startsWith('@config/')) return normalizePath(`src/config/${specifier.slice('@config/'.length)}`);
    return null;
};

export const initializeBundler = async () => {
    if (initializationPromise) return initializationPromise;

    initializationPromise = esbuild.initialize({
        worker: true,
        wasmURL: 'https://unpkg.com/esbuild-wasm@0.27.3/esbuild.wasm',
    });

    return initializationPromise;
};

export const bundleCode = async (rawCode: string, options: BundleOptions = {}): Promise<string> => {
    await initializeBundler();

    // Clean code formatting if the LLM provided markdown
    const code = cleanMarkdownCode(rawCode);

    try {
        let virtualFilesInput = options.files ? normalizeFiles(options.files) : {};
        virtualFilesInput = injectSourceIdsIntoVirtualFiles(virtualFilesInput);
        const hasVirtualFiles = Object.keys(virtualFilesInput).length > 0;

        if (hasVirtualFiles) {
            const defaultEntry = normalizePath((options.entryPath || 'src/App.tsx').replace(/^\.?\//, ''));
            const normalizedEntry = resolveFromVirtualFiles(defaultEntry, virtualFilesInput)
                || resolveFromVirtualFiles('src/App.tsx', virtualFilesInput)
                || resolveFromVirtualFiles('App.tsx', virtualFilesInput)
                || Object.keys(virtualFilesInput)[0];

            if (!normalizedEntry) {
                throw new Error('No entry file found for preview bundling.');
            }

            // Ensure the latest editor code is used as entry content in preview.
            const entryContentWithIds = /\.[tj]sx$/i.test(normalizedEntry)
                ? injectJsxSourceIds(code, normalizedEntry)
                : code;
            virtualFilesInput[normalizedEntry] = entryContentWithIds;

            const virtualFilesPlugin: esbuild.Plugin = {
                name: 'virtual-files',
                setup(build) {
                    build.onResolve({ filter: /.*/ }, (args) => {
                        const specifier = args.path;

                        // Keep external dependencies for importmap loading in iframe
                        if (
                            specifier.startsWith('http://')
                            || specifier.startsWith('https://')
                            || specifier.startsWith('data:')
                            || specifier.startsWith('blob:')
                        ) {
                            return { path: specifier, external: true };
                        }

                        const aliasCandidate = resolveAliasSpecifier(specifier);
                        if (aliasCandidate) {
                            const aliasedResolved = resolveFromVirtualFiles(aliasCandidate, virtualFilesInput);
                            if (!aliasedResolved) {
                                return { errors: [{ text: `Cannot resolve alias "${specifier}"` }] };
                            }
                            return { path: aliasedResolved, namespace: 'virtual' };
                        }

                        const srcResolved = resolveFromVirtualFiles(specifier, virtualFilesInput);
                        if (srcResolved) {
                            return { path: srcResolved, namespace: 'virtual' };
                        }

                        if (!specifier.startsWith('.') && !specifier.startsWith('/')) {
                            return { path: specifier, external: true };
                        }

                        const importerDir = dirname(args.importer || normalizedEntry);
                        const candidate = specifier.startsWith('/')
                            ? normalizePath(specifier.slice(1))
                            : joinPath(importerDir, specifier);
                        const resolved = resolveFromVirtualFiles(candidate, virtualFilesInput);

                        if (!resolved) {
                            return { errors: [{ text: `Cannot resolve "${specifier}" from "${args.importer || normalizedEntry}"` }] };
                        }

                        return { path: resolved, namespace: 'virtual' };
                    });

                    build.onLoad({ filter: /.*/, namespace: 'virtual' }, (args) => {
                        const contents = virtualFilesInput[args.path];
                        if (typeof contents !== 'string') {
                            return { errors: [{ text: `Virtual file not found: ${args.path}` }] };
                        }
                        return {
                            contents,
                            loader: inferLoader(args.path),
                        };
                    });
                },
            };

            const result = await esbuild.build({
                entryPoints: [normalizedEntry],
                bundle: true,
                write: false,
                format: 'esm',
                platform: 'browser',
                target: 'es2020',
                jsx: 'automatic',
                jsxImportSource: 'react',
                plugins: [virtualFilesPlugin],
                outdir: 'out',
                logLevel: 'silent',
            });

            const jsOutput = result.outputFiles?.find((file) => file.path.endsWith('.js')) || result.outputFiles?.[0];
            if (!jsOutput) {
                throw new Error('Bundler did not produce JavaScript output.');
            }

            return jsOutput.text;
        }

        const result = await esbuild.transform(code, {
            loader: 'tsx',
            target: 'es2020',
            jsx: 'automatic',
            jsxImportSource: 'react',
            minify: false,
        });

        return result.code;
    } catch (err: any) {
        console.error('Bundling error:', err);
        throw new Error(err.message || 'Error occurred during bundling');
    }
};
