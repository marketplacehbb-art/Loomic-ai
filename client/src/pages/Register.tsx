import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

export default function Register() {
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const navigate = useNavigate();
  const { session, loading: authLoading } = useAuth();



  // Auto-redirect if already logged in (Redirect to Generator as requested)
  React.useEffect(() => {
    if (!authLoading && session) {
      navigate('/generator');
    }
  }, [session, authLoading, navigate]);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    if (password !== confirm) {
      setError('Passwords do not match!');
      setLoading(false);
      return;
    }

    try {
      // 1. Auth Sign Up
      const { data, error: authError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            username: username,
            full_name: username
          },
          emailRedirectTo: `${window.location.origin}/generator`
        }
      });

      if (authError) throw authError;

      if (data.user) {
        if (data.session) {
          // Auto-confirmed (or "Confirm Email" disabled)
          navigate('/generator');
        } else {
          // Needs confirmation
          setSuccess(true);
        }
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred during registration');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-background-light dark:bg-background-dark font-display text-slate-900 dark:text-white min-h-screen flex items-center justify-center overflow-hidden relative">
      <div className="noise-overlay fixed inset-0 pointer-events-none opacity-5 z-10" style={{ backgroundImage: "url('data:image/svg+xml,%3Csvg viewBox=\\'0 0 200 200\\' xmlns=\\'http://www.w3.org/2000/svg\\'%3E%3Cfilter id=\\'noiseFilter\\'%3E%3CfeTurbulence type=\\'fractalNoise\\' baseFrequency=\\'0.65\\' numOctaves=\\'3\\' stitchTiles=\\'stitch\\'/%3E%3C/filter%3E%3Crect width=\\'100%25\\' height=\\'100%25\\' filter=\\'url(%23noiseFilter)\\'/%3E%3C/svg%3E')" }} />
      <div className="ambient-blur purple-glow top-[-10%] left-[-10%] absolute" style={{ width: 600, height: 600 }} />
      <div className="ambient-blur purple-glow bottom-[-10%] right-[-10%] absolute" style={{ width: 600, height: 600 }} />
      <div className="ambient-blur bg-primary/20 top-[20%] right-[15%] absolute" style={{ width: 600, height: 600 }} />

      <main className="w-full max-w-md px-6 relative z-20">
        <div className="flex justify-center mb-8">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-600/40">
              <span className="material-symbols-outlined text-white text-3xl">rocket_launch</span>
            </div>
            <span className="text-3xl font-bold tracking-tight text-white drop-shadow-sm">Loomic</span>
          </div>
        </div>
        <div className="glass-effect rounded-xl p-8 md:p-10 border border-primary/20 relative">
          <div className="absolute inset-0 rounded-xl pointer-events-none border border-white/5"></div>
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-white mb-2">Create Account</h1>
            <p className="text-slate-400 font-light">Sign up to get started with Loomic</p>
          </div>

          {success ? (
            <div className="text-center py-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="w-16 h-16 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-4 border border-green-500/30 shadow-[0_0_15px_rgba(34,197,94,0.3)]">
                <span className="material-symbols-outlined text-green-400 text-3xl">mark_email_read</span>
              </div>
              <h3 className="text-xl font-bold text-white mb-2">Check your inbox!</h3>
              <p className="text-slate-300 mb-6">
                We've sent a confirmation link to <br /> <span className="text-primary font-medium">{email}</span>.
              </p>
              <div className="p-4 bg-slate-800/50 rounded-lg border border-white/5 mb-6 text-sm text-slate-400">
                <p className="mb-2"><strong>Tip:</strong> If you don't receive an email:</p>
                <ul className="list-disc text-left pl-6 space-y-1">
                  <li>Check your spam folder</li>
                  <li>Wait a few minutes</li>
                  <li>Your project might have "Confirm Email" disabled (try logging in!)</li>
                </ul>
              </div>
              <Link
                to="/login"
                className="w-full bg-slate-100 hover:bg-white text-slate-900 font-semibold py-3.5 rounded-lg transition-all flex items-center justify-center gap-2"
              >
                <span>Back to Login</span>
                <span className="material-symbols-outlined text-lg">arrow_forward</span>
              </Link>
            </div>
          ) : (
            <form className="space-y-4" onSubmit={handleRegister}>
              <div className="space-y-1">
                <label className="text-sm font-medium text-slate-300 ml-1" htmlFor="username">Username</label>
                <div className="relative group">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                    <span className="material-symbols-outlined text-slate-500 text-xl group-focus-within:text-primary transition-colors">person</span>
                  </div>
                  <input className="w-full bg-black/40 border border-white/10 rounded-lg py-3 pl-12 pr-4 text-white placeholder-slate-500 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary glow-input transition-all duration-300" id="username" name="username" placeholder="your_name" type="text" value={username} onChange={e => setUsername(e.target.value)} required />
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium text-slate-300 ml-1" htmlFor="email">Email Address</label>
                <div className="relative group">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                    <span className="material-symbols-outlined text-slate-500 text-xl group-focus-within:text-primary transition-colors">mail</span>
                  </div>
                  <input className="w-full bg-black/40 border border-white/10 rounded-lg py-3 pl-12 pr-4 text-white placeholder-slate-500 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary glow-input transition-all duration-300" id="email" name="email" placeholder="name@company.com" type="email" value={email} onChange={e => setEmail(e.target.value)} required />
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium text-slate-300 ml-1" htmlFor="password">Password</label>
                <div className="relative group">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                    <span className="material-symbols-outlined text-slate-500 text-xl group-focus-within:text-primary transition-colors">lock</span>
                  </div>
                  <input className="w-full bg-black/40 border border-white/10 rounded-lg py-3 pl-12 pr-4 text-white placeholder-slate-500 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary glow-input transition-all duration-300" id="password" name="password" placeholder="••••••••" type="password" value={password} onChange={e => setPassword(e.target.value)} required />
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium text-slate-300 ml-1" htmlFor="confirm">Confirm Password</label>
                <div className="relative group">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                    <span className="material-symbols-outlined text-slate-500 text-xl group-focus-within:text-primary transition-colors">lock</span>
                  </div>
                  <input className="w-full bg-black/40 border border-white/10 rounded-lg py-3 pl-12 pr-4 text-white placeholder-slate-500 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary glow-input transition-all duration-300" id="confirm" name="confirm" placeholder="••••••••" type="password" value={confirm} onChange={e => setConfirm(e.target.value)} required />
                </div>
              </div>
              {error && <div className="text-red-400 text-center text-sm">{error}</div>}
              <button
                className={`w-full bg-primary hover:bg-primary/90 text-white font-semibold py-3.5 rounded-lg shadow-lg shadow-primary/30 transition-all duration-300 active:scale-[0.98] flex items-center justify-center gap-2 mt-2 ${loading ? 'opacity-70 cursor-not-allowed' : ''}`}
                type="submit"
                disabled={loading}
              >
                <span>{loading ? 'Creating Account...' : 'Sign Up'}</span>
                <span className="material-symbols-outlined text-lg">arrow_forward</span>
              </button>
            </form>
          )}
        </div>
        <p className="text-center mt-6 text-slate-400">
          Already have an account?{' '}
          <Link className="text-primary font-bold hover:underline decoration-2 underline-offset-4 transition-all" to="/login">Sign In</Link>
        </p>
      </main >
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
    </div >
  );
}
