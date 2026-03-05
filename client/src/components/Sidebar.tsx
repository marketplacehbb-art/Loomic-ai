import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { resolveImageWithFallback } from '../lib/assets';

interface SidebarProps {
  onDeploy?: () => void | Promise<void>;
  deployDisabled?: boolean;
  deployBusy?: boolean;
  deployLabel?: string;
}

export default function Sidebar({
  onDeploy,
  deployDisabled = false,
  deployBusy = false,
  deployLabel = 'Deploy',
}: SidebarProps) {
  const { user, profile, signOut } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();

  const isActive = (path: string) => location.pathname === path || location.pathname.startsWith(`${path}/`);
  const navItemClass = (active: boolean) =>
    `flex items-center gap-3 rounded-lg px-3 py-3 font-medium transition-colors ${
      active
        ? 'border border-purple-500/30 bg-purple-500/10 text-purple-300'
        : 'border border-transparent text-slate-400 hover:border-slate-800 hover:bg-slate-900 hover:text-white'
    }`;

  const deployButtonClass =
    'mt-2 w-full flex items-center gap-3 rounded-lg border border-slate-800 bg-slate-900 px-3 py-2.5 text-sm font-semibold text-slate-200 transition-colors hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed';

  const handleLogout = async () => {
    await signOut();
    navigate('/login');
  };

  return (
    <aside className="fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-slate-800 bg-black">
      <div className="flex items-center gap-3 p-6">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-600 shadow-lg shadow-purple-900/30">
          <span className="material-symbols-rounded text-white">auto_awesome</span>
        </div>
        <span className="text-xl font-bold tracking-tight text-white">Loomic</span>
      </div>

      <nav className="mt-2 flex-1 space-y-1 px-3">
        <Link to="/dashboard" className={navItemClass(isActive('/dashboard'))}>
          <span className="material-symbols-rounded">dashboard</span>
          Dashboard
        </Link>
        <Link to="/generator" className={navItemClass(isActive('/generator'))}>
          <span className="material-symbols-rounded">temp_preferences_custom</span>
          Generator
        </Link>
        <Link to="/settings" className={navItemClass(isActive('/settings'))}>
          <span className="material-symbols-rounded">settings</span>
          Settings
        </Link>
        <Link to="/billing" className={navItemClass(isActive('/billing'))}>
          <span className="material-symbols-rounded">payments</span>
          Billing
        </Link>

        <div className="h-px bg-slate-800 my-2" />

        <p className="mb-2 px-3 text-[10px] font-bold uppercase tracking-wider text-slate-500">Enterprise</p>
        <div
          title="Available on Business plan"
          className="flex cursor-not-allowed items-center gap-3 rounded-lg border border-transparent px-3 py-3 text-slate-500 opacity-50"
        >
          <span className="material-symbols-rounded">lock</span>
          <span>Enterprise</span>
        </div>

        {onDeploy && (
          <button
            onClick={() => {
              if (deployDisabled || deployBusy) return;
              void onDeploy();
            }}
            disabled={deployDisabled || deployBusy}
            className={deployButtonClass}
          >
            <span className={`material-symbols-rounded text-base ${deployBusy ? 'animate-spin' : ''}`}>
              {deployBusy ? 'sync' : 'rocket_launch'}
            </span>
            <span className="truncate">{deployBusy ? 'Deploying...' : deployLabel}</span>
          </button>
        )}
      </nav>

      <div className="mt-auto space-y-4 p-4">
        <button
          onClick={toggleTheme}
          className="flex w-full items-center justify-between rounded-2xl border border-slate-800 bg-slate-900 p-3 text-slate-400 transition-colors hover:bg-slate-800"
        >
          <span className="pl-1 text-xs font-bold uppercase tracking-wider">Theme</span>
          <div className="flex items-center gap-2">
            <span className={`material-symbols-rounded text-lg ${theme === 'light' ? 'text-amber-400' : 'text-slate-500'}`}>light_mode</span>
            <div className={`relative h-4 w-8 rounded-full transition-colors ${theme === 'dark' ? 'bg-purple-600' : 'bg-slate-600'}`}>
              <div
                className={`absolute top-0.5 h-3 w-3 rounded-full bg-white transition-transform ${theme === 'dark' ? 'left-[18px]' : 'left-0.5'}`}
              />
            </div>
            <span className={`material-symbols-rounded text-lg ${theme === 'dark' ? 'text-purple-300' : 'text-slate-500'}`}>dark_mode</span>
          </div>
        </button>

        <div
          onClick={handleLogout}
          className="group flex cursor-pointer items-center gap-3 rounded-2xl border border-slate-800 bg-slate-900 p-3 transition-all hover:bg-slate-800"
        >
          <div className="relative h-10 w-10">
            <img
              alt="User Avatar"
              className="h-10 w-10 rounded-lg bg-purple-500/20 object-cover"
              src={resolveImageWithFallback(profile?.avatar_url || `https://ui-avatars.com/api/?name=${profile?.username || user?.email}&background=random`)}
              onError={(event) => {
                event.currentTarget.src = resolveImageWithFallback(null);
              }}
            />
            <div className="absolute -bottom-1 -right-1 h-3.5 w-3.5 rounded-full border-2 border-slate-900 bg-emerald-400" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-white">{profile?.username || user?.email?.split('@')[0] || 'User'}</p>
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 transition-colors group-hover:text-red-400">Sign Out</p>
          </div>
          <span className="material-symbols-rounded text-slate-500 transition-colors group-hover:text-red-400">logout</span>
        </div>
      </div>
    </aside>
  );
}
