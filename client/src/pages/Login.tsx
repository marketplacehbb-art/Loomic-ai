import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showMFA, setShowMFA] = useState(false);
  const [mfaCode, setMfaCode] = useState('');
  const [factorId, setFactorId] = useState<string | null>(null);

  const navigate = useNavigate();
  const { session, loading: authLoading } = useAuth();


  // Auto-redirect if already logged in (only if we are not in the middle of MFA)
  // We need to be careful: if we just logged in (aal1), session exists.
  // But we want to block until aal2 if MFA is enabled.
  // For simplicity, we'll redirect ONLY if we are satisfied.
  // But `useAuth` might give us a session immediately after password login.
  // We will rely on our local state `showMFA` to prevent redirect if we detected MFA factors.

  useEffect(() => {
    const checkSession = async () => {
      // If we are loading auth, or already showing MFA, do nothing
      if (authLoading || !session || showMFA) return;

      // Robust Check: Before redirecting, check AAL and Factors
      try {
        const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();

        // If already AAL2 (MFA verified), good to go
        if (aal && aal.currentLevel === 'aal2') {
          navigate('/dashboard');
          return;
        }

        // If AAL1, check if we NEED MFA
        const { data: factors } = await supabase.auth.mfa.listFactors();
        const verifiedFactor = factors?.totp.find(f => f.status === 'verified');

        if (verifiedFactor) {
          // User has MFA enabled but is only AAL1 -> Show MFA screen
          setFactorId(verifiedFactor.id);
          setShowMFA(true);
        } else {
          // No MFA enabled -> Dashboard
          navigate('/dashboard');
        }
      } catch (err) {
        console.error('Error checking MFA status:', err);
        // Fallback: stay on login or redirect? Safe to stay.
      }
    };

    checkSession();
  }, [session, authLoading, navigate, showMFA]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const { data, error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (authError) throw authError;

      // Check for MFA factors
      if (data.user) {
        const { data: factors, error: factorsError } = await supabase.auth.mfa.listFactors();
        if (factorsError) throw factorsError;

        const verifiedFactor = factors?.totp.find(f => f.status === 'verified');

        if (verifiedFactor) {
          // User has MFA enabled!
          setFactorId(verifiedFactor.id);
          setShowMFA(true);
          setLoading(false);
          return; // Stop here, don't redirect yet
        }
      }

      if (data.session) {
        navigate('/dashboard');
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred during sign in');
      setLoading(false);
    }
  };

  const handleMFAVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!factorId) return;
    setLoading(true);
    setError('');

    try {
      const { error } = await supabase.auth.mfa.challengeAndVerify({
        factorId,
        code: mfaCode
      });

      if (error) throw error;

      // Success!
      navigate('/dashboard');

    } catch (err: any) {
      setError(err.message || 'Invalid 2FA code');
      setLoading(false);
    }
  };

  return (
    <div className="bg-background-light dark:bg-background-dark font-display text-slate-900 dark:text-white min-h-screen flex items-center justify-center overflow-hidden relative">
      {/* Noise Overlay */}
      <div className="noise-overlay fixed inset-0 pointer-events-none opacity-5 z-10" style={{ backgroundImage: "url('data:image/svg+xml,%3Csvg viewBox=\\'0 0 200 200\\' xmlns=\\'http://www.w3.org/2000/svg\\'%3E%3Cfilter id=\\'noiseFilter\\'%3E%3CfeTurbulence type=\\'fractalNoise\\' baseFrequency=\\'0.65\\' numOctaves=\\'3\\' stitchTiles=\\'stitch\\'/%3E%3C/filter%3E%3Crect width=\\'100%25\\' height=\\'100%25\\' filter=\\'url(%23noiseFilter)\\'/%3E%3C/svg%3E')" }} />
      {/* Ambient Blur Effects */}
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

          {!showMFA ? (
            <>
              <div className="text-center mb-8">
                <h1 className="text-3xl font-bold text-white mb-2">Welcome Back</h1>
                <p className="text-slate-400 font-light">Enter your credentials to access your dashboard</p>
              </div>
              <form className="space-y-6" onSubmit={handleLogin}>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-300 ml-1" htmlFor="email">Email Address</label>
                  <div className="relative group">
                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                      <span className="material-symbols-outlined text-slate-500 text-xl group-focus-within:text-primary transition-colors">mail</span>
                    </div>
                    <input className="w-full bg-black/40 border border-white/10 rounded-lg py-3.5 pl-12 pr-4 text-white placeholder-slate-500 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary glow-input transition-all duration-300" id="email" name="email" placeholder="name@company.com" type="email" value={email} onChange={e => setEmail(e.target.value)} required />
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between items-center ml-1">
                    <label className="text-sm font-medium text-slate-300" htmlFor="password">Password</label>
                    <Link className="text-xs text-primary hover:text-primary/80 transition-colors font-medium" to="/forgot-password">Forgot password?</Link>
                  </div>
                  <div className="relative group">
                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                      <span className="material-symbols-outlined text-slate-500 text-xl group-focus-within:text-primary transition-colors">lock</span>
                    </div>
                    <input className="w-full bg-black/40 border border-white/10 rounded-lg py-3.5 pl-12 pr-4 text-white placeholder-slate-500 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary glow-input transition-all duration-300" id="password" name="password" placeholder="••••••••" type="password" value={password} onChange={e => setPassword(e.target.value)} required />
                  </div>
                </div>
                <div className="flex items-center space-x-2 ml-1">
                  <input className="w-4 h-4 rounded border-white/10 bg-black/40 text-primary focus:ring-primary focus:ring-offset-background-dark" id="remember" type="checkbox" />
                  <label className="text-sm text-slate-400 cursor-pointer select-none" htmlFor="remember">Keep me signed in</label>
                </div>
                {error && <div className="text-red-400 text-center">{error}</div>}
                <button
                  className={`w-full bg-primary hover:bg-primary/90 text-white font-semibold py-4 rounded-lg shadow-lg shadow-primary/30 transition-all duration-300 active:scale-[0.98] flex items-center justify-center gap-2 mt-2 ${loading ? 'opacity-70 cursor-not-allowed' : ''}`}
                  type="submit"
                  disabled={loading}
                >
                  <span>{loading ? 'Signing In...' : 'Sign In'}</span>
                  <span className="material-symbols-outlined text-lg">arrow_forward</span>
                </button>
              </form>
            </>
          ) : (
            <>
              <div className="text-center mb-8 animate-in fade-in slide-in-from-right-4">
                <div className="w-16 h-16 bg-primary/20 rounded-full flex items-center justify-center mx-auto mb-4 border border-primary/30">
                  <span className="material-symbols-outlined text-white text-3xl">phonelink_lock</span>
                </div>
                <h1 className="text-2xl font-bold text-white mb-2">Two-Factor Authentication</h1>
                <p className="text-slate-400 font-light text-sm">Enter the 6-digit code from your authenticator app</p>
              </div>
              <form className="space-y-6 animate-in fade-in slide-in-from-right-4" onSubmit={handleMFAVerify}>
                <div className="space-y-2">
                  <div className="relative group">
                    <input
                      className="w-full bg-black/40 border border-white/10 rounded-lg py-4 text-center text-white placeholder-slate-600 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary glow-input transition-all duration-300 text-2xl font-mono tracking-[0.5em]"
                      placeholder="000000"
                      type="text"
                      maxLength={6}
                      value={mfaCode}
                      onChange={e => setMfaCode(e.target.value.replace(/\D/g, ''))}
                      required
                      autoFocus
                    />
                  </div>
                </div>

                {error && <div className="text-red-400 text-center text-sm">{error}</div>}

                <button
                  className={`w-full bg-primary hover:bg-primary/90 text-white font-semibold py-4 rounded-lg shadow-lg shadow-primary/30 transition-all duration-300 active:scale-[0.98] flex items-center justify-center gap-2 mt-2 ${loading ? 'opacity-70 cursor-not-allowed' : ''}`}
                  type="submit"
                  disabled={loading}
                >
                  <span>{loading ? 'Verifying...' : 'Verify'}</span>
                  <span className="material-symbols-outlined text-lg">check_circle</span>
                </button>

                <button
                  type="button"
                  onClick={() => { setShowMFA(false); setMfaCode(''); setError(''); }}
                  className="w-full text-sm text-slate-500 hover:text-white transition-colors py-2"
                >
                  Back to Login
                </button>
              </form>
            </>
          )}

        </div>
        {!showMFA && (
          <p className="text-center mt-8 text-slate-400">
            Don't have an account?{' '}
            <Link className="text-primary font-bold hover:underline decoration-2 underline-offset-4 transition-all" to="/register">Create Account</Link>
          </p>
        )}
      </main >
      {/* Security & Version Info */}
      < div className="fixed bottom-8 right-8 hidden lg:block z-30" >
        <div className="flex items-center gap-4">
          <div className="h-px w-12 bg-primary/20"></div>
          <div className="text-[10px] tracking-widest text-slate-500 uppercase">
            Loomic OS v4.2.0
          </div>
        </div>
      </div >
      {/* Custom Styles for glass, blur, noise, etc. */}
      < style > {`
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
      `}</style >
    </div >
  );
}
