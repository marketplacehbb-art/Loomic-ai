export type DomainCoverageSeverity = 'critical' | 'warning';

export interface DomainCoverageIssue {
  packId: string;
  id: string;
  severity: DomainCoverageSeverity;
  message: string;
}

export interface DomainCoverageReport {
  issues: DomainCoverageIssue[];
  hasCriticalIssues: boolean;
}

export interface DeterministicDomainFallbackResult {
  files: Record<string, string>;
  applied: string[];
}

function isStubModule(content: string): boolean {
  if (!content || typeof content !== 'string') return true;
  const trimmed = content.trim();
  if (!trimmed) return true;
  if (/^\{\s*"files"\s*:/s.test(trimmed)) return true;
  if (/^export\s*\{\s*\}\s*;?\s*$/s.test(trimmed)) return true;
  if (/export\s+default\s+function\s+[A-Za-z0-9_]+\s*\(\)\s*\{\s*return\s*<div\s*\/>\s*;?\s*\}/s.test(trimmed)) return true;
  if (/export\s+default\s+\(\)\s*=>\s*<div\s*\/>\s*;?/s.test(trimmed)) return true;
  return false;
}

function hasMeaningfulFile(files: Record<string, string>, path: string, minLen: number = 140): boolean {
  const content = files[path];
  if (typeof content !== 'string') return false;
  if (content.trim().length < minLen) return false;
  return !isStubModule(content);
}

export function evaluateDomainCoverage(input: {
  packIds: string[];
  files: Record<string, string>;
}): DomainCoverageReport {
  const issues: DomainCoverageIssue[] = [];
  const { packIds, files } = input;
  const corpus = Object.values(files).join('\n');
  const lower = corpus.toLowerCase();

  if (packIds.includes('kanban')) {
    if (!/@dnd-kit|react-beautiful-dnd|dndcontext|dragdropcontext|usedraggable|usedroppable/i.test(corpus)) {
      issues.push({
        packId: 'kanban',
        id: 'missing-dnd',
        severity: 'critical',
        message: 'Kanban requires drag-and-drop primitives, but none were detected.',
      });
    }
    if (!/localstorage/i.test(corpus)) {
      issues.push({
        packId: 'kanban',
        id: 'missing-persistence',
        severity: 'critical',
        message: 'Kanban requires localStorage persistence, but no persistence token was detected.',
      });
    }
    if (!/search|filter|suche/i.test(corpus)) {
      issues.push({
        packId: 'kanban',
        id: 'missing-search',
        severity: 'warning',
        message: 'Kanban prompt expects global search/filter, but related logic was not detected.',
      });
    }
    if (!hasMeaningfulFile(files, 'src/components/kanban/KanbanBoard.tsx')) {
      issues.push({
        packId: 'kanban',
        id: 'stub-kanban-board',
        severity: 'critical',
        message: 'KanbanBoard component is missing or still a stub.',
      });
    }
  }

  if (packIds.includes('pathfinding')) {
    if (!/dijkstra|pathfinding|shortest\s*path/i.test(corpus)) {
      issues.push({
        packId: 'pathfinding',
        id: 'missing-algorithm',
        severity: 'critical',
        message: 'Pathfinding prompt requires Dijkstra/shortest-path logic signals.',
      });
    }
    if (!/20\s*[xX]\s*20|grid_size\s*=\s*20|rows\s*=\s*20|cols\s*=\s*20/i.test(corpus)) {
      issues.push({
        packId: 'pathfinding',
        id: 'missing-grid',
        severity: 'warning',
        message: 'Pathfinding prompt expects a 20x20 grid, but that signal is missing.',
      });
    }
    if (!/legend|visited|knoten|path/i.test(lower)) {
      issues.push({
        packId: 'pathfinding',
        id: 'missing-legend',
        severity: 'warning',
        message: 'Pathfinding prompt expects legend/visited/path labels.',
      });
    }
  }

  if (packIds.includes('inventory-invoice')) {
    if (!/inventory|stock|lagerbestand|produkte/i.test(lower)) {
      issues.push({
        packId: 'inventory-invoice',
        id: 'missing-inventory',
        severity: 'critical',
        message: 'Inventory flow expected but inventory/stock logic was not detected.',
      });
    }
    if (!/invoice|rechnung/i.test(lower)) {
      issues.push({
        packId: 'inventory-invoice',
        id: 'missing-invoice',
        severity: 'critical',
        message: 'Invoice flow expected but invoice/rechnung logic was not detected.',
      });
    }
    if (!/pdf|print/i.test(lower)) {
      issues.push({
        packId: 'inventory-invoice',
        id: 'missing-pdf-preview',
        severity: 'warning',
        message: 'Invoice prompt expects PDF/print preview signal.',
      });
    }
    if (!/toast|warn|warning|unter\s*5|low\s*stock/i.test(lower)) {
      issues.push({
        packId: 'inventory-invoice',
        id: 'missing-low-stock-warning',
        severity: 'warning',
        message: 'Low-stock warning signal is missing.',
      });
    }
  }

  if (packIds.includes('split-bill-tool')) {
    if (!/split|bill|person|per person|share|teilen/i.test(lower)) {
      issues.push({
        packId: 'split-bill-tool',
        id: 'missing-split-logic',
        severity: 'critical',
        message: 'Split-bill flow expected but split/share logic was not detected.',
      });
    }
    if (!/tip|trinkgeld|slider|range/i.test(lower)) {
      issues.push({
        packId: 'split-bill-tool',
        id: 'missing-tip-slider',
        severity: 'warning',
        message: 'Split-bill prompt expects tip percentage slider behaviour.',
      });
    }
    if (!/pizza|cola|item|position|line item|items/i.test(lower)) {
      issues.push({
        packId: 'split-bill-tool',
        id: 'missing-line-items',
        severity: 'warning',
        message: 'Split-bill prompt expects editable bill line items.',
      });
    }
  }

  if (packIds.includes('crypto-dashboard')) {
    if (!/bitcoin|btc|asset|portfolio|24h|change/i.test(lower)) {
      issues.push({
        packId: 'crypto-dashboard',
        id: 'missing-asset-metrics',
        severity: 'critical',
        message: 'Crypto dashboard needs asset rows and 24h change data signals.',
      });
    }
    if (!/chart|line|price history|sparkline|svg/i.test(lower)) {
      issues.push({
        packId: 'crypto-dashboard',
        id: 'missing-chart',
        severity: 'critical',
        message: 'Crypto dashboard requires a visible line-chart/history signal.',
      });
    }
    if (!/sort|sorted|order by|toggle sort/i.test(lower)) {
      issues.push({
        packId: 'crypto-dashboard',
        id: 'missing-sort',
        severity: 'warning',
        message: 'Crypto dashboard prompt expects sortable asset pricing.',
      });
    }
    if (!/dark mode|theme|toggle/i.test(lower)) {
      issues.push({
        packId: 'crypto-dashboard',
        id: 'missing-theme-toggle',
        severity: 'warning',
        message: 'Crypto dashboard prompt expects a working dark-mode switch.',
      });
    }
  }

  if (packIds.includes('restaurant-commerce-premium')) {
    if (!/framer-motion|motion\./i.test(corpus)) {
      issues.push({
        packId: 'restaurant-commerce-premium',
        id: 'missing-motion',
        severity: 'warning',
        message: 'Prompt expects Framer Motion transitions, but motion usage was not detected.',
      });
    }
    if (!/localstorage/i.test(corpus)) {
      issues.push({
        packId: 'restaurant-commerce-premium',
        id: 'missing-cart-persistence',
        severity: 'critical',
        message: 'Cart persistence (localStorage) is missing.',
      });
    }
    if (!/0\.07|7%|tax|mwst/i.test(corpus)) {
      issues.push({
        packId: 'restaurant-commerce-premium',
        id: 'missing-tax-logic',
        severity: 'critical',
        message: 'Cart tax logic (7%) is missing.',
      });
    }
    if (!/delivery|liefergeb/i.test(lower)) {
      issues.push({
        packId: 'restaurant-commerce-premium',
        id: 'missing-delivery-fee',
        severity: 'critical',
        message: 'Delivery fee logic (5 EUR) is missing.',
      });
    }
    if (!/confetti|canvas-confetti|react-confetti/i.test(corpus)) {
      issues.push({
        packId: 'restaurant-commerce-premium',
        id: 'missing-success-confetti',
        severity: 'warning',
        message: 'Checkout success confetti is missing.',
      });
    }
    if (!/modal|dialog/i.test(lower)) {
      issues.push({
        packId: 'restaurant-commerce-premium',
        id: 'missing-configurator-modal',
        severity: 'critical',
        message: 'Pizza configurator modal is missing.',
      });
    }
    if (!/sidebar|cart/i.test(lower)) {
      issues.push({
        packId: 'restaurant-commerce-premium',
        id: 'missing-cart-sidebar',
        severity: 'critical',
        message: 'Cart sidebar flow is missing.',
      });
    }
  }

  return {
    issues,
    hasCriticalIssues: issues.some((issue) => issue.severity === 'critical'),
  };
}

const KANBAN_BOARD_TEMPLATE = `import { useEffect, useMemo, useState } from 'react';
import {
  DndContext,
  type DragEndEvent,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors
} from '@dnd-kit/core';

type Priority = 'Low' | 'Medium' | 'High';

type KanbanCard = {
  id: string;
  title: string;
  priority: Priority;
};

type KanbanColumn = {
  id: string;
  title: string;
  cards: KanbanCard[];
};

const STORAGE_KEY = 'kanban-board-v1';

const DEFAULT_COLUMNS: KanbanColumn[] = [
  {
    id: 'todo',
    title: 'To Do',
    cards: [
      { id: 'c-1', title: 'Projektstruktur finalisieren', priority: 'High' },
      { id: 'c-2', title: 'Landing-CTA texten', priority: 'Medium' }
    ]
  },
  {
    id: 'doing',
    title: 'Doing',
    cards: [
      { id: 'c-3', title: 'Dashboard-Widgets abstimmen', priority: 'Medium' }
    ]
  },
  {
    id: 'done',
    title: 'Done',
    cards: [
      { id: 'c-4', title: 'Brandfarben definiert', priority: 'Low' }
    ]
  }
];

function loadBoardState(): KanbanColumn[] {
  if (typeof window === 'undefined') return DEFAULT_COLUMNS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_COLUMNS;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return DEFAULT_COLUMNS;
    return parsed as KanbanColumn[];
  } catch {
    return DEFAULT_COLUMNS;
  }
}

function saveBoardState(columns: KanbanColumn[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(columns));
  } catch {
    // ignore persistence failures
  }
}

function findColumnByCard(columns: KanbanColumn[], cardId: string): KanbanColumn | null {
  for (const column of columns) {
    if (column.cards.some((card) => card.id === cardId)) return column;
  }
  return null;
}

function resolveDropColumnId(columns: KanbanColumn[], targetId: string): string | null {
  const directColumn = columns.find((column) => column.id === targetId);
  if (directColumn) return directColumn.id;
  const sourceColumn = findColumnByCard(columns, targetId);
  return sourceColumn ? sourceColumn.id : null;
}

function moveCard(columns: KanbanColumn[], activeId: string, targetId: string): KanbanColumn[] {
  const source = findColumnByCard(columns, activeId);
  const destinationId = resolveDropColumnId(columns, targetId);
  if (!source || !destinationId) return columns;

  const card = source.cards.find((item) => item.id === activeId);
  if (!card) return columns;

  if (source.id === destinationId) return columns;

  return columns.map((column) => {
    if (column.id === source.id) {
      return { ...column, cards: column.cards.filter((item) => item.id !== activeId) };
    }
    if (column.id === destinationId) {
      return { ...column, cards: [...column.cards, card] };
    }
    return column;
  });
}

function PriorityBadge({ priority }: { priority: Priority }) {
  const tone =
    priority === 'High'
      ? 'bg-rose-500/15 text-rose-400 border-rose-500/30'
      : priority === 'Medium'
        ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
        : 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30';

  return (
    <span className={\`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium \${tone}\`}>
      {priority}
    </span>
  );
}

function CardItem({ card }: { card: KanbanCard }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: card.id,
  });

  const style = transform
    ? { transform: \`translate3d(\${transform.x}px, \${transform.y}px, 0)\` }
    : undefined;

  return (
    <article
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className={\`rounded-xl border border-slate-700/70 bg-slate-900/70 p-3 shadow-sm transition \${isDragging ? 'opacity-70' : 'opacity-100'}\`}
    >
      <p className="text-sm font-medium text-white">{card.title}</p>
      <div className="mt-2">
        <PriorityBadge priority={card.priority} />
      </div>
    </article>
  );
}

function ColumnDropZone({ id, title, cards }: { id: string; title: string; cards: KanbanCard[] }) {
  const { setNodeRef, isOver } = useDroppable({ id });

  return (
    <section
      ref={setNodeRef}
      className={\`min-h-[180px] rounded-2xl border p-3 transition \${isOver ? 'border-indigo-400 bg-indigo-500/10' : 'border-slate-700 bg-slate-950/60'}\`}
    >
      <header className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-100">{title}</h3>
        <span className="rounded-full bg-slate-800 px-2 py-0.5 text-xs text-slate-300">{cards.length}</span>
      </header>
      <div className="space-y-2">
        {cards.map((card) => (
          <CardItem key={card.id} card={card} />
        ))}
      </div>
    </section>
  );
}

export default function KanbanBoard() {
  const sensors = useSensors(useSensor(PointerSensor));
  const [columns, setColumns] = useState<KanbanColumn[]>(() => loadBoardState());
  const [search, setSearch] = useState('');
  const [newColumnTitle, setNewColumnTitle] = useState('');

  useEffect(() => {
    saveBoardState(columns);
  }, [columns]);

  const filteredColumns = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return columns;
    return columns.map((column) => ({
      ...column,
      cards: column.cards.filter((card) => {
        const haystack = \`\${card.title} \${card.priority}\`.toLowerCase();
        return haystack.includes(query);
      }),
    }));
  }, [columns, search]);

  const handleDragEnd = (event: DragEndEvent) => {
    const activeId = String(event.active.id || '');
    const overId = event.over ? String(event.over.id || '') : '';
    if (!activeId || !overId) return;
    setColumns((prev) => moveCard(prev, activeId, overId));
  };

  const addColumn = () => {
    const title = newColumnTitle.trim();
    if (!title) return;
    const id = \`col-\${Date.now()}\`;
    setColumns((prev) => [...prev, { id, title, cards: [] }]);
    setNewColumnTitle('');
  };

  const addCard = (columnId: string) => {
    const title = window.prompt('Karten-Titel');
    if (!title || !title.trim()) return;
    const priorityInput = (window.prompt('Priorität: Low, Medium, High', 'Medium') || 'Medium').trim();
    const normalized = priorityInput === 'High' || priorityInput === 'Low' ? priorityInput : 'Medium';
    const card: KanbanCard = {
      id: \`card-\${Date.now()}-\${Math.random().toString(36).slice(2, 7)}\`,
      title: title.trim(),
      priority: normalized as Priority,
    };
    setColumns((prev) =>
      prev.map((column) => (column.id === columnId ? { ...column, cards: [...column.cards, card] } : column))
    );
  };

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-950/40 p-4">
      <div className="mb-4 grid gap-3 md:grid-cols-[1fr_auto]">
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Karten suchen (Titel oder Priority)"
          className="h-11 rounded-xl border border-slate-700 bg-slate-900 px-3 text-sm text-slate-100 placeholder:text-slate-400 focus:border-indigo-400 focus:outline-none"
        />
        <div className="flex gap-2">
          <input
            value={newColumnTitle}
            onChange={(event) => setNewColumnTitle(event.target.value)}
            placeholder="Neue Spalte"
            className="h-11 rounded-xl border border-slate-700 bg-slate-900 px-3 text-sm text-slate-100 placeholder:text-slate-400 focus:border-indigo-400 focus:outline-none"
          />
          <button
            type="button"
            onClick={addColumn}
            className="h-11 rounded-xl bg-indigo-500 px-4 text-sm font-semibold text-white transition hover:bg-indigo-400"
          >
            Spalte +
          </button>
        </div>
      </div>

      <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
        <div className="grid gap-3 md:grid-cols-3">
          {filteredColumns.map((column) => (
            <div key={column.id} className="space-y-2">
              <ColumnDropZone id={column.id} title={column.title} cards={column.cards} />
              <button
                type="button"
                onClick={() => addCard(column.id)}
                className="w-full rounded-lg border border-dashed border-slate-700 px-3 py-2 text-xs font-medium text-slate-300 transition hover:border-indigo-400 hover:text-indigo-200"
              >
                Karte hinzufügen
              </button>
            </div>
          ))}
        </div>
      </DndContext>
    </div>
  );
}
`;

const KANBAN_BOARD_PAGE_TEMPLATE = `import KanbanBoard from '../components/kanban/KanbanBoard';

export default function Board() {
  return (
    <main className="min-h-screen bg-slate-950 p-6 text-slate-100">
      <div className="mx-auto max-w-6xl">
        <header className="mb-6">
          <h1 className="text-2xl font-bold">Project Kanban Board</h1>
          <p className="mt-1 text-sm text-slate-400">
            Drag and drop cards between columns. Changes are persisted in localStorage.
          </p>
        </header>
        <KanbanBoard />
      </div>
    </main>
  );
}
`;

const KANBAN_APP_TEMPLATE = `import { HashRouter as Router, Link, Route, Routes } from 'react-router-dom';
import Board from './pages/Board';

function Home() {
  return (
    <main className="min-h-screen bg-slate-950 p-8 text-slate-100">
      <div className="mx-auto max-w-4xl">
        <h1 className="text-3xl font-bold">Kanban Workspace</h1>
        <p className="mt-2 text-slate-300">
          Navigate to the board page to manage your tasks with drag and drop.
        </p>
        <Link
          to="/board"
          className="mt-5 inline-flex rounded-lg bg-indigo-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-400"
        >
          Open Board
        </Link>
      </div>
    </main>
  );
}

export default function App() {
  return (
    <Router>
      <div className="min-h-screen bg-slate-950">
        <nav className="border-b border-slate-800 bg-slate-900/70 px-6 py-3 text-sm text-slate-300">
          <div className="mx-auto flex max-w-6xl items-center gap-4">
            <Link to="/" className="hover:text-white">Home</Link>
            <Link to="/board" className="hover:text-white">Board</Link>
          </div>
        </nav>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/board" element={<Board />} />
        </Routes>
      </div>
    </Router>
  );
}
`;

const RESTAURANT_PREMIUM_APP_TEMPLATE = `import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import Confetti from 'react-confetti';
import { Pizza, ShoppingCart, X, Plus, Minus, CheckCircle2 } from 'lucide-react';

type PizzaItem = {
  id: string;
  name: string;
  ingredients: string[];
  price: number;
  image: string;
};

type ExtraOption = {
  id: string;
  label: string;
  price: number;
};

type CartItem = {
  id: string;
  pizzaId: string;
  name: string;
  basePrice: number;
  extras: ExtraOption[];
  quantity: number;
};

const MENU: PizzaItem[] = [
  {
    id: 'margherita',
    name: 'Margherita Oro',
    ingredients: ['San-Marzano', 'Fior di Latte', 'Basilikum'],
    price: 14.5,
    image: 'https://images.unsplash.com/photo-1513104890138-7c749659a591?auto=format&fit=crop&w=1200&q=80'
  },
  {
    id: 'tartufo',
    name: 'Tartufo Nera',
    ingredients: ['Mozzarella', 'Pilze', 'Trüffelcreme'],
    price: 19.9,
    image: 'https://images.unsplash.com/photo-1548365328-8b849e6c0f45?auto=format&fit=crop&w=1200&q=80'
  },
  {
    id: 'diavola',
    name: 'Diavola Rosso',
    ingredients: ['Ventricina', 'Chili', 'Pecorino'],
    price: 17.2,
    image: 'https://images.unsplash.com/photo-1593560708920-61dd98c46a4e?auto=format&fit=crop&w=1200&q=80'
  }
];

const EXTRAS: ExtraOption[] = [
  { id: 'extra-cheese', label: 'Extra Käse', price: 2.5 },
  { id: 'truffle-oil', label: 'Trüffelöl', price: 3.5 },
  { id: 'burrata', label: 'Burrata', price: 4.2 }
];

const STORAGE_KEY = 'bella-napoli-cart-v1';
const TAX_RATE = 0.07;
const DELIVERY_FEE = 5;

function formatEUR(value: number): string {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(value);
}

export default function App() {
  const [cart, setCart] = useState<CartItem[]>([]);
  const [showCart, setShowCart] = useState(false);
  const [activePizza, setActivePizza] = useState<PizzaItem | null>(null);
  const [selectedExtras, setSelectedExtras] = useState<ExtraOption[]>([]);
  const [checkoutStep, setCheckoutStep] = useState(1);
  const [address, setAddress] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'card' | 'cash'>('card');
  const [orderDone, setOrderDone] = useState(false);
  const [headerTransparent, setHeaderTransparent] = useState(true);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) setCart(parsed as CartItem[]);
    } catch {
      // ignore malformed localStorage values
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(cart));
    } catch {
      // ignore storage write errors
    }
  }, [cart]);

  useEffect(() => {
    const onScroll = () => setHeaderTransparent(window.scrollY < 24);
    onScroll();
    window.addEventListener('scroll', onScroll);
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    if (!orderDone) return;
    const timer = window.setTimeout(() => setOrderDone(false), 2400);
    return () => window.clearTimeout(timer);
  }, [orderDone]);

  const subtotal = useMemo(
    () => cart.reduce((sum, item) => {
      const extrasSum = item.extras.reduce((acc, extra) => acc + extra.price, 0);
      return sum + (item.basePrice + extrasSum) * item.quantity;
    }, 0),
    [cart]
  );
  const tax = subtotal * TAX_RATE;
  const total = subtotal + tax + (cart.length > 0 ? DELIVERY_FEE : 0);

  const openConfigurator = (pizza: PizzaItem) => {
    setActivePizza(pizza);
    setSelectedExtras([]);
  };

  const toggleExtra = (extra: ExtraOption) => {
    setSelectedExtras((prev) =>
      prev.some((item) => item.id === extra.id)
        ? prev.filter((item) => item.id !== extra.id)
        : [...prev, extra]
    );
  };

  const addConfiguredPizza = () => {
    if (!activePizza) return;
    const id = \`\${activePizza.id}-\${Date.now()}\`;
    const newItem: CartItem = {
      id,
      pizzaId: activePizza.id,
      name: activePizza.name,
      basePrice: activePizza.price,
      extras: selectedExtras,
      quantity: 1
    };
    setCart((prev) => [...prev, newItem]);
    setShowCart(true);
    setActivePizza(null);
  };

  const updateQuantity = (id: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((item) => item.id === id ? { ...item, quantity: Math.max(0, item.quantity + delta) } : item)
        .filter((item) => item.quantity > 0)
    );
  };

  const removeItem = (id: string) => {
    setCart((prev) => prev.filter((item) => item.id !== id));
  };

  const confirmOrder = () => {
    if (!address.trim()) return;
    if (cart.length === 0) return;
    setCart([]);
    setCheckoutStep(1);
    setAddress('');
    setPaymentMethod('card');
    setShowCart(false);
    setOrderDone(true);
  };

  const configuredPrice = useMemo(() => {
    if (!activePizza) return 0;
    return activePizza.price + selectedExtras.reduce((sum, extra) => sum + extra.price, 0);
  }, [activePizza, selectedExtras]);

  return (
    <div className="min-h-screen bg-[#0B0B0D] text-zinc-100">
      {orderDone ? <Confetti recycle={false} numberOfPieces={240} /> : null}

      <header className={\`sticky top-0 z-40 border-b border-[#D4AF37]/30 transition-all \${headerTransparent ? 'bg-black/30 backdrop-blur-md' : 'bg-black/90'}\`}>
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2 text-xl font-semibold tracking-wide text-[#D4AF37]">
            <Pizza className="h-5 w-5" />
            Bella Napoli
          </div>
          <button
            type="button"
            onClick={() => setShowCart(true)}
            className="relative inline-flex items-center gap-2 rounded-lg border border-[#D4AF37]/40 bg-[#2A0F16] px-4 py-2 text-sm font-semibold text-[#F5DE9A] transition hover:border-[#D4AF37]"
          >
            <ShoppingCart className="h-4 w-4" />
            Warenkorb
            {cart.length > 0 ? <span className="rounded-full bg-[#D4AF37] px-2 py-0.5 text-xs text-black">{cart.length}</span> : null}
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 pb-20 pt-10">
        <section className="mb-8 rounded-2xl border border-[#D4AF37]/20 bg-gradient-to-br from-[#1A1012] to-[#130E15] p-8">
          <h1 className="text-4xl font-semibold text-[#F5DE9A]">Handwerkliche Pizzen mit Goldstandard</h1>
          <p className="mt-3 max-w-3xl text-zinc-300">
            Luxuriöses Dark-Design mit Tiefrot-Akzenten, frischen Zutaten und einem schnellen Checkout-Flow.
          </p>
        </section>

        <section className="grid gap-5 md:grid-cols-3">
          {MENU.map((pizza, index) => (
            <motion.article
              key={pizza.id}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: index * 0.08, duration: 0.35 }}
              className="overflow-hidden rounded-2xl border border-[#D4AF37]/20 bg-[#120E13]"
            >
              <img src={pizza.image} alt={pizza.name} className="h-44 w-full object-cover" />
              <div className="space-y-3 p-4">
                <h2 className="text-xl font-semibold text-[#F5DE9A]">{pizza.name}</h2>
                <p className="text-sm text-zinc-400">{pizza.ingredients.join(' · ')}</p>
                <div className="flex items-center justify-between">
                  <span className="text-lg font-semibold">{formatEUR(pizza.price)}</span>
                  <button
                    type="button"
                    onClick={() => openConfigurator(pizza)}
                    className="rounded-lg bg-[#7E1E2D] px-3 py-2 text-sm font-semibold text-white transition hover:bg-[#96263A]"
                  >
                    Konfigurieren
                  </button>
                </div>
              </div>
            </motion.article>
          ))}
        </section>
      </main>

      <AnimatePresence>
        {activePizza ? (
          <motion.div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 20, opacity: 0 }} className="w-full max-w-xl rounded-2xl border border-[#D4AF37]/30 bg-[#120E13] p-6">
              <div className="mb-4 flex items-start justify-between">
                <div>
                  <h3 className="text-2xl font-semibold text-[#F5DE9A]">{activePizza.name}</h3>
                  <p className="text-sm text-zinc-400">Pizza-Konfigurator mit Live-Preis</p>
                </div>
                <button type="button" onClick={() => setActivePizza(null)} className="rounded-md p-1 text-zinc-300 hover:bg-zinc-800">
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="space-y-2">
                {EXTRAS.map((extra) => {
                  const checked = selectedExtras.some((item) => item.id === extra.id);
                  return (
                    <label key={extra.id} className="flex cursor-pointer items-center justify-between rounded-lg border border-zinc-700 px-3 py-2">
                      <span>{extra.label}</span>
                      <span className="flex items-center gap-3">
                        <span className="text-sm text-zinc-400">+{formatEUR(extra.price)}</span>
                        <input type="checkbox" checked={checked} onChange={() => toggleExtra(extra)} />
                      </span>
                    </label>
                  );
                })}
              </div>
              <div className="mt-5 flex items-center justify-between">
                <span className="text-sm text-zinc-300">Live Preis: <strong className="text-[#F5DE9A]">{formatEUR(configuredPrice)}</strong></span>
                <button type="button" onClick={addConfiguredPizza} className="rounded-lg bg-[#D4AF37] px-4 py-2 font-semibold text-black hover:bg-[#E7C661]">
                  Zum Warenkorb
                </button>
              </div>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {showCart ? (
          <motion.aside initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }} transition={{ type: 'tween', duration: 0.2 }} className="fixed right-0 top-0 z-50 h-full w-full max-w-md overflow-y-auto border-l border-[#D4AF37]/30 bg-[#0E0A11] p-5 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-xl font-semibold text-[#F5DE9A]">Warenkorb</h3>
              <button type="button" onClick={() => setShowCart(false)} className="rounded-md p-1 hover:bg-zinc-800"><X className="h-5 w-5" /></button>
            </div>

            <div className="space-y-3">
              {cart.map((item) => (
                <div key={item.id} className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-medium">{item.name}</p>
                      {item.extras.length > 0 ? <p className="text-xs text-zinc-400">{item.extras.map((extra) => extra.label).join(', ')}</p> : null}
                    </div>
                    <button type="button" onClick={() => removeItem(item.id)} className="text-xs text-red-300 hover:text-red-200">Entfernen</button>
                  </div>
                  <div className="mt-2 flex items-center justify-between">
                    <div className="inline-flex items-center gap-2 rounded-lg border border-zinc-700 px-2 py-1">
                      <button type="button" onClick={() => updateQuantity(item.id, -1)}><Minus className="h-4 w-4" /></button>
                      <span className="min-w-6 text-center">{item.quantity}</span>
                      <button type="button" onClick={() => updateQuantity(item.id, 1)}><Plus className="h-4 w-4" /></button>
                    </div>
                    <span>{formatEUR((item.basePrice + item.extras.reduce((sum, extra) => sum + extra.price, 0)) * item.quantity)}</span>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-5 space-y-2 rounded-lg border border-zinc-800 bg-zinc-900/40 p-3 text-sm">
              <div className="flex items-center justify-between"><span>Zwischensumme</span><span>{formatEUR(subtotal)}</span></div>
              <div className="flex items-center justify-between"><span>MwSt. (7%)</span><span>{formatEUR(tax)}</span></div>
              <div className="flex items-center justify-between"><span>Liefergebühr</span><span>{formatEUR(cart.length > 0 ? DELIVERY_FEE : 0)}</span></div>
              <div className="mt-2 flex items-center justify-between border-t border-zinc-700 pt-2 text-base font-semibold text-[#F5DE9A]"><span>Gesamt</span><span>{formatEUR(total)}</span></div>
            </div>

            <div className="mt-6 rounded-xl border border-[#D4AF37]/25 bg-[#1A1012] p-4">
              <p className="mb-3 text-sm font-semibold text-[#F5DE9A]">Checkout-Flow ({checkoutStep}/3)</p>
              {checkoutStep === 1 ? (
                <div className="space-y-3">
                  <input value={address} onChange={(event) => setAddress(event.target.value)} placeholder="Adresse eingeben" className="h-10 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 text-sm" />
                  <button type="button" onClick={() => setCheckoutStep(2)} disabled={!address.trim()} className="w-full rounded-lg bg-[#D4AF37] px-3 py-2 font-semibold text-black disabled:opacity-40">Weiter</button>
                </div>
              ) : null}
              {checkoutStep === 2 ? (
                <div className="space-y-3">
                  <select value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value as 'card' | 'cash')} className="h-10 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 text-sm">
                    <option value="card">Kreditkarte</option>
                    <option value="cash">Bar bei Lieferung</option>
                  </select>
                  <button type="button" onClick={() => setCheckoutStep(3)} className="w-full rounded-lg bg-[#D4AF37] px-3 py-2 font-semibold text-black">Weiter</button>
                </div>
              ) : null}
              {checkoutStep === 3 ? (
                <div className="space-y-3 text-sm">
                  <p>Adresse: <strong>{address}</strong></p>
                  <p>Zahlung: <strong>{paymentMethod === 'card' ? 'Kreditkarte' : 'Bar'}</strong></p>
                  <button type="button" onClick={confirmOrder} className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-500 px-3 py-2 font-semibold text-white">
                    <CheckCircle2 className="h-4 w-4" />
                    Bestellung abschicken
                  </button>
                </div>
              ) : null}
            </div>
          </motion.aside>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
`;

const SPLIT_BILL_APP_TEMPLATE = `import { useMemo, useState } from 'react';

type BillItem = {
  id: string;
  name: string;
  price: number;
};

const INITIAL_ITEMS: BillItem[] = [
  { id: 'i-1', name: 'Pizza', price: 12 },
  { id: 'i-2', name: 'Cola', price: 3 },
];

export default function App() {
  const [items, setItems] = useState<BillItem[]>(INITIAL_ITEMS);
  const [people, setPeople] = useState(2);
  const [tipPercent, setTipPercent] = useState(10);
  const [manualTotal, setManualTotal] = useState('');

  const itemSubtotal = useMemo(
    () => items.reduce((sum, item) => sum + (Number.isFinite(item.price) ? item.price : 0), 0),
    [items]
  );

  const enteredTotal = Number.parseFloat(manualTotal);
  const baseTotal = Number.isFinite(enteredTotal) ? enteredTotal : itemSubtotal;
  const tipAmount = baseTotal * (tipPercent / 100);
  const grandTotal = baseTotal + tipAmount;
  const perPerson = people > 0 ? grandTotal / people : grandTotal;

  const addItem = () => {
    setItems((current) => [
      ...current,
      { id: String(Date.now()), name: 'Item ' + String(current.length + 1), price: 0 },
    ]);
  };

  const updateItem = (id: string, field: 'name' | 'price', value: string) => {
    setItems((current) =>
      current.map((item) => item.id === id
        ? {
            ...item,
            [field]: field === 'price' ? (Number.parseFloat(value) || 0) : value,
          }
        : item)
    );
  };

  const removeItem = (id: string) => {
    setItems((current) => current.filter((item) => item.id !== id));
  };

  return (
    <main className=\"min-h-screen bg-slate-950 px-6 py-10 text-white\">
      <div className=\"mx-auto max-w-4xl rounded-3xl border border-white/10 bg-white/5 p-8\">
        <h1 className=\"text-4xl font-semibold\">Split Bill Rechner</h1>
        <p className=\"mt-3 text-slate-300\">Berechne live, wie viel jede Person zahlen muss.</p>

        <section className=\"mt-8 grid gap-4 md:grid-cols-3\">
          <label className=\"rounded-2xl border border-white/10 bg-slate-900/80 p-4\">
            <span className=\"text-sm text-slate-400\">Gesamtbetrag</span>
            <input
              value={manualTotal}
              onChange={(event) => setManualTotal(event.target.value)}
              className=\"mt-3 w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2\"
              placeholder=\"oder automatisch aus Positionen\"
            />
          </label>
          <label className=\"rounded-2xl border border-white/10 bg-slate-900/80 p-4\">
            <span className=\"text-sm text-slate-400\">Personen</span>
            <input
              type=\"number\"
              min={1}
              value={people}
              onChange={(event) => setPeople(Math.max(1, Number.parseInt(event.target.value || '1', 10)))}
              className=\"mt-3 w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2\"
            />
          </label>
          <label className=\"rounded-2xl border border-white/10 bg-slate-900/80 p-4\">
            <span className=\"text-sm text-slate-400\">Trinkgeld ({tipPercent}%)</span>
            <input
              type=\"range\"
              min={0}
              max={30}
              value={tipPercent}
              onChange={(event) => setTipPercent(Number.parseInt(event.target.value, 10))}
              className=\"mt-4 w-full\"
            />
          </label>
        </section>

        <section className=\"mt-8 rounded-2xl border border-white/10 bg-slate-900/70 p-5\">
          <div className=\"flex items-center justify-between\">
            <h2 className=\"text-xl font-medium\">Positionen</h2>
            <button onClick={addItem} className=\"rounded-xl bg-cyan-500 px-4 py-2 font-medium text-slate-950\">Position hinzufuegen</button>
          </div>
          <div className=\"mt-4 space-y-3\">
            {items.map((item) => (
              <div key={item.id} className=\"grid gap-3 md:grid-cols-[1fr_140px_auto]\">
                <input
                  value={item.name}
                  onChange={(event) => updateItem(item.id, 'name', event.target.value)}
                  className=\"rounded-xl border border-white/10 bg-slate-950 px-3 py-2\"
                />
                <input
                  type=\"number\"
                  value={item.price}
                  onChange={(event) => updateItem(item.id, 'price', event.target.value)}
                  className=\"rounded-xl border border-white/10 bg-slate-950 px-3 py-2\"
                />
                <button onClick={() => removeItem(item.id)} className=\"rounded-xl border border-white/10 px-3 py-2 text-slate-300\">Entfernen</button>
              </div>
            ))}
          </div>
        </section>

        <section className=\"mt-8 grid gap-4 md:grid-cols-4\">
          <StatCard label=\"Positionen\" value={itemSubtotal.toFixed(2)} suffix=\"EUR\" />
          <StatCard label=\"Basis\" value={baseTotal.toFixed(2)} suffix=\"EUR\" />
          <StatCard label=\"Trinkgeld\" value={tipAmount.toFixed(2)} suffix=\"EUR\" />
          <StatCard label=\"Pro Person\" value={perPerson.toFixed(2)} suffix=\"EUR\" tone=\"cyan\" />
        </section>
      </div>
    </main>
  );
}

function StatCard(props: { label: string; value: string; suffix: string; tone?: 'default' | 'cyan' }) {
  return (
    <div className={\`rounded-2xl border border-white/10 p-4 \${props.tone === 'cyan' ? 'bg-cyan-500/10' : 'bg-slate-900/70'}\`}>
      <p className=\"text-sm text-slate-400\">{props.label}</p>
      <p className=\"mt-3 text-2xl font-semibold\">{props.value} <span className=\"text-sm text-slate-400\">{props.suffix}</span></p>
    </div>
  );
}
`;

const CRYPTO_DASHBOARD_APP_TEMPLATE = `import { useMemo, useState } from 'react';

type AssetRow = {
  asset: string;
  price: number;
  change24h: number;
};

const ASSETS: AssetRow[] = [
  { asset: 'BTC', price: 68420, change24h: 3.6 },
  { asset: 'ETH', price: 3520, change24h: 1.9 },
  { asset: 'SOL', price: 188, change24h: -2.1 },
];

const HISTORY = [42, 46, 44, 50, 56, 54, 61, 67];

export default function App() {
  const [darkMode, setDarkMode] = useState(true);
  const [sortDescending, setSortDescending] = useState(true);

  const sortedAssets = useMemo(() => {
    const next = [...ASSETS];
    next.sort((a, b) => sortDescending ? b.price - a.price : a.price - b.price);
    return next;
  }, [sortDescending]);

  const chartPoints = HISTORY.map((value, index) => {
    const x = 30 + index * 70;
    const y = 190 - value * 2;
    return String(x) + ',' + String(y);
  }).join(' ');

  return (
    <div className={darkMode ? 'min-h-screen bg-slate-950 text-white' : 'min-h-screen bg-slate-100 text-slate-900'}>
      <div className=\"grid min-h-screen md:grid-cols-[260px_1fr]\">
        <aside className={darkMode ? 'border-r border-white/10 bg-slate-900/90 p-6' : 'border-r border-slate-200 bg-white p-6'}>
          <p className=\"text-sm uppercase tracking-[0.3em] text-cyan-400\">Portfolio</p>
          <h1 className=\"mt-4 text-3xl font-semibold\">Crypto Dashboard</h1>
          <nav className=\"mt-8 space-y-3 text-sm\">
            <div>Overview</div>
            <div>Assets</div>
            <div>Transactions</div>
          </nav>
          <button
            onClick={() => setDarkMode((value) => !value)}
            className=\"mt-8 rounded-xl bg-cyan-500 px-4 py-2 font-medium text-slate-950\"
          >
            {darkMode ? 'Light Mode' : 'Dark Mode'}
          </button>
        </aside>

        <main className=\"p-6 md:p-10\">
          <section className={darkMode ? 'rounded-3xl border border-white/10 bg-white/5 p-6' : 'rounded-3xl border border-slate-200 bg-white p-6'}>
            <div className=\"flex items-center justify-between\">
              <div>
                <p className=\"text-sm text-slate-400\">Bitcoin price history</p>
                <h2 className=\"mt-2 text-3xl font-semibold\">BTC Trend</h2>
              </div>
              <button
                onClick={() => setSortDescending((value) => !value)}
                className={darkMode ? 'rounded-xl border border-white/10 px-4 py-2 text-sm' : 'rounded-xl border border-slate-200 px-4 py-2 text-sm'}
              >
                Sort by price: {sortDescending ? 'High to Low' : 'Low to High'}
              </button>
            </div>

            <svg viewBox=\"0 0 560 220\" className=\"mt-6 h-56 w-full rounded-2xl\">
              <defs>
                <linearGradient id=\"line\" x1=\"0%\" x2=\"100%\" y1=\"0%\" y2=\"0%\">
                  <stop offset=\"0%\" stopColor=\"#22d3ee\" />
                  <stop offset=\"100%\" stopColor=\"#60a5fa\" />
                </linearGradient>
              </defs>
              <rect x=\"0\" y=\"0\" width=\"560\" height=\"220\" rx=\"24\" fill={darkMode ? '#0f172a' : '#e2e8f0'} />
              <polyline fill=\"none\" stroke=\"url(#line)\" strokeWidth=\"6\" points={chartPoints} />
            </svg>
          </section>

          <section className={darkMode ? 'mt-8 rounded-3xl border border-white/10 bg-white/5 p-6' : 'mt-8 rounded-3xl border border-slate-200 bg-white p-6'}>
            <div className=\"grid grid-cols-[1fr_1fr_1fr] gap-4 text-sm font-medium text-slate-400\">
              <span>Asset</span>
              <span>Preis</span>
              <span>24h Aenderung</span>
            </div>
            <div className=\"mt-4 space-y-3\">
              {sortedAssets.map((row) => (
                <div key={row.asset} className={darkMode ? 'grid grid-cols-[1fr_1fr_1fr] gap-4 rounded-2xl border border-white/10 bg-slate-900/80 px-4 py-3' : 'grid grid-cols-[1fr_1fr_1fr] gap-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3'}>
                  <span>{row.asset}</span>
                  <span>{'$'}{row.price.toLocaleString()}</span>
                  <span className={row.change24h >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                    {row.change24h >= 0 ? '+' : ''}{row.change24h.toFixed(1)}%
                  </span>
                </div>
              ))}
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}
`;

export function applyDeterministicDomainFallback(input: {
  packIds: string[];
  files: Record<string, string>;
  generationMode: 'new' | 'edit';
  report: DomainCoverageReport;
  forcePacks?: string[];
}): DeterministicDomainFallbackResult {
  const nextFiles: Record<string, string> = { ...input.files };
  const applied: string[] = [];
  const forceSet = new Set(input.forcePacks || []);

  const hasKanbanCritical = input.report.issues.some(
    (issue) => issue.packId === 'kanban' && issue.severity === 'critical'
  );
  const hasRestaurantCritical = input.report.issues.some(
    (issue) => issue.packId === 'restaurant-commerce-premium' && issue.severity === 'critical'
  );
  const hasSplitBillCritical = input.report.issues.some(
    (issue) => issue.packId === 'split-bill-tool' && issue.severity === 'critical'
  );
  const hasCryptoCritical = input.report.issues.some(
    (issue) => issue.packId === 'crypto-dashboard' && issue.severity === 'critical'
  );
  const hasForcedKanban = forceSet.has('kanban');
  const hasForcedRestaurant = forceSet.has('restaurant-commerce-premium');
  const hasForcedSplitBill = forceSet.has('split-bill-tool');
  const hasForcedCrypto = forceSet.has('crypto-dashboard');

  if (input.packIds.includes('kanban') && (hasKanbanCritical || hasForcedKanban)) {
    nextFiles['src/components/kanban/KanbanBoard.tsx'] = KANBAN_BOARD_TEMPLATE;
    nextFiles['src/pages/Board.tsx'] = KANBAN_BOARD_PAGE_TEMPLATE;
    applied.push('kanban_board_template');

    const appCode = nextFiles['src/App.tsx'] || '';
    const malformedApp =
      !appCode ||
      isStubModule(appCode) ||
      appCode.includes('"files"') ||
      appCode.includes('```');
    const missingBoardRoute = !/\/board/.test(appCode);

    if (input.generationMode === 'new' && (malformedApp || missingBoardRoute)) {
      nextFiles['src/App.tsx'] = KANBAN_APP_TEMPLATE;
      applied.push('kanban_app_routes');
    }
  }

  if (input.packIds.includes('restaurant-commerce-premium') && (hasRestaurantCritical || hasForcedRestaurant)) {
    nextFiles['src/App.tsx'] = RESTAURANT_PREMIUM_APP_TEMPLATE;
    nextFiles['src/App.css'] = `/* deterministic fallback kept intentionally small */\n`;
    applied.push('restaurant_commerce_premium_app');
  }

  if (input.packIds.includes('split-bill-tool') && (hasSplitBillCritical || hasForcedSplitBill)) {
    nextFiles['src/App.tsx'] = SPLIT_BILL_APP_TEMPLATE;
    applied.push('split_bill_tool_app');
  }

  if (input.packIds.includes('crypto-dashboard') && (hasCryptoCritical || hasForcedCrypto)) {
    nextFiles['src/App.tsx'] = CRYPTO_DASHBOARD_APP_TEMPLATE;
    applied.push('crypto_dashboard_app');
  }

  return { files: nextFiles, applied };
}
