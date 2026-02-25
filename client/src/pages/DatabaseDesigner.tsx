import { useCallback, useEffect, useMemo } from 'react';
import {
    ReactFlow,
    Background,
    Controls,
    MiniMap,
    useNodesState,
    useEdgesState,
    addEdge,
    type Connection,
    type Edge,
    type Node,
    MarkerType,
    type NodeTypes
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import TableNode, { type TableNodeData } from '../components/db-designer/TableNode';
import { SQLGenerator } from '../utils/sql-generator';

const initialNodes: Node<TableNodeData>[] = [
    {
        id: '1',
        type: 'table',
        position: { x: 100, y: 100 },
        data: {
            label: 'users',
            columns: [
                { id: 'c1', name: 'id', type: 'uuid', isPrimaryKey: true },
                { id: 'c2', name: 'email', type: 'text' },
                { id: 'c3', name: 'created_at', type: 'timestamp' }
            ]
        }
    }
];

export default function DatabaseDesigner() {
    const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
    const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

    // Custom Node Types
    const nodeTypes = useMemo<NodeTypes>(() => ({
        table: TableNode
    }), []);

    // Handle Node Data Updates
    const onNodeUpdate = useCallback((id: string, newData: Partial<TableNodeData>) => {
        setNodes((nds) => nds.map((node) => {
            if (node.id === id) {
                return {
                    ...node,
                    data: { ...node.data, ...newData, onUpdate: onNodeUpdate }
                };
            }
            return node;
        }));
    }, [setNodes]);

    // Inject the handler into initial nodes (and new ones)
    // We used a useEffect initially, or we can do it on creation. 
    // Effect check:
    useEffect(() => {
        setNodes((nds) => nds.map(n => ({
            ...n,
            data: { ...n.data, onUpdate: onNodeUpdate }
        })));
    }, [onNodeUpdate, setNodes]);


    const onConnect = useCallback(
        (params: Connection) => setEdges((eds) => addEdge({
            ...params,
            animated: true,
            style: { stroke: '#94a3b8', strokeWidth: 2 },
            markerEnd: { type: MarkerType.ArrowClosed }
        }, eds)),
        [setEdges],
    );

    const addNewTable = () => {
        const id = crypto.randomUUID();
        const newNode: Node<TableNodeData> = {
            id,
            type: 'table',
            position: { x: Math.random() * 400 + 100, y: Math.random() * 400 + 100 },
            data: {
                label: `new_table`,
                columns: [
                    { id: `${id}_pk`, name: 'id', type: 'uuid', isPrimaryKey: true },
                    { id: `${id}_created`, name: 'created_at', type: 'timestamp' }
                ],
                onUpdate: onNodeUpdate
            }
        };
        setNodes((nds) => [...nds, newNode]);
    };

    const handleGenerateSQL = () => {
        const sql = SQLGenerator.generate(nodes, edges);
        // Download as file
        const blob = new Blob([sql], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'schema.sql';
        a.click();
        URL.revokeObjectURL(url);
    };

    return (
        <div className="h-screen w-full bg-slate-50 dark:bg-background-dark flex flex-col font-display">
            <header className="h-16 border-b border-slate-200 dark:border-white/5 flex items-center justify-between px-6 bg-white dark:bg-card-dark z-10">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg text-blue-600 dark:text-blue-400">
                        <span className="material-icons-round">schema</span>
                    </div>
                    <div>
                        <h1 className="text-lg font-bold text-slate-800 dark:text-white">Database Designer</h1>
                        <p className="text-xs text-slate-500 dark:text-slate-400">Visually model your Supabase Schema</p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={addNewTable}
                        className="px-4 py-2 bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 text-slate-700 dark:text-slate-300 rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
                    >
                        <span className="material-icons-round text-sm">add</span>
                        Add Table
                    </button>
                    <button
                        onClick={handleGenerateSQL}
                        className="px-4 py-2 bg-primary hover:bg-primary-dark text-white rounded-lg text-sm font-medium transition-colors shadow-lg shadow-primary/20 flex items-center gap-2"
                    >
                        <span className="material-icons-round text-sm">download</span>
                        Export SQL
                    </button>
                </div>
            </header>

            <div className="flex-1 relative bg-slate-50 dark:bg-[#0f172a]">
                <ReactFlow
                    nodes={nodes}
                    edges={edges}
                    onNodesChange={onNodesChange}
                    onEdgesChange={onEdgesChange}
                    onConnect={onConnect}
                    nodeTypes={nodeTypes}
                    fitView
                    className="bg-slate-50 dark:bg-[#0f172a]"
                    minZoom={0.2}
                    maxZoom={4}
                >
                    <Background color="#4b5563" gap={24} size={1} />
                    <Controls className="bg-white dark:bg-card-dark border-slate-200 dark:border-white/10 fill-slate-700 dark:fill-white" />
                    <MiniMap
                        className="bg-slate-100 dark:bg-card-dark border-slate-200 dark:border-white/10 rounded-lg overflow-hidden"
                        nodeColor={() => '#3b82f6'}
                        maskColor="rgba(0, 0, 0, 0.1)"
                    />
                </ReactFlow>
            </div>
        </div>
    );
}
