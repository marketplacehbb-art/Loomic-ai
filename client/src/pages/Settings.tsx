import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import Sidebar from '../components/Sidebar';
import { api, UserProfile } from '../lib/api';
import { supabase } from '../lib/supabase';

export default function Settings() {
    const { user, profile, loading: authLoading, refreshProfile } = useAuth();
    const { theme, setTheme } = useTheme();
    const [activeTab, setActiveTab] = useState<'profile' | 'preferences'>('profile');
    const [loading, setLoading] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);
    const fileInputRef = React.useRef<HTMLInputElement>(null);

    const [formData, setFormData] = useState<Partial<UserProfile>>({
        username: '',
        full_name: '',
        bio: '',
        avatar_url: '',
        theme: 'dark'
    });

    useEffect(() => {
        if (profile) {
            setFormData({
                username: profile.username || '',
                full_name: profile.full_name || '',
                bio: profile.bio || '',
                avatar_url: profile.avatar_url || '',
                theme: profile.theme || 'dark'
            });
        }
    }, [profile]);

    const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
        if (!event.target.files || event.target.files.length === 0 || !user) {
            return;
        }

        const file = event.target.files[0];
        setUploading(true);
        setMessage(null);

        try {
            const publicUrl = await api.uploadAvatar(user.id, file);
            setFormData(prev => ({ ...prev, avatar_url: publicUrl }));
            // Also update profile immediately if we want avatar to stick even without "Save Changes"
            // But usually avatar upload is separate. Let's just update the form data for now
            // and maybe auto-save the profile? 
            // The prompt says "save changes" is needed for avatar message, but user might expect it to persist.
            // Let's persist it immediately as it's a direct action.
            await api.updateUserProfile(user.id, { avatar_url: publicUrl });
            await refreshProfile();

            setMessage({ type: 'success', text: 'Avatar uploaded and profile updated!' });
        } catch (error: any) {
            setMessage({ type: 'error', text: error.message || 'Error uploading avatar' });
        } finally {
            setUploading(false);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user) return;

        setLoading(true);
        setMessage(null);

        try {
            await api.updateUserProfile(user.id, formData);
            await refreshProfile(); // Refresh global state
            setMessage({ type: 'success', text: 'Profile updated successfully!' });

            // Force theme update if changed
            if (formData.theme === 'dark') {
                document.documentElement.classList.add('dark');
            } else {
                document.documentElement.classList.remove('dark');
            }

        } catch (error: any) {
            setMessage({ type: 'error', text: error.message || 'Failed to update profile' });
        } finally {
            setLoading(false);
        }
    };

    // --- Account Settings: Password Change ---
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');

    const handlePasswordUpdate = async (e: React.FormEvent) => {
        e.preventDefault();
        if (newPassword !== confirmPassword) {
            setMessage({ type: 'error', text: 'New passwords do not match' });
            return;
        }

        if (!user || !user.email) {
            setMessage({ type: 'error', text: 'User session invalid' });
            return;
        }

        setLoading(true);
        setMessage(null);

        try {
            // Verify current password by signing in
            const { error: signInError } = await supabase.auth.signInWithPassword({
                email: user.email,
                password: currentPassword
            });

            if (signInError) {
                // Determine if it's a wrong password error
                throw new Error('Current password is incorrect');
            }

            // If sign-in success, update password
            const { error } = await supabase.auth.updateUser({ password: newPassword });
            if (error) throw error;

            setMessage({ type: 'success', text: 'Password updated successfully' });
            setCurrentPassword('');
            setNewPassword('');
            setConfirmPassword('');
        } catch (err: any) {
            setMessage({ type: 'error', text: err.message || 'Failed to update password' });
        } finally {
            setLoading(false);
        }
    };

    // --- Account Settings: 2FA (TOTP) ---
    const [is2FAEnabled, setIs2FAEnabled] = useState(false);
    const [qrCodeUrl, setQrCodeUrl] = useState<string | null>(null);
    const [verifyCode, setVerifyCode] = useState('');
    const [factorId, setFactorId] = useState<string | null>(null);

    // Check 2FA status on mount
    useEffect(() => {
        check2FAStatus();
    }, []);

    const check2FAStatus = async () => {
        try {
            const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
            if (error) throw error;
            if (data) {
                // If distinct factors exist, it's enabled. Simple check.
                // For a more robust check we should list factors, but this is a good proxy for "has MFA set up"
                // Actually need to list factors to be sure if TOTP is enrolled
                const { data: factors, error: factorsError } = await supabase.auth.mfa.listFactors();
                if (factorsError) throw factorsError;
                const totpFactor = factors.totp.find(f => f.status === 'verified');
                setIs2FAEnabled(!!totpFactor);
                if (totpFactor) setFactorId(totpFactor.id);
            }
        } catch (err) {
            console.error('Error checking 2FA status:', err);
        }
    };

    const enable2FA = async () => {
        setLoading(true);
        setMessage(null);
        try {
            const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp' });
            if (error) throw error;

            setFactorId(data.id);

            // Generate QR Code
            try {
                // Dynamic import to avoid SSR issues if any, though client-side safe
                const QRCode = await import('qrcode');
                const url = await QRCode.toDataURL(data.totp.uri);
                setQrCodeUrl(url);
            } catch (qrError) {
                console.error('QR Code generation failed:', qrError);
                setMessage({ type: 'error', text: 'Failed to generate QR code. Please refresh and try again.' });
            }

        } catch (err: any) {
            setMessage({ type: 'error', text: err.message || 'Failed to initialize 2FA' });
        } finally {
            setLoading(false);
        }
    };

    const verifyAndEnable2FA = async () => {
        if (!factorId) return;
        setLoading(true);
        setMessage(null);

        try {
            const { error } = await supabase.auth.mfa.challengeAndVerify({
                factorId,
                code: verifyCode
            });

            if (error) throw error;

            setIs2FAEnabled(true);
            setQrCodeUrl(null);
            setVerifyCode('');
            setMessage({ type: 'success', text: '2FA enabled successfully!' });
        } catch (err: any) {
            setMessage({ type: 'error', text: err.message || 'Invalid code. Please try again.' });
        } finally {
            setLoading(false);
        }
    };

    const disable2FA = async () => {
        // Implementation note: Unenrolling requires checking factors first
        // For simplicity/security, usually requires re-authentication, but we'll try direct unenroll first
        if (!confirm('Are you sure you want to disable 2FA? This will make your account less secure.')) return;

        setLoading(true);
        try {
            // We need to fetch the Verified Factor ID again if not stored
            const { data: factors } = await supabase.auth.mfa.listFactors();
            const totpFactor = factors?.totp.find(f => f.status === 'verified');

            if (!totpFactor) {
                throw new Error('No active 2FA found');
            }

            const { error } = await supabase.auth.mfa.unenroll({ factorId: totpFactor.id });
            if (error) throw error;

            setIs2FAEnabled(false);
            setFactorId(null);
            setMessage({ type: 'success', text: '2FA disabled.' });

        } catch (err: any) {
            setMessage({ type: 'error', text: err.message || 'Failed to disable 2FA' });
        } finally {
            setLoading(false);
        }
    };

    if (authLoading) return null;

    return (
        <div className="bg-background-light dark:bg-background-dark text-slate-900 dark:text-slate-100 min-h-screen flex font-display transition-colors duration-300">
            {/* Sidebar (Duplicate of Dashboard for now - Componentize later) */}
            {/* Sidebar */}
            <Sidebar />

            {/* Main Content */}
            <main className="flex-1 ml-64 p-8">
                <header className="mb-8">
                    <h1 className="text-3xl font-bold mb-2">Settings</h1>
                    <p className="text-slate-500 dark:text-slate-400">Manage your profile and account preferences</p>
                </header>

                <div className="bg-white dark:bg-card-dark border border-slate-200 dark:border-border-dark rounded-3xl overflow-hidden max-w-4xl">
                    <div className="flex border-b border-slate-200 dark:border-border-dark">
                        <button
                            onClick={() => setActiveTab('profile')}
                            className={`px-8 py-4 font-medium text-sm transition-colors relative ${activeTab === 'profile'
                                ? 'text-primary'
                                : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                                }`}
                        >
                            Profile
                            {activeTab === 'profile' && (
                                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary"></div>
                            )}
                        </button>
                        <button
                            onClick={() => setActiveTab('preferences')}
                            className={`px-8 py-4 font-medium text-sm transition-colors relative ${activeTab === 'preferences'
                                ? 'text-primary'
                                : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                                }`}
                        >
                            Account
                            {activeTab === 'preferences' && (
                                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary"></div>
                            )}
                        </button>
                    </div>

                    <div className="p-8">
                        {activeTab === 'profile' ? (
                            <form onSubmit={handleSubmit} className="space-y-6 max-w-xl">
                                <div className="flex items-center gap-6 mb-8">
                                    <div className="relative">
                                        <img
                                            alt="Avatar"
                                            className="w-24 h-24 rounded-full bg-slate-100 dark:bg-slate-800 object-cover border-4 border-slate-50 dark:border-[#1e1e1e]"
                                            src={formData.avatar_url || `https://ui-avatars.com/api/?name=${user?.email}&background=random`}
                                        />
                                        <button
                                            type="button"
                                            onClick={() => fileInputRef.current?.click()}
                                            disabled={uploading}
                                            className="absolute bottom-0 right-0 w-8 h-8 bg-primary text-white rounded-full flex items-center justify-center border-2 border-white dark:border-[#1e1e1e] hover:bg-primary/90 transition-colors disabled:opacity-50"
                                        >
                                            <span className="material-symbols-rounded text-sm">{uploading ? 'sync' : 'edit'}</span>
                                        </button>
                                        <input
                                            type="file"
                                            ref={fileInputRef}
                                            onChange={handleFileChange}
                                            className="hidden"
                                            accept="image/*"
                                        />
                                    </div>
                                    <div>
                                        <h3 className="text-lg font-bold">{user?.email}</h3>
                                        <p className="text-sm text-slate-500 dark:text-slate-400">Member since {new Date(user?.created_at || Date.now()).toLocaleDateString()}</p>
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-6">
                                    <div className="space-y-2">
                                        <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Username</label>
                                        <input
                                            type="text"
                                            className="w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-white/10 rounded-xl px-4 py-2.5 outline-none focus:ring-2 focus:ring-primary/50 transition-all text-sm"
                                            value={formData.username || ''}
                                            onChange={e => setFormData({ ...formData, username: e.target.value })}
                                            placeholder="@username"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Full Name</label>
                                        <input
                                            type="text"
                                            className="w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-white/10 rounded-xl px-4 py-2.5 outline-none focus:ring-2 focus:ring-primary/50 transition-all text-sm"
                                            value={formData.full_name || ''}
                                            onChange={e => setFormData({ ...formData, full_name: e.target.value })}
                                            placeholder="John Doe"
                                        />
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Bio</label>
                                    <textarea
                                        rows={4}
                                        className="w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-white/10 rounded-xl px-4 py-2.5 outline-none focus:ring-2 focus:ring-primary/50 transition-all text-sm resize-none"
                                        value={formData.bio || ''}
                                        onChange={e => setFormData({ ...formData, bio: e.target.value })}
                                        placeholder="Tell us a bit about yourself..."
                                    />
                                </div>

                                <div className="space-y-2">
                                    <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Theme Preference</label>
                                    <div className="flex items-center gap-4">
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setTheme('light');
                                                setFormData({ ...formData, theme: 'light' });
                                            }}
                                            className={`flex-1 p-4 rounded-xl border flex items-center gap-3 transition-all ${theme === 'light' ? 'border-primary bg-primary/5 text-primary' : 'border-slate-200 dark:border-white/10 hover:border-slate-300'}`}
                                        >
                                            <span className="material-symbols-rounded">light_mode</span>
                                            <span className="font-medium">Light</span>
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setTheme('dark');
                                                setFormData({ ...formData, theme: 'dark' });
                                            }}
                                            className={`flex-1 p-4 rounded-xl border flex items-center gap-3 transition-all ${theme === 'dark' ? 'border-primary bg-primary/5 text-primary' : 'border-slate-200 dark:border-white/10 hover:border-slate-300'}`}
                                        >
                                            <span className="material-symbols-rounded">dark_mode</span>
                                            <span className="font-medium">Dark</span>
                                        </button>
                                    </div>
                                </div>

                                {message && (
                                    <div className={`p-4 rounded-xl border text-sm flex items-center gap-2 ${message.type === 'success' ? 'bg-green-500/10 border-green-500/20 text-green-500' : 'bg-red-500/10 border-red-500/20 text-red-500'}`}>
                                        <span className="material-symbols-rounded text-lg">{message.type === 'success' ? 'check_circle' : 'error'}</span>
                                        {message.text}
                                    </div>
                                )}

                                <div className="pt-4">
                                    <button
                                        type="submit"
                                        disabled={loading}
                                        className="bg-primary hover:bg-primary/90 text-white px-8 py-3 rounded-xl font-semibold transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                                    >
                                        {loading && <span className="material-symbols-rounded animate-spin text-lg">sync</span>}
                                        Save Changes
                                    </button>
                                </div>
                            </form>
                        ) : (
                            <div className="space-y-10 max-w-2xl">
                                {/* Change Password Section */}
                                <section>
                                    <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
                                        <span className="material-symbols-rounded text-primary">lock</span>
                                        Change Password
                                    </h3>
                                    <form onSubmit={handlePasswordUpdate} className="space-y-4 bg-slate-50 dark:bg-slate-900/50 p-6 rounded-2xl border border-slate-200 dark:border-white/5">
                                        <div className="space-y-2">
                                            <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Current Password</label>
                                            <div className="relative">
                                                <input
                                                    type="password"
                                                    className="w-full bg-white dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-xl px-4 py-2.5 outline-none focus:ring-2 focus:ring-primary/50 transition-all text-sm"
                                                    value={currentPassword}
                                                    onChange={e => setCurrentPassword(e.target.value)}
                                                    placeholder="••••••••"
                                                    required
                                                />
                                            </div>
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-sm font-medium text-slate-700 dark:text-slate-300">New Password</label>
                                            <div className="relative">
                                                <input
                                                    type="password"
                                                    className="w-full bg-white dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-xl px-4 py-2.5 outline-none focus:ring-2 focus:ring-primary/50 transition-all text-sm"
                                                    value={newPassword}
                                                    onChange={e => setNewPassword(e.target.value)}
                                                    placeholder="••••••••"
                                                    minLength={6}
                                                    required
                                                />
                                            </div>
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Confirm New Password</label>
                                            <div className="relative">
                                                <input
                                                    type="password"
                                                    className="w-full bg-white dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-xl px-4 py-2.5 outline-none focus:ring-2 focus:ring-primary/50 transition-all text-sm"
                                                    value={confirmPassword}
                                                    onChange={e => setConfirmPassword(e.target.value)}
                                                    placeholder="••••••••"
                                                    minLength={6}
                                                />
                                            </div>
                                        </div>
                                        <button
                                            type="submit"
                                            disabled={loading || !newPassword || !confirmPassword}
                                            className="bg-slate-900 dark:bg-white text-white dark:text-slate-900 px-6 py-2.5 rounded-xl font-semibold text-sm hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
                                        >
                                            {loading ? 'Updating...' : 'Update Password'}
                                        </button>
                                    </form>
                                </section>

                                {/* 2FA Section */}
                                <section>
                                    <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
                                        <span className="material-symbols-rounded text-primary">security</span>
                                        Two-Factor Authentication (2FA)
                                    </h3>
                                    <div className="bg-slate-50 dark:bg-slate-900/50 p-6 rounded-2xl border border-slate-200 dark:border-white/5">
                                        {!is2FAEnabled ? (
                                            !qrCodeUrl ? (
                                                <div className="text-center py-4">
                                                    <div className="w-16 h-16 bg-slate-200 dark:bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-4">
                                                        <span className="material-symbols-rounded text-3xl text-slate-400">phonelink_lock</span>
                                                    </div>
                                                    <p className="text-sm text-slate-500 dark:text-slate-400 mb-6 max-w-sm mx-auto">
                                                        Secure your account by requiring a code from your authenticator app (like Google Authenticator) when logging in.
                                                    </p>
                                                    <button
                                                        onClick={enable2FA}
                                                        className="bg-primary hover:bg-primary/90 text-white px-6 py-2.5 rounded-xl font-semibold text-sm transition-all shadow-lg shadow-primary/20"
                                                    >
                                                        Enable 2FA
                                                    </button>
                                                </div>
                                            ) : (
                                                <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
                                                    <div className="text-center">
                                                        <p className="text-sm font-medium mb-4">1. Scan this QR Code with your Authenticator App</p>
                                                        <div className="bg-white p-4 rounded-xl inline-block shadow-sm">
                                                            <img src={qrCodeUrl} alt="2FA QR Code" className="w-48 h-48" />
                                                        </div>
                                                    </div>

                                                    <div className="max-w-xs mx-auto space-y-4">
                                                        <p className="text-sm font-medium text-center">2. Enter the 6-digit code</p>
                                                        <div className="flex gap-2">
                                                            <input
                                                                type="text"
                                                                className="w-full bg-white dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-xl px-4 py-2.5 outline-none focus:ring-2 focus:ring-primary/50 text-center font-mono text-lg tracking-widest"
                                                                placeholder="000000"
                                                                maxLength={6}
                                                                value={verifyCode}
                                                                onChange={e => setVerifyCode(e.target.value.replace(/\D/g, ''))}
                                                            />
                                                            <button
                                                                onClick={verifyAndEnable2FA}
                                                                disabled={verifyCode.length !== 6 || loading}
                                                                className="bg-primary hover:bg-primary/90 text-white px-6 rounded-xl font-semibold transition-all disabled:opacity-50"
                                                            >
                                                                Verify
                                                            </button>
                                                        </div>
                                                        <button
                                                            onClick={() => setQrCodeUrl(null)}
                                                            className="w-full text-xs text-slate-500 hover:text-red-500 transition-colors"
                                                        >
                                                            Cancel Setup
                                                        </button>
                                                    </div>
                                                </div>
                                            )
                                        ) : (
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-4">
                                                    <div className="w-12 h-12 bg-green-500/10 rounded-full flex items-center justify-center border border-green-500/20">
                                                        <span className="material-symbols-rounded text-green-500 text-xl">check_circle</span>
                                                    </div>
                                                    <div>
                                                        <p className="font-bold text-slate-900 dark:text-white">2FA is Enabled</p>
                                                        <p className="text-xs text-slate-500 dark:text-slate-400">Your account is secured with TOTP.</p>
                                                    </div>
                                                </div>
                                                <button
                                                    onClick={disable2FA}
                                                    className="px-4 py-2 text-red-500 hover:bg-red-500/10 rounded-lg text-sm font-medium transition-colors border border-red-500/20 hover:border-red-500/50"
                                                >
                                                    Disable 2FA
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                </section>
                            </div>
                        )}
                    </div>
                </div>
            </main>
        </div>
    );
}
