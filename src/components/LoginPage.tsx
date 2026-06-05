import React, { useState } from 'react';
import { login } from '../api';
import { AuthUser } from '../types';
import { Mail, Lock, LogIn, Eye, EyeOff, AlertCircle } from 'lucide-react';

interface LoginPageProps {
  onLogin: (user: AuthUser, token: string) => void;
}

export default function LoginPage({ onLogin }: LoginPageProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setError('Введіть email та пароль');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const { token, user } = await login(email, password);
      localStorage.setItem('auth_token', token);
      onLogin(user, token);
    } catch (err: any) {
      setError(err.message || 'Помилка входу');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden bg-gray-950">
      {/* Animated gradient background */}
      <div className="absolute inset-0 bg-gradient-to-br from-blue-950 via-gray-950 to-indigo-950" />
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -left-40 w-[600px] h-[600px] rounded-full bg-blue-600/10 blur-[120px] animate-pulse" style={{ animationDuration: '4s' }} />
        <div className="absolute -bottom-40 -right-40 w-[600px] h-[600px] rounded-full bg-indigo-600/10 blur-[120px] animate-pulse" style={{ animationDuration: '6s' }} />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] rounded-full bg-blue-500/5 blur-[80px]" />
      </div>

      {/* Grid overlay */}
      <div
        className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage: 'linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)',
          backgroundSize: '40px 40px'
        }}
      />

      {/* Card */}
      <div className="relative w-full max-w-md mx-4">
        {/* Glow border */}
        <div className="absolute -inset-[1px] rounded-2xl bg-gradient-to-br from-blue-500/30 via-transparent to-indigo-500/30 blur-sm" />
        
        <div className="relative bg-gray-900/90 backdrop-blur-xl rounded-2xl border border-white/10 shadow-2xl overflow-hidden">
          {/* Top accent */}
          <div className="h-1 w-full bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-500" />

          <div className="px-8 pt-8 pb-10">
            {/* Logo */}
            <div className="flex flex-col items-center mb-8">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-blue-500/30 mb-4">
                <span className="text-white font-black text-2xl">K</span>
              </div>
              <h1 className="text-2xl font-bold text-white tracking-tight">Kanban Master</h1>
              <p className="text-gray-400 text-sm mt-1.5">Маркетинговий CRM — вхід</p>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="space-y-5">
              {/* Email */}
              <div>
                <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
                  Email
                </label>
                <div className="relative group">
                  <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 group-focus-within:text-blue-400 transition-colors" />
                  <input
                    id="login-email"
                    type="email"
                    value={email}
                    onChange={e => { setEmail(e.target.value); setError(''); }}
                    placeholder="your@email.com"
                    autoComplete="email"
                    className="w-full bg-white/5 border border-white/10 text-white placeholder-gray-600 rounded-xl pl-10 pr-4 py-3 text-sm outline-none focus:border-blue-500/60 focus:bg-white/8 focus:ring-2 focus:ring-blue-500/20 transition-all"
                  />
                </div>
              </div>

              {/* Password */}
              <div>
                <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
                  Пароль
                </label>
                <div className="relative group">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 group-focus-within:text-blue-400 transition-colors" />
                  <input
                    id="login-password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={e => { setPassword(e.target.value); setError(''); }}
                    placeholder="••••••••"
                    autoComplete="current-password"
                    className="w-full bg-white/5 border border-white/10 text-white placeholder-gray-600 rounded-xl pl-10 pr-11 py-3 text-sm outline-none focus:border-blue-500/60 focus:bg-white/8 focus:ring-2 focus:ring-blue-500/20 transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(v => !v)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 transition-colors"
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Error */}
              {error && (
                <div className="flex items-center gap-2.5 bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3">
                  <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
                  <p className="text-sm text-red-400">{error}</p>
                </div>
              )}

              {/* Submit */}
              <button
                id="login-submit"
                type="submit"
                disabled={loading}
                className="w-full flex items-center justify-center gap-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-semibold rounded-xl py-3 text-sm transition-all shadow-lg shadow-blue-600/30 hover:shadow-blue-600/40 hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:translate-y-0 mt-2"
              >
                {loading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Вхід...
                  </>
                ) : (
                  <>
                    <LogIn className="w-4 h-4" />
                    Увійти
                  </>
                )}
              </button>
            </form>

            {/* Footer note */}
            <p className="text-center text-xs text-gray-600 mt-6">
              Немає акаунту? Зверніться до адміністратора.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
