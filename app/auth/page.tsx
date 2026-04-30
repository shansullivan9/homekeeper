'use client';
import { useState } from 'react';
import { createClient } from '@/lib/supabase-browser';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';

export default function AuthPage() {
  const [mode, setMode] = useState<'login' | 'signup' | 'reset'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  const handleResetPassword = async () => {
    const target = email.trim();
    if (!target) {
      toast.error('Enter your email address first');
      return;
    }
    setLoading(true);
    try {
      const redirectTo =
        typeof window !== 'undefined' ? `${window.location.origin}/auth` : undefined;
      const { error } = await supabase.auth.resetPasswordForEmail(target, {
        redirectTo,
      });
      if (error) throw error;
      toast.success('Check your email for a reset link');
      setMode('login');
    } catch (err: any) {
      toast.error(err.message || 'Could not send reset email');
    } finally {
      setLoading(false);
    }
  };

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (mode === 'reset') {
      await handleResetPassword();
      return;
    }
    setLoading(true);

    try {
      if (mode === 'signup') {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { display_name: name } },
        });
        if (error) throw error;
        if (data.session) {
          // Email confirmation is off — we're already signed in. Send
          // them straight into the home-profile setup.
          toast.success('Welcome!');
          router.push('/home-profile');
        } else {
          toast.success('Check your email to verify your account, then sign in.');
          setMode('login');
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        router.push('/dashboard');
      }
    } catch (err: any) {
      toast.error(err.message || 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col justify-center px-6 bg-white">
      <div className="mx-auto w-full max-w-sm animate-fade-in">
        {/* Logo */}
        <div className="flex flex-col items-center mb-10">
          <div className="w-20 h-20 rounded-[22px] bg-gradient-to-br from-brand-400 to-brand-600 flex items-center justify-center shadow-lg mb-4">
            <span className="text-4xl">🏠</span>
          </div>
          <h1 className="text-2xl font-bold text-ink-primary">HomeKeeper</h1>
          <p className="text-ink-secondary text-sm mt-1">Home maintenance, simplified</p>
        </div>

        {/* Form */}
        <form onSubmit={handleAuth} className="space-y-4">
          {mode === 'signup' && (
            <input
              type="text"
              placeholder="Your name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="ios-input"
              required
            />
          )}
          <input
            type="email"
            placeholder="Email address"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="ios-input"
            required
            autoComplete="email"
          />
          {mode !== 'reset' && (
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="ios-input"
              required
              minLength={6}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            />
          )}
          <button type="submit" disabled={loading} className="ios-button">
            {loading
              ? 'Please wait...'
              : mode === 'login'
              ? 'Sign In'
              : mode === 'signup'
              ? 'Create Account'
              : 'Send Reset Link'}
          </button>
          {mode === 'login' && (
            <button
              type="button"
              onClick={() => setMode('reset')}
              className="block w-full text-center text-xs text-ink-tertiary md:hover:text-brand-500 transition-colors"
            >
              Forgot password?
            </button>
          )}
        </form>

        <div className="mt-6 text-center">
          {mode === 'reset' ? (
            <button
              onClick={() => setMode('login')}
              className="text-brand-500 text-sm font-medium"
            >
              ← Back to sign in
            </button>
          ) : (
            <button
              onClick={() => setMode(mode === 'login' ? 'signup' : 'login')}
              className="text-brand-500 text-sm font-medium"
            >
              {mode === 'login' ? "Don't have an account? Sign Up" : 'Already have an account? Sign In'}
            </button>
          )}
        </div>

        {mode === 'reset' && (
          <p className="mt-4 text-[11px] text-ink-tertiary text-center px-4">
            We'll email a link to reset your password. Use the email
            address you signed up with.
          </p>
        )}
      </div>
    </div>
  );
}
