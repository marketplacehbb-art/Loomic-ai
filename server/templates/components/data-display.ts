import { buildComponentLibrary } from './shared.js';

export const DATA_COMPONENTS = buildComponentLibrary('data-display', [
  {
    name: 'TableSimple',
    description: 'Basic styled data table with responsive spacing and headers.',
    tags: ['table', 'data', 'list'],
    supabaseRequired: true,
  },
  {
    name: 'TableSortable',
    description: 'Sortable table columns with directional arrow indicators.',
    tags: ['table', 'sort', 'data'],
    supabaseRequired: true,
  },
  {
    name: 'TableWithActions',
    description: 'Data table rows with inline edit, delete, and view actions.',
    tags: ['table', 'crud', 'actions'],
    supabaseRequired: true,
  },
  {
    name: 'TablePaginated',
    description: 'Paginated table with compact footer navigation controls.',
    tags: ['table', 'pagination', 'data'],
    supabaseRequired: true,
  },
  {
    name: 'DataGrid',
    description: 'Responsive CSS grid for record cards and metadata blocks.',
    tags: ['grid', 'data', 'cards'],
    supabaseRequired: true,
  },
  {
    name: 'KPICard',
    description: 'KPI card with metric, sparkline, and trend annotation.',
    tags: ['kpi', 'metrics', 'dashboard'],
    supabaseRequired: true,
  },
  {
    name: 'ChartLine',
    description: 'Recharts line chart wrapper with tooltip and axis labels.',
    tags: ['chart', 'line', 'recharts'],
    supabaseRequired: true,
  },
  {
    name: 'ChartBar',
    description: 'Recharts bar chart wrapper for category comparisons.',
    tags: ['chart', 'bar', 'recharts'],
    supabaseRequired: true,
  },
  {
    name: 'ChartDonut',
    description: 'Recharts donut chart wrapper for usage and composition views.',
    tags: ['chart', 'donut', 'pie'],
    supabaseRequired: true,
  },
  {
    name: 'ChartArea',
    description: 'Recharts area chart wrapper with gradient fill.',
    tags: ['chart', 'area', 'recharts'],
    supabaseRequired: true,
  },
  {
    name: 'ProgressBar',
    description: 'Labeled progress bar with smooth width transitions.',
    tags: ['progress', 'bar', 'status'],
  },
  {
    name: 'ProgressCircle',
    description: 'Circular progress indicator for goals and completion states.',
    tags: ['progress', 'circle', 'status'],
  },
  {
    name: 'MetricRow',
    description: 'Single metric row with label, value, and compact bar.',
    tags: ['metrics', 'row', 'dashboard'],
  },
  {
    name: 'ComparisonBar',
    description: 'Dual-value comparison bar for before/after or A/B values.',
    tags: ['comparison', 'metrics', 'bar'],
  },
  {
    name: 'Heatmap',
    description: 'Simple CSS heatmap grid for intensity-based activity visuals.',
    tags: ['heatmap', 'analytics', 'grid'],
    supabaseRequired: true,
  },
  {
    name: 'TimelineList',
    description: 'Vertical timeline list displaying dated events and milestones.',
    tags: ['timeline', 'events', 'history'],
    supabaseRequired: true,
  },
]);
