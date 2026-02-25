
import { memo } from 'react';
import { Handle, Position, type Node, type NodeProps } from '@xyflow/react';

export type ColumnType = 'uuid' | 'text' | 'integer' | 'boolean' | 'timestamp' | 'jsonb';

export interface Column {
    id: string;
    name: string;
    type: ColumnType;
    isPrimaryKey?: boolean;
    isForeignKey?: boolean;
}

export interface TableNodeData extends Record<string, unknown> {
    label: string;
    columns: Column[];
    onUpdate?: (id: string, data: Partial<TableNodeData>) => void;
}

export type TableNodeType = Node<TableNodeData, 'table'>;

const TableNode = ({ id, data, selected }: NodeProps<TableNodeType>) => {

    const handleChange = (field: string, value: any) => {
        if (data.onUpdate) {
            data.onUpdate(id, { [field]: value });
        }
    };

    const updateColumn = (colId: string, field: keyof Column, value: any) => {
        const newColumns = data.columns.map(col =>
            col.id === colId ? { ...col, [field]: value } : col
        );
        handleChange('columns', newColumns);
    };

    const addColumn = () => {
        const newCol: Column = {
            id: crypto.randomUUID(),
            name: `column_${data.columns.length + 1}`,
            type: 'text'
        };
        handleChange('columns', [...data.columns, newCol]);
    };

    const removeColumn = (colId: string) => {
        handleChange('columns', data.columns.filter(c => c.id !== colId));
    };

    return (
        <div className={`bg-white dark:bg-slate-900 rounded-lg shadow-xl border-2 transition-all min-w-[250px] overflow-hidden ${selected ? 'border-primary ring-2 ring-primary/20' : 'border-slate-200 dark:border-slate-700'}`}>
            {/* Header / Table Name */}
            <div className="bg-slate-100 dark:bg-slate-800 p-3 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between handle-drag">
                <input
                    className="bg-transparent font-bold text-slate-800 dark:text-white text-sm outline-none placeholder-slate-400 w-full"
                    value={data.label}
                    onChange={(e) => handleChange('label', e.target.value)}
                    placeholder="Table Name"
                />
                <span className="material-symbols-rounded text-slate-400 text-sm">table_chart</span>
            </div>

            {/* Columns List */}
            <div className="p-2 space-y-1">
                {data.columns.map((col) => (
                    <div key={col.id} className="flex items-center gap-2 group relative">
                        {/* PK Indicator */}
                        <div
                            className={`w-1.5 h-1.5 rounded-full ${col.isPrimaryKey ? 'bg-yellow-500' : 'bg-slate-300 dark:bg-slate-600'} cursor-pointer`}
                            onClick={() => updateColumn(col.id, 'isPrimaryKey', !col.isPrimaryKey)}
                            title="Toggle Primary Key"
                        />

                        {/* Column Name */}
                        <input
                            className="bg-transparent text-xs text-slate-700 dark:text-slate-300 outline-none flex-1 font-mono border-b border-transparent focus:border-primary/50"
                            value={col.name}
                            onChange={(e) => updateColumn(col.id, 'name', e.target.value)}
                        />

                        {/* Column Type */}
                        <select
                            className="bg-transparent text-[10px] text-slate-500 dark:text-slate-400 outline-none border border-transparent hover:border-slate-200 dark:hover:border-slate-700 rounded px-1 cursor-pointer appearance-none text-right"
                            value={col.type}
                            onChange={(e) => updateColumn(col.id, 'type', e.target.value as ColumnType)}
                        >
                            <option value="uuid">uuid</option>
                            <option value="text">text</option>
                            <option value="integer">int</option>
                            <option value="boolean">bool</option>
                            <option value="timestamp">time</option>
                            <option value="jsonb">json</option>
                        </select>

                        {/* Delete Button (Hover) */}
                        <button
                            onClick={() => removeColumn(col.id)}
                            className="opacity-0 group-hover:opacity-100 p-1 text-slate-400 hover:text-red-500 transition-opacity absolute -right-6 group-hover:right-0 bg-white dark:bg-slate-900 shadow-sm rounded"
                        >
                            <span className="material-symbols-rounded text-[14px]">close</span>
                        </button>

                        {/* Handles for connections */}
                        <Handle type="target" position={Position.Left} id={col.id} className="!bg-slate-300 dark:!bg-slate-600 !w-2 !h-2 !-left-3" />
                        <Handle type="source" position={Position.Right} id={col.id} className="!bg-slate-300 dark:!bg-slate-600 !w-2 !h-2 !-right-3" />
                    </div>
                ))}
            </div>

            {/* Footer / Actions */}
            <div className="p-2 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
                <button
                    onClick={addColumn}
                    className="w-full flex items-center justify-center gap-1 text-[10px] uppercase font-bold text-primary hover:text-primary-dark py-1 rounded hover:bg-primary/10 transition-colors"
                >
                    <span className="material-symbols-rounded text-sm">add</span>
                    Add Column
                </button>
            </div>

            {/* Table Level Handle (if needed for table-to-table connections not specific to columns) */}
            {/* We can keep generic handles hidden or subtle if we prefer column mapping */}
        </div>
    );
};

export default memo(TableNode);
