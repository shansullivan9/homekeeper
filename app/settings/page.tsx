'use client';
import { useState } from 'react';
import { useStore } from '@/lib/store';
import { createClient } from '@/lib/supabase-browser';
import PageHeader from '@/components/layout/PageHeader';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import {
  Users, Copy, Plus, LogOut, Bell, Home, ChevronRight,
  UserCircle2, Palette, Package, Clock3, Banknote,
} from 'lucide-react';

export default function SettingsPage() {
  const { user, home, members } = useStore();
  const supabase = createClient();
  const router = useRouter();
  const [joinCode, setJoinCode] = useState('');
  const [joining, setJoining] = useState(false);
  const [showJoin, setShowJoin] = useState(false);

  const copyInviteCode = () => {
    if (!home?.invite_code) return;
    navigator.clipboard.writeText(home.invite_code);
    toast.success('Invite code copied!');
  };

  const handleJoinHome = async () => {
    if (!joinCode.trim() || !user) return;
    setJoining(true);
    try {
      // Find home by invite code
      const { data: targetHome, error: findErr } = await supabase
        .from('homes')
        .select('id')
        .eq('invite_code', joinCode.trim())
        .single();

      if (findErr || !targetHome) {
        toast.error('Invalid invite code');
        return;
      }

      const { error } = await supabase.from('home_members').insert({
        home_id: targetHome.id,
        user_id: user.id,
        role: 'member',
      });

      if (error) {
        if (error.code === '23505') toast.error('You are already a member');
        else throw error;
      } else {
        toast.success('Joined household!');
        window.location.reload();
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to join');
    } finally {
      setJoining(false);
    }
  };

  const handleSignOut = async () => {
    if (!confirm('Sign out of HomeKeeper?')) return;
    await supabase.auth.signOut();
    router.push('/auth');
  };

  return (
    <div>
      <PageHeader title="Settings" />

      <div className="py-4 space-y-5 md:max-w-2xl">
        {/* Profile */}
        <div className="mx-4 ios-card overflow-hidden">
          <div className="px-4 py-4 flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-brand-100 flex items-center justify-center">
              <UserCircle2 size={28} className="text-brand-500" />
            </div>
            <div>
              <p className="font-semibold text-[15px]">{user?.display_name || 'User'}</p>
              <p className="text-xs text-ink-secondary">{user?.email}</p>
            </div>
          </div>
        </div>

        {/* Household */}
        <div>
          <p className="section-header">Household</p>
          <div className="mx-4 ios-card overflow-hidden">
            {/* Home Name */}
            <div className="ios-list-item">
              <div className="flex items-center gap-3">
                <Home size={18} className="text-brand-500" />
                <span className="text-[15px]">{home?.name || 'My Home'}</span>
              </div>
              <button onClick={() => router.push('/home-profile')} className="text-brand-500 text-sm font-medium">Edit</button>
            </div>

            {/* Members */}
            <div className="px-4 py-3 border-b border-gray-100">
              <div className="flex items-center gap-2 mb-2">
                <Users size={16} className="text-ink-secondary" />
                <span className="text-sm font-medium text-ink-secondary">Members</span>
              </div>
              {members.map((m) => (
                <div key={m.id} className="flex items-center gap-2 py-1.5">
                  <div className="w-7 h-7 rounded-full bg-brand-50 flex items-center justify-center text-xs font-bold text-brand-500">
                    {((m as any).profiles?.display_name || 'U')[0].toUpperCase()}
                  </div>
                  <span className="text-sm">{(m as any).profiles?.display_name || (m as any).profiles?.email}</span>
                  {m.role === 'owner' && (
                    <span className="text-[10px] bg-brand-50 text-brand-500 px-1.5 py-0.5 rounded-full font-medium">Owner</span>
                  )}
                </div>
              ))}
            </div>

            {/* Invite Code */}
            {home?.invite_code && (
              <button onClick={copyInviteCode} className="ios-list-item w-full">
                <div className="flex items-center gap-3">
                  <Copy size={16} className="text-ink-secondary" />
                  <div>
                    <span className="text-sm text-ink-secondary">Invite Code</span>
                    <p className="text-xs font-mono text-brand-500">{home.invite_code}</p>
                  </div>
                </div>
                <span className="text-xs text-brand-500 font-medium">Copy</span>
              </button>
            )}

            {/* Join Another Home */}
            <button onClick={() => setShowJoin(!showJoin)} className="ios-list-item w-full">
              <div className="flex items-center gap-3">
                <Plus size={16} className="text-ink-secondary" />
                <span className="text-sm">Join Another Home</span>
              </div>
              <ChevronRight size={16} className="text-ink-tertiary" />
            </button>

            {showJoin && (
              <div className="px-4 py-3 bg-gray-50 border-t border-gray-100">
                <input
                  type="text"
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value)}
                  placeholder="Enter invite code"
                  className="ios-input mb-2"
                />
                <button onClick={handleJoinHome} disabled={joining} className="ios-button text-sm">
                  {joining ? 'Joining...' : 'Join Home'}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Navigation Links */}
        <div>
          <p className="section-header">Manage</p>
          <div className="mx-4 ios-card overflow-hidden">
            {[
              { label: 'Appliances & Systems', icon: Package, href: '/appliances' },
              { label: 'Expenses', icon: Banknote, href: '/expenses' },
              { label: 'Home Timeline', icon: Clock3, href: '/timeline' },
              { label: 'Home Profile', icon: Home, href: '/home-profile' },
            ].map(({ label, icon: Icon, href }) => (
              <button key={href} onClick={() => router.push(href)} className="ios-list-item w-full">
                <div className="flex items-center gap-3">
                  <Icon size={18} className="text-ink-secondary" />
                  <span className="text-[15px]">{label}</span>
                </div>
                <ChevronRight size={16} className="text-ink-tertiary" />
              </button>
            ))}
          </div>
        </div>

        {/* Sign Out */}
        <div className="mx-4">
          <button onClick={handleSignOut} className="w-full ios-card px-4 py-3.5 flex items-center justify-center gap-2 text-status-red font-semibold active:bg-red-50 transition-colors">
            <LogOut size={18} />
            Sign Out
          </button>
        </div>

        <p className="text-center text-[10px] text-ink-tertiary py-4">HomeKeeper v1.0</p>
      </div>
    </div>
  );
}
