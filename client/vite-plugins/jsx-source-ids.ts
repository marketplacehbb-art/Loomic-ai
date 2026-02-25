/**
 * Vite Plugin: JSX Source IDs
 *
 * Injects stable `data-source-id="file:line:col"` attributes on every JSX element
 * at compile time. This enables DOM<->Code traceability.
 *
 * In production mode, the attributes are stripped.
 */

import type { Plugin } from 'vite';
import { injectJsxSourceIds, resolveSourceId } from '../src/utils/jsx-source-id-utils';

export { resolveSourceId };

/**
 * Create the JSX Source IDs Vite plugin.
 */
export default function jsxSourceIds(): Plugin {
  let isProd = false;

  return {
    name: 'jsx-source-ids',
    enforce: 'pre',

    configResolved(config) {
      isProd = config.mode === 'production' || config.command === 'build';
    },

    transform(code, id) {
      // Only process .tsx and .jsx files
      if (!/\.[tj]sx$/.test(id)) return null;

      // Skip node_modules
      if (id.includes('node_modules')) return null;

      // Strip in production
      if (isProd) {
        // Remove any existing data-source-id attributes
        const stripped = code.replace(/\s+data-source-id="[^"]*"/g, '');
        if (stripped !== code) {
          return { code: stripped, map: null };
        }
        return null;
      }

      // Generate a short stable file identifier (relative path)
      const fileId = id
        .replace(/\\/g, '/')
        .replace(/^.*\/src\//, 'src/')
        .replace(/^.*\/client\//, '');

      try {
        const transformed = injectJsxSourceIds(code, fileId);
        if (transformed !== code) {
          return { code: transformed, map: null };
        }
      } catch (error) {
        // Never break the build due to source ID injection
        console.warn(`[jsx-source-ids] Failed to process ${id}:`, error);
      }

      return null;
    },
  };
}
