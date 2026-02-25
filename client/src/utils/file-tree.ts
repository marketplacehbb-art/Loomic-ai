export interface FileNode {
    name: string;
    path: string;
    type: 'file' | 'folder';
    children?: FileNode[];
    isOpen?: boolean;
}

const ROOT_FOLDER_PRIORITY: Record<string, number> = {
    src: 1,
    public: 2,
    tests: 3,
    server: 4,
    backend: 5,
    scripts: 6,
    docs: 7,
};

const ROOT_FILE_PRIORITY: Record<string, number> = {
    'package.json': 1,
    'vite.config.ts': 2,
    'tsconfig.json': 3,
    'tsconfig.node.json': 4,
    'index.html': 5,
    'README.md': 6,
};

function normalizePath(path: string): string {
    return path.replace(/\\/g, '/').replace(/^\.?\//, '');
}

function compareNodes(a: FileNode, b: FileNode, rootLevel: boolean): number {
    if (a.type !== b.type) {
        return a.type === 'folder' ? -1 : 1;
    }

    if (rootLevel && a.type === 'folder' && b.type === 'folder') {
        const aPriority = ROOT_FOLDER_PRIORITY[a.name] ?? 999;
        const bPriority = ROOT_FOLDER_PRIORITY[b.name] ?? 999;
        if (aPriority !== bPriority) {
            return aPriority - bPriority;
        }
    }

    if (rootLevel && a.type === 'file' && b.type === 'file') {
        const aPriority = ROOT_FILE_PRIORITY[a.name] ?? 999;
        const bPriority = ROOT_FILE_PRIORITY[b.name] ?? 999;
        if (aPriority !== bPriority) {
            return aPriority - bPriority;
        }
    }

    return a.name.localeCompare(b.name);
}

function sortNodes(nodes: FileNode[], rootLevel: boolean = false) {
    nodes.sort((a, b) => compareNodes(a, b, rootLevel));
    nodes.forEach((node) => {
        if (node.children) {
            sortNodes(node.children, false);
        }
    });
}

export function buildFileTree(files: string[]): FileNode[] {
    const root: FileNode[] = [];

    files
        .map(normalizePath)
        .filter(Boolean)
        .sort()
        .forEach((path) => {
            const parts = path.split('/');
            let currentLevel = root;

            parts.forEach((part, index) => {
                const isFile = index === parts.length - 1;
                const existingNode = currentLevel.find((node) => node.name === part);

                if (existingNode) {
                    if (existingNode.type === 'folder' && existingNode.children) {
                        currentLevel = existingNode.children;
                    }
                    return;
                }

                const newNode: FileNode = {
                    name: part,
                    path: isFile ? path : parts.slice(0, index + 1).join('/'),
                    type: isFile ? 'file' : 'folder',
                    children: isFile ? undefined : [],
                    isOpen: index < 2,
                };

                currentLevel.push(newNode);
                if (newNode.children) {
                    currentLevel = newNode.children;
                }
            });
        });

    sortNodes(root, true);
    return root;
}
