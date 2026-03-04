export const RUNTIME_DEP_VERSION_HINTS: Record<string, string> = {
  react: '^18.3.1',
  'react-dom': '^18.3.1',
  'react-router-dom': '^6.30.3',
  'lucide-react': '^0.564.0',
  'framer-motion': '^11.0.8',
  '@heroicons/react': '^2.0.18',
  recharts: '^3.7.0',
  'react-confetti': '^6.1.0',
  'react-icons': '^5.3.0',
  'chart.js': '^4.4.7',
  'react-chartjs-2': '^5.2.0',
  '@dnd-kit/core': '^6.3.1',
  '@dnd-kit/sortable': '^10.0.0',
  '@dnd-kit/utilities': '^3.2.2',
  'react-beautiful-dnd': '^13.1.1',
  '@react-pdf/renderer': '^4.1.6',
  sonner: '^2.0.6',
  'react-hot-toast': '^2.5.1',
  'react-toastify': '^10.0.6',
};

export const VALIDATOR_BROWSER_LIBRARIES: string[] = [
  'lucide-react',
  '@heroicons/react',
  'framer-motion',
  'react-router-dom',
  'clsx',
  'date-fns',
  'zustand',
  'axios',
  'recharts',
  'react-confetti',
  'react-icons',
  '@radix-ui',
  'class-variance-authority',
  '@dnd-kit/core',
  '@dnd-kit/sortable',
  '@dnd-kit/utilities',
  'react-beautiful-dnd',
  '@react-pdf/renderer',
  'sonner',
  'react-hot-toast',
  'react-toastify',
];

export const QUALITY_LIBRARY_ALLOWLIST: string[] = [
  'react', 'react-dom', 'react-router-dom', 'react-router',
  'next', 'vite',
  'tailwindcss', 'postcss', 'autoprefixer',
  'lucide-react', 'react-icons', '@heroicons/react',
  'framer-motion', 'motion',
  'clsx', 'class-variance-authority', 'tailwind-merge',
  'zustand', 'jotai', 'recoil',
  'axios', 'swr', '@tanstack/react-query',
  'zod', 'yup', 'joi',
  'date-fns', 'dayjs', 'moment',
  'recharts', 'chart.js', 'react-chartjs-2',
  'embla-carousel-react',
  '@radix-ui', '@headlessui/react',
  'shadcn', '@shadcn/ui',
  'sonner', 'react-hot-toast', 'react-toastify',
  'react-hook-form', '@hookform/resolvers',
  'lodash', 'lodash-es', 'underscore',
  'uuid', 'nanoid', 'cuid',
  'typescript', '@types/',
  '@dnd-kit/core', '@dnd-kit/sortable', '@dnd-kit/utilities',
  'react-beautiful-dnd',
  '@react-pdf/renderer',
];

const QUALITY_LIBRARY_ALLOWLIST_SET = new Set(QUALITY_LIBRARY_ALLOWLIST);

export function isAllowlistedDependency(lib: string): boolean {
  if (!lib) return false;
  if (QUALITY_LIBRARY_ALLOWLIST_SET.has(lib)) return true;
  for (const allowed of QUALITY_LIBRARY_ALLOWLIST_SET) {
    if (lib.startsWith(allowed)) return true;
  }
  return false;
}
