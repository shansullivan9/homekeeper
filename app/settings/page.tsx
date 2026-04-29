'use client';
import { useEffect, useState } from 'react';
import { useStore } from '@/lib/store';
import { createClient } from '@/lib/supabase-browser';
import PageHeader from '@/components/layout/PageHeader';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import {
  Users, Plus, LogOut, Home, ChevronRight,
  UserCircle2, Share2, RefreshCw, X, Bell,
  LogOut as LeaveIcon,
} from 'lucide-react';

// "abcdef012345" → "abcd-ef01-2345"
const formatInviteCode = (raw: string | null | undefined): string =>
  (raw || '').replace(/[^A-Za-z0-9]/g, '').match(/.{1,4}/g)?.join('-') || (raw || '');

export default function SettingsPage() {
  const { user, home, members, setUser, setHome, setMembers, userMemberships } = useStore();
  const supabase = createClient();
  const router = useRouter();
  const [otherHomes, setOtherHomes] = useState<{ id: string; name: string }[]>([]);

  // Look up names for the user's other households so the switcher
  // can label them. We only fetch what's not already the current
  // home and only when there's more than one membership.
  useEffect(() => {
    const loadOtherNames = async () => {
      if (!userMemberships || userMemberships.length <= 1) {
        setOtherHomes([]);
        return;
      }
      const otherIds = userMemberships
        .map((m: any) => m.home_id)
        .filter((id: string) => id && id !== home?.id);
      if (otherIds.length === 0) {
        setOtherHomes([]);
        return;
      }
      const { data } = await supabase
        .from('homes')
        .select('id, name')
        .in('id', otherIds);
      if (data) setOtherHomes(data as any);
    };
    loadOtherNames();
  }, [userMemberships, home?.id]);

  const switchToHome = (homeId: string) => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('homekeeper.selectedHomeId', homeId);
    }
    window.location.reload();
  };
  const [joinCode, setJoinCode] = useState('');
  const [joining, setJoining] = useState(false);
  const [showJoin, setShowJoin] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [editingEmail, setEditingEmail] = useState(false);
  const [emailDraft, setEmailDraft] = useState('');
  const [editingHomeName, setEditingHomeName] = useState(false);
  const [homeNameDraft, setHomeNameDraft] = useState('');
  const [rotating, setRotating] = useState(false);

  const isOwner = members.find((m) => (m as any).user_id === user?.id)?.role === 'owner';

  const saveName = async () => {
    if (!user || !nameDraft.trim()) return;
    const next = nameDraft.trim();
    const { data, error } = await supabase
      .from('profiles')
      .update({ display_name: next })
      .eq('id', user.id)
      .select()
      .single();
    if (error) {
      toast.error('Could not update name');
      return;
    }
    if (data) setUser(data as any);
    toast.success('Name updated');
    setEditingName(false);
  };

  const saveEmail = async () => {
    const next = emailDraft.trim();
    if (!user || !next) return;
    if (next === user.email) {
      setEditingEmail(false);
      return;
    }
    // Supabase auth requires email confirmation — both the old and
    // new addresses get a "confirm change" email, after which the
    // change takes effect.
    const { error } = await supabase.auth.updateUser({ email: next });
    if (error) {
      toast.error(error.message || 'Could not update email');
      return;
    }
    toast.success('Check both inboxes to confirm the change');
    setEditingEmail(false);
  };

  const saveHomeName = async () => {
    const next = homeNameDraft.trim();
    if (!home || !next) return;
    if (next === home.name) {
      setEditingHomeName(false);
      return;
    }
    const { data, error } = await supabase
      .from('homes')
      .update({ name: next, updated_at: new Date().toISOString() })
      .eq('id', home.id)
      .select()
      .single();
    if (error) {
      toast.error('Could not rename home');
      return;
    }
    if (data) setHome(data as any);
    toast.success('Home renamed');
    setEditingHomeName(false);
  };

  const copyInviteCode = () => {
    if (!home?.invite_code) return;
    navigator.clipboard.writeText(formatInviteCode(home.invite_code));
    toast.success('Invite code copied!');
  };

  const shareInvite = async () => {
    if (!home?.invite_code) return;
    const code = formatInviteCode(home.invite_code);
    const message = `Join "${home.name}" on HomeKeeper. Open the app, go to Settings → Join Another Home, and enter code: ${code}`;
    // Use the system share sheet when available (mobile); otherwise
    // fall back to clipboard.
    if (typeof navigator !== 'undefined' && (navigator as any).share) {
      try {
        await (navigator as any).share({ title: 'HomeKeeper invite', text: message });
        return;
      } catch {
        // user cancelled or share failed — fall through to clipboard
      }
    }
    navigator.clipboard.writeText(message);
    toast.success('Invite copied to clipboard');
  };

  const rotateInviteCode = async () => {
    if (!home || !isOwner) return;
    if (!confirm('Generate a new invite code? The old code will stop working.')) return;
    setRotating(true);
    try {
      // Random 12 hex chars to mirror the schema default.
      const fresh = Array.from({ length: 12 })
        .map(() => Math.floor(Math.random() * 16).toString(16))
        .join('');
      const { data, error } = await supabase
        .from('homes')
        .update({ invite_code: fresh })
        .eq('id', home.id)
        .select()
        .single();
      if (error) throw error;
      if (data) setHome(data as any);
      toast.success('New invite code generated');
    } catch (err: any) {
      toast.error(err.message || 'Could not rotate code');
    } finally {
      setRotating(false);
    }
  };

  const handleJoinHome = async () => {
    if (!joinCode.trim() || !user) return;
    setJoining(true);
    try {
      // Strip hyphens / whitespace so users can paste either format.
      const code = joinCode.replace(/[^A-Za-z0-9]/g, '');
      const { data: targetHome, error: findErr } = await supabase
        .from('homes')
        .select('id')
        .eq('invite_code', code)
        .single();

      if (findErr || !targetHome) {
        toast.error('Invalid invite code');
        return;
      }

      const { error } = await supabase.from('home_members').insert({
        home_id: (targetHome as any).id,
        user_id: user.id,
        role: 'member',
      });

      if (error) {
        if (error.code === '23505') toast.error('You are already a member');
        else throw error;
      } else {
        toast.success('Joined household!');
        // Make the just-joined home the active one so the next reload
        // shows it instead of the previous default.
        if (typeof window !== 'undefined') {
          window.localStorage.setItem(
            'homekeeper.selectedHomeId',
            (targetHome as any).id
          );
        }
        window.location.reload();
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to join');
    } finally {
      setJoining(false);
    }
  };

  const handleLeaveHousehold = async () => {
    if (!user || !home) return;
    if (
      !confirm(
        isOwner
          ? `Leave "${home.name}"? You're the owner — leaving will remove you from this household.`
          : `Leave "${home.name}"? You'll lose access to its tasks and documents.`
      )
    ) return;
    const myRow = members.find((m) => (m as any).user_id === user.id);
    if (!myRow) return;
    const { error } = await supabase
      .from('home_members')
      .delete()
      .eq('id', myRow.id);
    if (error) {
      toast.error(error.message || 'Could not leave');
      return;
    }
    toast.success('Left household');
    // Drop the stored selection so AppShell falls back to whatever
    // remaining membership (if any) it finds first.
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem('homekeeper.selectedHomeId');
    }
    window.location.reload();
  };

  const handleRemoveMember = async (memberRow: any) => {
    if (!isOwner) return;
    const name = memberRow.display_name || memberRow.email || 'this member';
    if (!confirm(`Remove ${name} from "${home?.name}"?`)) return;
    const { error } = await supabase
      .from('home_members')
      .delete()
      .eq('id', memberRow.id);
    if (error) {
      toast.error(error.message || 'Could not remove member');
      return;
    }
    setMembers(members.filter((m) => m.id !== memberRow.id));
    toast.success(`${name} removed`);
  };

  const handleSignOut = async () => {
    if (!confirm('Sign out of HomeKeeper?')) return;
    await supabase.auth.signOut();
    useStore.setState({
      user: null, home: null, members: [], tasks: [], categories: [],
      appliances: [], history: [], documents: [],
    });
    router.push('/auth');
  };

  return (
    <div>
      <PageHeader title="Settings" />

      <div className="py-4 space-y-5 md:max-w-2xl">
        {/* Profile */}
        <div className="mx-4 ios-card overflow-hidden">
          {/* Display name row */}
          <div className="px-4 py-3.5 flex items-center gap-3 border-b border-gray-100">
            <div className="w-10 h-10 rounded-full bg-brand-100 flex items-center justify-center flex-shrink-0">
              <UserCircle2 size={24} className="text-brand-500" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-secondary">
                Name
              </p>
              {editingName ? (
                <div className="flex items-center gap-2 mt-1">
                  <input
                    value={nameDraft}
                    onChange={(e) => setNameDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') saveName();
                      if (e.key === 'Escape') setEditingName(false);
                    }}
                    autoFocus
                    maxLength={60}
                    className="ios-input py-1.5 flex-1"
                  />
                </div>
              ) : (
                <p className="text-[15px] font-medium truncate">
                  {user?.display_name || 'Add your name'}
                </p>
              )}
            </div>
            {editingName ? (
              <>
                <button onClick={saveName} className="text-brand-500 text-sm font-semibold">
                  Save
                </button>
                <button
                  onClick={() => setEditingName(false)}
                  className="text-ink-tertiary text-sm"
                >
                  Cancel
                </button>
              </>
            ) : (
              <button
                onClick={() => {
                  setNameDraft(user?.display_name || '');
                  setEditingName(true);
                }}
                className="text-brand-500 text-sm font-medium"
              >
                Edit
              </button>
            )}
          </div>

          {/* Email row */}
          <div className="px-4 py-3.5 flex items-center gap-3">
            <div className="w-10 h-10 flex items-center justify-center flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-secondary">
                Email
              </p>
              {editingEmail ? (
                <div className="flex items-center gap-2 mt-1">
                  <input
                    type="email"
                    value={emailDraft}
                    onChange={(e) => setEmailDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') saveEmail();
                      if (e.key === 'Escape') setEditingEmail(false);
                    }}
                    autoFocus
                    autoComplete="email"
                    className="ios-input py-1.5 flex-1"
                  />
                </div>
              ) : (
                <p className="text-[14px] text-ink-secondary truncate">{user?.email}</p>
              )}
              {editingEmail && (
                <p className="text-[11px] text-ink-tertiary mt-1">
                  We'll email both your old and new address to confirm.
                </p>
              )}
            </div>
            {editingEmail ? (
              <>
                <button onClick={saveEmail} className="text-brand-500 text-sm font-semibold">
                  Save
                </button>
                <button
                  onClick={() => setEditingEmail(false)}
                  className="text-ink-tertiary text-sm"
                >
                  Cancel
                </button>
              </>
            ) : (
              <button
                onClick={() => {
                  setEmailDraft(user?.email || '');
                  setEditingEmail(true);
                }}
                className="text-brand-500 text-sm font-medium"
              >
                Edit
              </button>
            )}
          </div>
        </div>

        {/* Other households — only shown when the user belongs to
            more than one. Tap to switch the active home; AppShell
            reads localStorage on next load. */}
        {otherHomes.length > 0 && (
          <div>
            <p className="section-header">Switch Household</p>
            <div className="mx-4 ios-card overflow-hidden">
              <div className="ios-list-item">
                <div className="flex items-center gap-3">
                  <Home size={18} className="text-brand-500" />
                  <span className="text-[15px] font-medium">{home?.name || 'My Home'}</span>
                </div>
                <span className="text-[10px] bg-brand-50 text-brand-500 px-1.5 py-0.5 rounded-full font-medium">
                  Current
                </span>
              </div>
              {otherHomes.map((h) => (
                <button
                  key={h.id}
                  onClick={() => switchToHome(h.id)}
                  className="ios-list-item w-full"
                >
                  <div className="flex items-center gap-3">
                    <Home size={18} className="text-ink-secondary" />
                    <span className="text-[15px]">{h.name}</span>
                  </div>
                  <span className="text-xs text-brand-500 font-medium">Switch</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Household */}
        <div>
          <p className="section-header">Household</p>
          <div className="mx-4 ios-card overflow-hidden">
            {/* Home Name — inline edit; "More details" still routes
                 to the full home profile for property-level fields. */}
            <div className="ios-list-item">
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <Home size={18} className="text-brand-500 flex-shrink-0" />
                {editingHomeName ? (
                  <input
                    value={homeNameDraft}
                    onChange={(e) => setHomeNameDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') saveHomeName();
                      if (e.key === 'Escape') setEditingHomeName(false);
                    }}
                    autoFocus
                    maxLength={80}
                    className="ios-input py-1.5 flex-1"
                  />
                ) : (
                  <span className="text-[15px] truncate">{home?.name || 'My Home'}</span>
                )}
              </div>
              {editingHomeName ? (
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button onClick={saveHomeName} className="text-brand-500 text-sm font-semibold">Save</button>
                  <button onClick={() => setEditingHomeName(false)} className="text-ink-tertiary text-sm">Cancel</button>
                </div>
              ) : (
                <button
                  onClick={() => {
                    setHomeNameDraft(home?.name || '');
                    setEditingHomeName(true);
                  }}
                  className="text-brand-500 text-sm font-medium flex-shrink-0"
                >
                  Edit
                </button>
              )}
            </div>

            {/* Property details — separate, clearly labeled */}
            <button
              onClick={() => router.push('/home-profile')}
              className="ios-list-item w-full"
            >
              <div className="flex items-center gap-3">
                <Home size={18} className="text-ink-secondary" />
                <span className="text-[15px]">Property details</span>
              </div>
              <ChevronRight size={16} className="text-ink-tertiary" />
            </button>

            {/* Members */}
            <div className="px-4 py-3 border-b border-gray-100">
              <div className="flex items-center gap-2 mb-2">
                <Users size={16} className="text-ink-secondary" />
                <span className="text-sm font-medium text-ink-secondary">Members</span>
              </div>
              {[...members]
                .sort((a, b) => {
                  // Owners first, then alphabetical by display name
                  // (the user's own row also bubbles up via owner sort
                  // when they're the owner; otherwise lands by name).
                  if (a.role === 'owner' && b.role !== 'owner') return -1;
                  if (a.role !== 'owner' && b.role === 'owner') return 1;
                  const aName =
                    (a as any).display_name ||
                    (a as any).profiles?.display_name ||
                    (a as any).email ||
                    (a as any).profiles?.email ||
                    '';
                  const bName =
                    (b as any).display_name ||
                    (b as any).profiles?.display_name ||
                    (b as any).email ||
                    (b as any).profiles?.email ||
                    '';
                  return aName.localeCompare(bName, undefined, { sensitivity: 'base' });
                })
                .map((m) => {
                const anyM = m as any;
                const name =
                  anyM.display_name ||
                  anyM.profiles?.display_name ||
                  anyM.email ||
                  anyM.profiles?.email ||
                  'Member';
                const initial = name.trim()[0]?.toUpperCase() || 'M';
                const isMe = anyM.user_id === user?.id;
                return (
                  <div key={m.id} className="flex items-center gap-2 py-1.5">
                    <div className="w-7 h-7 rounded-full bg-brand-50 flex items-center justify-center text-xs font-bold text-brand-500">
                      {initial}
                    </div>
                    <span className="text-sm flex-1 truncate">
                      {isMe ? `${name} (you)` : name}
                    </span>
                    {m.role === 'owner' && (
                      <span className="text-[10px] bg-brand-50 text-brand-500 px-1.5 py-0.5 rounded-full font-medium">Owner</span>
                    )}
                    {isOwner && !isMe && m.role !== 'owner' && (
                      <button
                        onClick={() => handleRemoveMember(anyM)}
                        title={`Remove ${name}`}
                        className="text-ink-tertiary hover:text-status-red transition-colors p-1"
                      >
                        <X size={14} />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Invite Code — promoted to a full Share + copy + rotate row */}
            {home?.invite_code && (
              <div className="px-4 py-3 border-b border-gray-100">
                <div className="flex items-center gap-2 mb-2">
                  <Share2 size={16} className="text-ink-secondary" />
                  <span className="text-sm font-medium text-ink-secondary">Invite Code</span>
                </div>
                <div className="flex items-center gap-2 mb-2">
                  <button
                    onClick={copyInviteCode}
                    title="Tap to copy"
                    className="flex-1 px-3 py-2 rounded-ios bg-surface-secondary font-mono text-[15px] text-brand-600 text-center tracking-wider md:hover:bg-gray-100 active:bg-gray-100 transition-colors"
                  >
                    {formatInviteCode(home.invite_code)}
                  </button>
                  <button
                    onClick={shareInvite}
                    title="Share"
                    className="px-3 py-2 rounded-ios bg-brand-500 text-white text-sm font-semibold flex items-center gap-1.5 active:bg-brand-600 md:hover:bg-brand-600 transition-colors"
                  >
                    <Share2 size={14} />
                    Invite
                  </button>
                </div>
                {isOwner && (
                  <button
                    onClick={rotateInviteCode}
                    disabled={rotating}
                    className="text-xs text-ink-secondary flex items-center gap-1 active:text-brand-500 md:hover:text-brand-500 transition-colors disabled:opacity-50"
                  >
                    <RefreshCw size={12} className={rotating ? 'animate-spin' : ''} />
                    Generate new code
                  </button>
                )}
              </div>
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
                  placeholder="abcd-ef01-2345"
                  className="ios-input mb-2 font-mono"
                />
                <button onClick={handleJoinHome} disabled={joining} className="ios-button text-sm">
                  {joining ? 'Joining...' : 'Join Home'}
                </button>
              </div>
            )}

            {/* Leave Household */}
            <button onClick={handleLeaveHousehold} className="ios-list-item w-full">
              <div className="flex items-center gap-3">
                <LeaveIcon size={16} className="text-status-red" />
                <span className="text-sm text-status-red">Leave Household</span>
              </div>
            </button>
          </div>
        </div>

        {/* Account preferences */}
        <div>
          <p className="section-header">Preferences</p>
          <div className="mx-4 ios-card overflow-hidden">
            <button
              onClick={() => router.push('/settings/notifications')}
              className="ios-list-item w-full"
            >
              <div className="flex items-center gap-3">
                <Bell size={18} className="text-ink-secondary" />
                <span className="text-[15px]">Notifications</span>
              </div>
              <ChevronRight size={16} className="text-ink-tertiary" />
            </button>
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
