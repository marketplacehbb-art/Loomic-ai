import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';

export default function UpdatePassword() {
    const [password, setPassword] = useState('');
    const [confirm, setConfirm] = useState('');
    const [error, setError] = useState('');
    const [message, setMessage] = useState('');
    const [loading, setLoading] = useState(false);
    const navigate = useNavigate();

    React.useEffect(() => {
        document.documentElement.classList.add('dark');
    }, []);

    const handleUpdatePassword = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError('');
        setMessage('');

        if (password !== confirm) {
            setError('Passwords do not match');
            setLoading(false);
            return;
        }

        try {
            const { error } = await supabase.auth.updateUser({ password: password });

            if (error) throw error;

            setMessage('Password updated successfully! Redirecting...');
            setTimeout(() => navigate('/dashboard'), 2000);
        } catch (err: any) {
            setError(err.message || 'Error updating password');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="bg-background-light dark:bg-background-dark font-display text-slate-900 dark:text-white min-h-screen flex items-center justify-center overflow-hidden relative">
            <div className="noise-overlay fixed inset-0 pointer-events-none opacity-5 z-10" style={{ backgroundImage: "url('data:image/svg+xml,%3Csvg viewBox=\\'0 0 200 200\\' xmlns=\\'http://www.w3.org/2000/svg\\'%3E%3Cfilter id=\\'noiseFilter\\'%3E%3CfeTurbulence type=\\'fractalNoise\\' baseFrequency=\\'0.65\\' numOctaves=\\'3\\' stitchTiles=\\'stitch\\'/%3E%3C/filter%3E%3Crect width=\\'100%25\\' height=\\'100%25\\' filter=\\'url(%23noiseFilter)\\'/%3E%3C/svg%3E')" }} />
            <div className="ambient-blur purple-glow top-[-10%] left-[-10%] absolute" style={{ width: 600, height: 600 }} />
            <div className="ambient-blur bg-primary/20 bottom-[-10%] right-[-10%] absolute" style={{ width: 600, height: 600 }} />

            <main className="w-full max-w-md px-6 relative z-20">
                <div className="flex justify-center mb-8">
                    <div className="flex items-center gap-3">
                        <div className="w-12 h-12 bg-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-600/40">
                            <span className="material-symbols-outlined text-white text-3xl">key</span>
                        </div>
                        <span className="text-3xl font-bold tracking-tight text-white drop-shadow-sm">Loomic</span>
                    </div>
                </div>

                <div className="glass-effect rounded-xl p-8 md:p-10 border border-primary/20 relative">
                    <div className="absolute inset-0 rounded-xl pointer-events-none border border-white/5"></div>
                    <div className="text-center mb-8">
                        <h1 className="text-3xl font-bold text-white mb-2">Set New Password</h1>
                        <p className="text-slate-400 font-light">Enter your new secure password below</p>
                    </div>

                    <form className="space-y-6" onSubmit={handleUpdatePassword}>
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-slate-300 ml-1" htmlFor="password">New Password</label>
                            <div className="relative group">
                                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                                    <span className="material-symbols-outlined text-slate-500 text-xl group-focus-within:text-primary transition-colors">lock</span>
                                </div>
                                <input
                                    className="w-full bg-black/40 border border-white/10 rounded-lg py-3.5 pl-12 pr-4 text-white placeholder-slate-500 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary glow-input transition-all duration-300"
                                    id="password"
                                    name="password"
                                    placeholder="••••••••"
                                    type="password"
                                    value={password}
                                    onChange={e => setPassword(e.target.value)}
                                    required
                                />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <label className="text-sm font-medium text-slate-300 ml-1" htmlFor="confirm">Confirm Password</label>
                            <div className="relative group">
                                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                                    <span className="material-symbols-outlined text-slate-500 text-xl group-focus-within:text-primary transition-colors">lock_clock</span>
                                </div>
                                <input
                                    className="w-full bg-black/40 border border-white/10 rounded-lg py-3.5 pl-12 pr-4 text-white placeholder-slate-500 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary glow-input transition-all duration-300"
                                    id="confirm"
                                    name="confirm"
                                    placeholder="••••••••"
                                    type="password"
                                    value={confirm}
                                    onChange={e => setConfirm(e.target.value)}
                                    required
                                />
                            </div>
                        </div>

                        {error && <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm text-center">{error}</div>}
                        {message && <div className="p-3 rounded-lg bg-green-500/10 border border-green-500/20 text-green-400 text-sm text-center">{message}</div>}

                        <button
                            className={`w-full bg-primary hover:bg-primary/90 text-white font-semibold py-4 rounded-lg shadow-lg shadow-primary/30 transition-all duration-300 active:scale-[0.98] flex items-center justify-center gap-2 mt-2 ${loading ? 'opacity-70 cursor-not-allowed' : ''}`}
                            type="submit"
                            disabled={loading}
                        >
                            <span>{loading ? 'Updating...' : 'Update Password'}</span>
                            <span className="material-symbols-outlined text-lg">check_circle</span>
                        </button>
                    </form>
                </div>
            </main>

            <style>{`
        .glass-effect {
          background: rgba(25, 16, 34, 0.6);
          backdrop-filter: blur(24px);
          -webkit-backdrop-filter: blur(24px);
          border: 1px solid rgba(127, 19, 236, 0.2);
          box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.8);
        }
        .glow-input:focus {
          box-shadow: 0 0 15px rgba(127, 19, 236, 0.3);
        }
        .ambient-blur {
          position: absolute;
          width: 600px;
          height: 600px;
          border-radius: 50%;
          filter: blur(120px);
          z-index: 0;
          opacity: 0.4;
        }
        .purple-glow {
          background: radial-gradient(circle, rgba(127, 19, 236, 0.4) 0%, rgba(127, 19, 236, 0) 70%);
        }
        .noise-overlay {
          pointer-events: none;
          opacity: 0.03;
          z-index: 10;
        }
      `}</style>
        </div>
    );
}
