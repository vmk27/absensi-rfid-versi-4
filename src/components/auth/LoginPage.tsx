import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import {
  GraduationCap,
  Lock,
  User as UserIcon,
  Eye,
  EyeOff,
  LogIn,
  AlertCircle,
  CheckCircle2,
  ShieldCheck,
  Copy,
  Check,
  Terminal,
  KeyRound,
  Sparkles
} from 'lucide-react';
import { hashPassword } from '../../utils/cryptoUtils';

export const LoginPage: React.FC = () => {
  const { login } = useAuth();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');
    const cleanUsername = username.trim();
    if (!cleanUsername || !password) {
      setErrorMessage('Silakan lengkapi username dan password.');
      return;
    }
    setIsLoading(true);
    try {
      await new Promise(r => setTimeout(r, 600));
      const success = await login(cleanUsername, password, rememberMe);
      if (!success) {
        setErrorMessage('Username atau password salah. Silakan coba lagi!');
      }
    } catch (err) {
      setErrorMessage('Terjadi kendala saat login.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col justify-between relative overflow-hidden font-sans selection:bg-indigo-600 selection:text-white">
      {/* Background patterns */}
      <div className="absolute top-0 left-0 w-full h-full opacity-[0.03] pointer-events-none" 
           style={{ backgroundImage: 'radial-gradient(#4f46e5 1px, transparent 1px)', backgroundSize: '30px 30px' }} />
      <div className="absolute -top-40 -left-40 w-96 h-96 bg-indigo-200/40 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-emerald-100/40 rounded-full blur-3xl pointer-events-none" />

      {/* Top Bar */}
      <header className="px-6 py-4 flex items-center justify-between border-b border-slate-200 bg-white/80 backdrop-blur-md relative z-10 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-indigo-600 flex items-center justify-center text-white font-black shadow-lg">
            <GraduationCap className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-base font-black tracking-tight text-slate-900">SMAN 1 LUMBUNG</h1>
            <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Sistem Absensi Digital</p>
          </div>
        </div>
      </header>

      {/* Main Login */}
      <main className="flex-1 flex items-center justify-center px-4 py-12 relative z-10">
        <div className="w-full max-w-md bg-white border border-slate-200 rounded-[2.5rem] p-8 sm:p-10 shadow-xl shadow-slate-200/50 space-y-8 animate-fade-in">
          <div className="text-center space-y-3">
            <div className="inline-flex p-4 rounded-3xl bg-indigo-50 text-indigo-600 border border-indigo-100 mb-2">
              <KeyRound className="w-8 h-8" />
            </div>
            <h2 className="text-3xl font-black tracking-tight text-slate-900">Portal Masuk</h2>
            <p className="text-sm text-slate-500 font-medium">
              Akses sistem pemantauan kehadiran real-time SMAN 1 Lumbung.
            </p>
          </div>

          {errorMessage && (
            <div className="p-4 rounded-2xl bg-rose-50 border border-rose-100 text-rose-600 text-xs font-bold flex items-start gap-3 animate-shake">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <label className="block text-xs font-black text-slate-700 uppercase tracking-wider ml-1">
                Username Akun
              </label>
              <div className="relative">
                <input
                  type="text"
                  required
                  autoFocus
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="admin / piket / walikelas"
                  className="w-full bg-slate-50 border border-slate-200 rounded-2xl pl-12 pr-4 py-4 text-sm text-slate-900 focus:outline-none focus:border-indigo-600 focus:ring-4 focus:ring-indigo-500/10 transition-all font-bold placeholder:text-slate-400"
                />
                <UserIcon className="w-5 h-5 text-slate-400 absolute left-4 top-4" />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between ml-1">
                <label className="block text-xs font-black text-slate-700 uppercase tracking-wider">
                  Kata Sandi
                </label>
              </div>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full bg-slate-50 border border-slate-200 rounded-2xl pl-12 pr-12 py-4 text-sm text-slate-900 focus:outline-none focus:border-indigo-600 focus:ring-4 focus:ring-indigo-500/10 transition-all font-mono"
                />
                <Lock className="w-5 h-5 text-slate-400 absolute left-4 top-4" />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-4 text-slate-400 hover:text-indigo-600 transition-colors"
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between px-1">
              <label className="flex items-center gap-2 cursor-pointer select-none text-[11px] font-bold text-slate-600">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                />
                <span>Simpan Sesi Saya</span>
              </label>
              <span className="text-[10px] text-slate-400 font-mono">SHA-256 Secured</span>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-4 px-6 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-black text-sm rounded-2xl shadow-xl shadow-indigo-600/20 transition-all flex items-center justify-center gap-3 active:scale-95"
            >
              {isLoading ? (
                <>
                  <div className="w-5 h-5 border-3 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Memverifikasi...</span>
                </>
              ) : (
                <>
                  <LogIn className="w-5 h-5" />
                  <span>Masuk ke Dashboard</span>
                </>
              )}
            </button>
          </form>
          
          <div className="text-center">
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-tighter">
              Pastikan Anda menggunakan jaringan internal sekolah jika diperlukan
            </p>
          </div>
        </div>
      </main>

      <footer className="px-6 py-6 border-t border-slate-200 bg-white text-center text-[10px] font-black text-slate-400 uppercase tracking-widest relative z-10">
        SMAN 1 Lumbung • Digital Presence System • v2.5.0
      </footer>
    </div>
  );
};

