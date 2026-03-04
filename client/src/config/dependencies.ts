export const CDN_BASE_URL = 'https://esm.sh/';

export const DEFAULT_DEPENDENCY_VERSIONS: Record<string, string> = {
    "react": "18.3.1",
    "react-dom": "18.3.1",
    "lucide-react": "0.564.0",
    "framer-motion": "11.0.8",
    "react-router-dom": "6.30.3",
    "@heroicons/react": "2.0.18",
    "recharts": "3.7.0",
    "react-confetti": "6.1.0",
    "@dnd-kit/core": "6.3.1",
    "@dnd-kit/sortable": "10.0.0",
    "@dnd-kit/utilities": "3.2.2",
    "react-beautiful-dnd": "13.1.1",
    "@react-pdf/renderer": "4.1.6",
    "sonner": "2.0.6",
    "react-hot-toast": "2.5.1",
    "react-toastify": "10.0.6"
};

export function getEsmUrlForDependency(pkg: string, version?: string): string {
    const name = String(pkg || '').trim();
    const rawVersion = typeof version === 'string' ? version.trim() : '';
    let cleanVersion = rawVersion.replace(/^[\^~]/, '');

    if (!cleanVersion && DEFAULT_DEPENDENCY_VERSIONS[name]) {
        cleanVersion = DEFAULT_DEPENDENCY_VERSIONS[name];
    }

    const versionSuffix = cleanVersion.length > 0 ? `@${cleanVersion}` : '';
    const baseUrl = `${CDN_BASE_URL}${name}${versionSuffix}`;

    if (!name) return baseUrl;

    if (name === 'react-router-dom') return `${baseUrl}?external=react,react-dom`;
    if (name === 'recharts') return `${baseUrl}?external=react,react-dom`;
    if (name === 'react-confetti') return `${baseUrl}?external=react`;
    if (name === 'framer-motion') return `${baseUrl}?external=react`;
    if (name === 'lucide-react') return `${baseUrl}?external=react`;
    if (name === '@heroicons/react') return `${baseUrl}?external=react`;
    if (name === 'react-icons') return `${baseUrl}?external=react`;
    if (name === 'react-beautiful-dnd') return `${baseUrl}?external=react,react-dom`;
    if (name === '@react-pdf/renderer') return `${baseUrl}?external=react,react-dom`;
    if (name === 'sonner') return `${baseUrl}?external=react,react-dom`;
    if (name === 'react-hot-toast') return `${baseUrl}?external=react,react-dom`;
    if (name === 'react-toastify') return `${baseUrl}?external=react,react-dom`;
    if (name.startsWith('@dnd-kit/')) return `${baseUrl}?external=react,react-dom`;
    if (name.startsWith('@radix-ui/')) return `${baseUrl}?external=react,react-dom`;

    return baseUrl;
}

export function getDefaultImportMap(): Record<string, string> {
    const reactUrl = getEsmUrlForDependency("react", DEFAULT_DEPENDENCY_VERSIONS["react"]);
    const reactDomUrl = getEsmUrlForDependency("react-dom", DEFAULT_DEPENDENCY_VERSIONS["react-dom"]);

    const map: Record<string, string> = {
        "react": reactUrl,
        "react/jsx-runtime": `${reactUrl}/jsx-runtime`,
        "react/jsx-dev-runtime": `${reactUrl}/jsx-runtime`,
        "react-dom": reactDomUrl,
        "react-dom/client": `${reactDomUrl}/client`,
    };

    for (const [pkg, version] of Object.entries(DEFAULT_DEPENDENCY_VERSIONS)) {
        if (pkg === "react" || pkg === "react-dom") continue;
        map[pkg] = getEsmUrlForDependency(pkg, version);
    }

    return map;
}
