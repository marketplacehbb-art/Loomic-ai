import type { MutableRefObject } from 'react';

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
    <header className="flex items-center justify-between mb-10">
      <div className="flex items-center gap-4 flex-1 max-w-2xl">
        <div className="relative flex-1">
          <span className="material-symbols-rounded absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 text-xl">search</span>
          <input
            className="w-full bg-slate-100 dark:bg-card-dark border-none rounded-full py-2.5 pl-12 pr-4 focus:ring-2 focus:ring-primary/50 text-sm outline-none"
            placeholder="Search apps..."
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
          />
        </div>

        <div ref={sortMenuRef} className="relative">
          <button
            type="button"
            aria-haspopup="menu"
            aria-expanded={sortMenuOpen}
            onClick={() => setSortMenuOpen((prev) => !prev)}
            className="flex items-center bg-slate-100 dark:bg-card-dark rounded-full px-4 py-2 text-sm cursor-pointer hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors border border-transparent dark:border-border-dark"
          >
            <span className="material-symbols-rounded text-lg mr-2">sort</span>
            <span className="font-medium mr-4">
              {sortOrder === 'newest' ? 'Newest First' : sortOrder === 'oldest' ? 'Oldest First' : 'Name (A-Z)'}
            </span>
            <span className="material-symbols-rounded text-lg">expand_more</span>
          </button>

          <div
            role="menu"
            className={`absolute right-0 top-full mt-2 w-48 bg-white dark:bg-card-dark rounded-xl shadow-xl border border-slate-200 dark:border-border-dark overflow-hidden transition-all z-10 ${
              sortMenuOpen ? 'opacity-100 visible' : 'opacity-0 invisible'
            }`}
          >
            <button
              role="menuitem"
              onClick={() => {
                setSortOrder('newest');
                setSortMenuOpen(false);
              }}
              className={`w-full text-left px-4 py-2 text-sm hover:bg-slate-100 dark:hover:bg-white/5 ${sortOrder === 'newest' ? 'text-primary font-bold' : ''}`}
            >
              Newest First
            </button>
            <button
              role="menuitem"
              onClick={() => {
                setSortOrder('oldest');
                setSortMenuOpen(false);
              }}
              className={`w-full text-left px-4 py-2 text-sm hover:bg-slate-100 dark:hover:bg-white/5 ${sortOrder === 'oldest' ? 'text-primary font-bold' : ''}`}
            >
              Oldest First
            </button>
            <button
              role="menuitem"
              onClick={() => {
                setSortOrder('az');
                setSortMenuOpen(false);
              }}
              className={`w-full text-left px-4 py-2 text-sm hover:bg-slate-100 dark:hover:bg-white/5 ${sortOrder === 'az' ? 'text-primary font-bold' : ''}`}
            >
              Name (A-Z)
            </button>
          </div>
        </div>
      </div>
      <button
        onClick={onCreateProject}
        className="bg-primary hover:bg-primary/90 text-white px-6 py-2.5 rounded-full font-semibold flex items-center gap-2 shadow-lg shadow-primary/30 transition-all hover:scale-[1.02] active:scale-[0.98]"
      >
        <span className="material-symbols-rounded">add</span>
        New Project
      </button>
    </header>
  );
}
