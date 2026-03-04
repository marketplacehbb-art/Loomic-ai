export interface DomainPackResult {
  packIds: string[];
  instruction: string;
}

function hasFeature(features: string[], key: string): boolean {
  return features.includes(key);
}

export function resolveDomainPacks(input: {
  prompt: string;
  features: string[];
  projectType?: string;
}): DomainPackResult {
  const lower = input.prompt.toLowerCase();
  const instructions: string[] = [];
  const packIds: string[] = [];

  const wantsKanban = hasFeature(input.features, 'kanban') || /kanban|trello|drag-and-drop|drag and drop|@dnd-kit/.test(lower);
  const wantsPathfinding = hasFeature(input.features, 'pathfinding') || /dijkstra|pathfinding|shortest path/.test(lower);
  const wantsInventoryInvoice =
    hasFeature(input.features, 'inventory') ||
    hasFeature(input.features, 'invoice') ||
    /inventory|invoice|lagerbestand|rechnung/.test(lower);
  const wantsSplitBill =
    hasFeature(input.features, 'calculator') ||
    /split-bill|split bill|trinkgeld|tip slider|gesamtbetrag|anzahl der personen|wie viel jeder zahlen/.test(lower);
  const wantsCryptoDashboard =
    (
      hasFeature(input.features, 'chart') ||
      hasFeature(input.features, 'dashboard')
    ) &&
    /crypto|bitcoin|portfolio|preisverlauf|24h|dark mode|recharts|chart\.js/.test(lower);
  const wantsRestaurantCommercePremium =
    /pizza|pizzeria|restaurant|handwerklich|artisan|menu|men\u00fc|checkout|warenkorb|cart/.test(lower) &&
    (
      hasFeature(input.features, 'cart') ||
      hasFeature(input.features, 'modal') ||
      hasFeature(input.features, 'persistence') ||
      /localstorage|local storage|framer motion|confetti|mwst|steuer|tax/.test(lower)
    );

  if (wantsKanban) {
    packIds.push('kanban');
    instructions.push(
      [
        'Domain pack: kanban',
        '- Build board state as source of truth: columns -> cards.',
        '- Each card must include stable id, title, priority.',
        '- Implement cross-column move logic and update state atomically.',
        '- Add real-time filter over all cards, without mutating original card arrays.',
        '- Persist board state safely (localStorage fallback if unavailable).',
      ].join('\n')
    );
  }

  if (wantsPathfinding) {
    packIds.push('pathfinding');
    instructions.push(
      [
        'Domain pack: pathfinding',
        '- Build deterministic grid model with node types: empty, wall, start, goal.',
        '- Keep visited order and shortest-path reconstruction in explicit arrays.',
        '- Animate search and path with time-based loop, not random coloring.',
        '- Provide legend labels for visited nodes and shortest path.',
      ].join('\n')
    );
  }

  if (wantsInventoryInvoice) {
    packIds.push('inventory-invoice');
    instructions.push(
      [
        'Domain pack: inventory-invoice',
        '- Keep products and stock in one store to avoid desync.',
        '- Invoice line items must reference product ids, not duplicated product objects.',
        '- On invoice finalize, decrement stock deterministically and block negative stock.',
        '- Trigger low-stock warning when product stock < 5.',
        '- Provide PDF/print output path for invoice rendering.',
      ].join('\n')
    );
  }

  if (wantsSplitBill) {
    packIds.push('split-bill-tool');
    instructions.push(
      [
        'Domain pack: split-bill-tool',
        '- Keep bill inputs as typed numeric state with safe fallback to 0.',
        '- Compute subtotal from item rows first, then derive grand total and per-person share from one source of truth.',
        '- Tip percentage must update totals live through a deterministic derived value.',
        '- Item rows must support add/remove without duplicating aggregate math in multiple places.',
      ].join('\n')
    );
  }

  if (wantsCryptoDashboard) {
    packIds.push('crypto-dashboard');
    instructions.push(
      [
        'Domain pack: crypto-dashboard',
        '- Use a dedicated app shell with sidebar, top-level dark mode toggle, and isolated chart/table widgets.',
        '- Keep asset rows in typed state and implement sortable numeric columns deterministically.',
        '- Simulate price history from stable in-memory data, not random values on each render.',
        '- Theme switching must update the entire app shell, not only one widget.',
      ].join('\n')
    );
  }

  if (wantsRestaurantCommercePremium) {
    packIds.push('restaurant-commerce-premium');
    instructions.push(
      [
        'Domain pack: restaurant-commerce-premium',
        '- Enforce modular architecture (no single App.tsx monolith).',
        '- Required modules: menu data, pizza types, cart hook/store, configurator modal, cart sidebar, checkout flow.',
        '- Cart totals must include subtotal + 7% tax + 5 EUR delivery fee.',
        '- Persist cart in localStorage with safe guards (SSR-safe checks).',
        '- Use Framer Motion only for subtle section/card transitions.',
        '- Trigger success confetti only after completed checkout confirmation.',
        '- Keep sticky header and transparent-on-scroll behavior deterministic.',
      ].join('\n')
    );
  }

  return {
    packIds,
    instruction: instructions.join('\n\n'),
  };
}
