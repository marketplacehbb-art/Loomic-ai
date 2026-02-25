import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
// import UsageIndicator from './UsageIndicator'; <--- Removed

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


    const isActive = (path: string) => location.pathname === path;

    const handleLogout = async () => {
        await signOut();
        navigate('/login');
    };

    return (
        <aside className="w-64 border-r border-slate-200 dark:border-border-dark flex flex-col fixed inset-y-0 left-0 bg-background-light dark:bg-background-dark z-50 transition-colors duration-300">
            {/* Logo */}
            <div className="p-6 flex items-center gap-3">
                <div className="w-10 h-10 bg-primary rounded-xl flex items-center justify-center shadow-lg shadow-primary/20">
                    <span className="material-symbols-rounded text-white">auto_awesome</span>
                </div>
                <span className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">Loomic</span>
            </div>

            {/* Navigation */}
            <nav className="mt-4 flex-1 space-y-1 px-3">
                <Link
                    to="/dashboard"
                    className={`flex items-center gap-3 px-3 py-3 font-medium transition-colors ${isActive('/dashboard')
                        ? 'bg-gradient-to-r from-primary/10 to-transparent border-l-4 border-primary text-primary'
                        : 'text-slate-500 dark:text-slate-400 hover:text-primary dark:hover:text-primary border-l-4 border-transparent'
                        }`}
                >
                    <span className="material-symbols-rounded">dashboard</span>
                    Dashboard
                </Link>
                <Link
                    to="/generator"
                    className={`flex items-center gap-3 px-3 py-3 font-medium transition-colors ${isActive('/generator')
                        ? 'bg-gradient-to-r from-primary/10 to-transparent border-l-4 border-primary text-primary'
                        : 'text-slate-500 dark:text-slate-400 hover:text-primary dark:hover:text-primary border-l-4 border-transparent'
                        }`}
                >
                    <span className="material-symbols-rounded">temp_preferences_custom</span>
                    Generator
                </Link>
                <Link
                    to="/settings"
                    className={`flex items-center gap-3 px-3 py-3 font-medium transition-colors ${isActive('/settings')
                        ? 'bg-gradient-to-r from-primary/10 to-transparent border-l-4 border-primary text-primary'
                        : 'text-slate-500 dark:text-slate-400 hover:text-primary dark:hover:text-primary border-l-4 border-transparent'
                        }`}
                >
                    <span className="material-symbols-rounded">settings</span>
                    Settings
                </Link>
                <div className="pt-4 mt-2 mb-2 border-t border-slate-200 dark:border-white/5">
                    <p className="px-3 text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-2">Enterprise</p>
                    <Link
                        to="/database-designer"
                        className={`flex items-center gap-3 px-3 py-3 font-medium transition-colors ${isActive('/database-designer')
                            ? 'bg-gradient-to-r from-primary/10 to-transparent border-l-4 border-primary text-primary'
                            : 'text-slate-500 dark:text-slate-400 hover:text-primary dark:hover:text-primary border-l-4 border-transparent'
                            }`}
                    >
                        <span className="material-symbols-rounded">schema</span>
                        DB Designer
                    </Link>
                    <Link
                        to="/source-control"
                        className={`flex items-center gap-3 px-3 py-3 font-medium transition-colors ${isActive('/source-control')
                            ? 'bg-gradient-to-r from-primary/10 to-transparent border-l-4 border-primary text-primary'
                            : 'text-slate-500 dark:text-slate-400 hover:text-primary dark:hover:text-primary border-l-4 border-transparent'
                            }`}
                    >
                        <span className="material-symbols-rounded">source</span>
                        Source Control
                    </Link>
                    {onDeploy && (
                        <button
                            onClick={() => {
                                if (deployDisabled || deployBusy) return;
                                void onDeploy();
                            }}
                            disabled={deployDisabled || deployBusy}
                            className="mt-2 w-full flex items-center gap-3 px-3 py-2.5 rounded-lg bg-primary/90 hover:bg-primary text-white text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                            <span className={`material-symbols-rounded text-base ${deployBusy ? 'animate-spin' : ''}`}>
                                {deployBusy ? 'sync' : 'rocket_launch'}
                            </span>
                            <span className="truncate">{deployBusy ? 'Deploying...' : deployLabel}</span>
                        </button>
                    )}
                </div>
            </nav>

            {/* User & Theme Controls */}
            <div className="p-4 mt-auto space-y-4">
                {/* Theme Toggle Button */}
                <button
                    onClick={toggleTheme}
                    className="w-full flex items-center justify-between p-3 rounded-2xl bg-slate-100 dark:bg-card-dark border border-slate-200 dark:border-border-dark text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors"
                >
                    <span className="text-xs font-bold uppercase tracking-wider pl-1">Theme</span>
                    <div className="flex items-center gap-2">
                        <span className={`material-symbols-rounded text-lg ${theme === 'light' ? 'text-amber-500' : 'text-slate-400'}`}>light_mode</span>
                        <div className={`w-8 h-4 rounded-full relative transition-colors ${theme === 'dark' ? 'bg-primary' : 'bg-slate-300'}`}>
                            <div className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform ${theme === 'dark' ? 'left-4.5' : 'left-0.5'}`} style={{ left: theme === 'dark' ? '18px' : '2px' }}></div>
                        </div>
                        <span className={`material-symbols-rounded text-lg ${theme === 'dark' ? 'text-primary' : 'text-slate-400'}`}>dark_mode</span>
                    </div>
                </button>

                {/* User Profile / Logout */}
                <div
                    onClick={handleLogout}
                    className="bg-slate-100 dark:bg-card-dark border border-slate-200 dark:border-border-dark p-3 rounded-2xl flex items-center gap-3 cursor-pointer hover:bg-slate-200 dark:hover:bg-slate-800 transition-all group"
                >
                    <div className="relative w-10 h-10">
                        <img
                            alt="User Avatar"
                            className="w-10 h-10 rounded-lg bg-primary/20 object-cover"
                            src={profile?.avatar_url || `https://ui-avatars.com/api/?name=${profile?.username || user?.email}&background=random`}
                        />
                        <div className="absolute -bottom-1 -right-1 w-3.5 h-3.5 bg-green-500 border-2 border-slate-100 dark:border-card-dark rounded-full"></div>
                    </div>
                    <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold truncate text-slate-900 dark:text-white">{profile?.username || user?.email?.split('@')[0] || 'User'}</p>
                        <p className="text-[10px] text-slate-500 dark:text-slate-400 uppercase tracking-wider font-bold group-hover:text-red-500 transition-colors">Sign Out</p>
                    </div>
                    <span className="material-symbols-rounded text-slate-400 group-hover:text-red-500 transition-colors">logout</span>
                </div>
            </div>
        </aside>
    );
}
