interface DashboardStatsProps {
  isInitialLoading: boolean;
  searchQuery: string;
  filteredProjectCount: number;
  totalCount: number;
  publishedCount: number;
}

export default function DashboardStats({
  isInitialLoading,
  searchQuery,
  filteredProjectCount,
  totalCount,
  publishedCount,
}: DashboardStatsProps) {
  return (
    <section className="bg-slate-100 dark:bg-card-dark border border-slate-200 dark:border-border-dark rounded-3xl p-6 mb-10 flex items-center divide-x divide-slate-200 dark:divide-border-dark">
      <div className="flex-1 px-6 first:pl-0 last:pr-0">
        <div className="flex items-center justify-between mb-2">
          <span className="material-symbols-rounded text-primary">folder</span>
          <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 tracking-widest uppercase">Total</span>
        </div>
        <div className="text-3xl font-bold mb-1">{isInitialLoading ? '-' : (searchQuery ? filteredProjectCount : totalCount)}</div>
        <p className="text-xs text-slate-500 dark:text-slate-400">Total Projects</p>
      </div>
      <div className="flex-1 px-6">
        <div className="flex items-center justify-between mb-2">
          <span className="material-symbols-rounded text-green-500">check_circle</span>
          <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 tracking-widest uppercase">Live</span>
        </div>
        <div className="text-3xl font-bold mb-1">{isInitialLoading ? '-' : publishedCount}</div>
        <p className="text-xs text-slate-500 dark:text-slate-400">Published</p>
      </div>
    </section>
  );
}
