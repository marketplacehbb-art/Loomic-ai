import type { MutableRefObject } from 'react';
import { ChevronDown, Plus, Search } from 'lucide-react';

type SortOrder = 'newest' | 'oldest' | 'az';

interface DashboardHeaderProps {
  searchInput: string;
  setSearchInput: (value: string) => void;
  sortOrder: SortOrder;
  setSortOrder: (value: SortOrder) => void;
  sortMenuOpen: boolean;
  setSortMenuOpen: (value: boolean | ((prev: boolean) => boolean)) => void;
  sortMenuRef: MutableRefObject<HTMLDivElement | null>;
  onCreateProject: () => void;
}

export default function DashboardHeader({
  searchInput,
  setSearchInput,
  sortOrder,
  setSortOrder,
  sortMenuOpen,
  setSortMenuOpen,
  sortMenuRef,
  onCreateProject,
}: DashboardHeaderProps) {
  return (
    <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
      <div className="flex min-w-[280px] flex-1 items-center gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          <input
            className="w-full rounded-xl border border-slate-800 bg-slate-900 py-2.5 pl-10 pr-16 text-sm text-white outline-none transition focus:border-purple-500/60 focus:ring-2 focus:ring-purple-500/30"
            placeholder="Search projects..."
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
          />
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 rounded-md border border-slate-700 bg-slate-950 px-1.5 py-0.5 text-[10px] font-medium text-slate-500">
            ?K
          </span>
        </div>

        <div ref={sortMenuRef} className="relative">
          <button
            type="button"
            aria-haspopup="menu"
            aria-expanded={sortMenuOpen}
            onClick={() => setSortMenuOpen((prev) => !prev)}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-slate-200 transition-colors hover:bg-slate-800"
          >
            <span className="text-sm font-medium">
              {sortOrder === 'newest' ? 'Newest First' : sortOrder === 'oldest' ? 'Oldest First' : 'Name (A-Z)'}
            </span>
            <ChevronDown className="h-4 w-4 text-slate-400" />
          </button>

          <div
            role="menu"
            className={`absolute right-0 top-full z-10 mt-2 w-48 overflow-hidden rounded-xl border border-slate-800 bg-slate-900 shadow-2xl transition-all ${
              sortMenuOpen ? 'visible opacity-100' : 'invisible opacity-0'
            }`}
          >
            <button
              role="menuitem"
              onClick={() => {
                setSortOrder('newest');
                setSortMenuOpen(false);
              }}
              className={`w-full px-4 py-2 text-left text-sm transition-colors hover:bg-slate-800 ${sortOrder === 'newest' ? 'font-semibold text-purple-300' : 'text-slate-300'}`}
            >
              Newest First
            </button>
            <button
              role="menuitem"
              onClick={() => {
                setSortOrder('oldest');
                setSortMenuOpen(false);
              }}
              className={`w-full px-4 py-2 text-left text-sm transition-colors hover:bg-slate-800 ${sortOrder === 'oldest' ? 'font-semibold text-purple-300' : 'text-slate-300'}`}
            >
              Oldest First
            </button>
            <button
              role="menuitem"
              onClick={() => {
                setSortOrder('az');
                setSortMenuOpen(false);
              }}
              className={`w-full px-4 py-2 text-left text-sm transition-colors hover:bg-slate-800 ${sortOrder === 'az' ? 'font-semibold text-purple-300' : 'text-slate-300'}`}
            >
              Name (A-Z)
            </button>
          </div>
        </div>
      </div>

      <button
        onClick={onCreateProject}
        className="inline-flex items-center gap-2 rounded-xl bg-purple-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-purple-900/30 transition-all hover:bg-purple-500 hover:scale-[1.01] active:scale-[0.98]"
      >
        <Plus className="h-4 w-4" />
        New Project
      </button>
    </header>
  );
}
