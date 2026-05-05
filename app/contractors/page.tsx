'use client';
import { Suspense, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase-browser';
import { useStore } from '@/lib/store';
import { Contractor, Task, TaskHistory, Document, Appliance } from '@/lib/types';
import PageHeader from '@/components/layout/PageHeader';
import { confirm } from '@/lib/confirm';
import { useStoredState } from '@/lib/useStoredState';
import { formatCurrency } from '@/lib/constants';
import {
  detectContractorsFromNotes,
  type ContractorDetection,
} from '@/lib/contractor-detect';
import { format, parseISO } from 'date-fns';
import toast from 'react-hot-toast';
import {
  Plus, X, Search, ChevronRight, Phone, Mail, Globe, MapPin, StickyNote,
  Hammer, FileText, Package, Clock, Briefcase, Sparkles, Check,
} from 'lucide-react';

// US-style phone formatter — accepts the most common digit groupings
// and keeps anything else as-is so international numbers still read.
const fmtPhone = (raw: string | null | undefined): string => {
  if (!raw) return '';
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  if (digits.length === 11 && digits.startsWith('1')) {
    return `+1 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }
  return raw;
};

// Strip http:// or https:// from a URL for cleaner display in chips.
const fmtUrl = (raw: string | null | undefined): string => {
  if (!raw) return '';
  return raw.replace(/^https?:\/\//, '').replace(/\/$/, '');
};

// Tolerant URL normalizer for the "Visit website" anchor — adds
// https:// if the user typed a bare domain like "acmehvac.com".
const normalizeUrl = (raw: string | null | undefined): string => {
  if (!raw) return '';
  const trimmed = raw.trim();
  if (!trimmed) return '';
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
};

function ContractorsPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClient();
  const {
    home, user, contractors, setContractors,
    tasks, history, documents, appliances,
    setTasks, setHistory, setDocuments, setAppliances,
  } = useStore();

  const editingId = searchParams.get('edit');
  const isCreating = searchParams.get('new') === '1';
  const editing = editingId ? contractors.find((c) => c.id === editingId) || null : null;

  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useStoredState<'name' | 'category' | 'recent'>(
    'contractors.sortBy',
    'name',
    user?.id
  );
  const [showForm, setShowForm] = useState(isCreating);
  const [editMode, setEditMode] = useState(isCreating);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState({
    name: '', company: '', category: '',
    phone: '', email: '', website: '', address: '', notes: '',
  });

  // Reset draft state whenever the active contractor changes (or
  // we're switching into "new" mode).
  useEffect(() => {
    if (isCreating) {
      setDraft({
        name: '', company: '', category: '',
        phone: '', email: '', website: '', address: '', notes: '',
      });
      setShowForm(true);
      setEditMode(true);
      return;
    }
    if (editing) {
      setDraft({
        name: editing.name || '',
        company: editing.company || '',
        category: editing.category || '',
        phone: editing.phone || '',
        email: editing.email || '',
        website: editing.website || '',
        address: editing.address || '',
        notes: editing.notes || '',
      });
      setShowForm(true);
      setEditMode(false);
    } else {
      setShowForm(false);
      setEditMode(false);
    }
  }, [editingId, isCreating, contractors]); // eslint-disable-line react-hooks/exhaustive-deps

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = q
      ? contractors.filter((c) => {
          const hay = [c.name, c.company, c.category, c.phone, c.email, c.notes, c.address]
            .filter(Boolean)
            .join(' ')
            .toLowerCase();
          return hay.includes(q);
        })
      : contractors;
    list = [...list];
    if (sortBy === 'category') {
      list.sort((a, b) => {
        const ca = (a.category || '~').toLowerCase();
        const cb = (b.category || '~').toLowerCase();
        if (ca !== cb) return ca.localeCompare(cb);
        return (a.name || '').localeCompare(b.name || '');
      });
    } else if (sortBy === 'recent') {
      list.sort((a, b) =>
        new Date(b.updated_at || b.created_at).getTime() -
        new Date(a.updated_at || a.created_at).getTime()
      );
    } else {
      list.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    }
    return list;
  }, [contractors, search, sortBy]);

  const update = (key: keyof typeof draft, value: string) =>
    setDraft((d) => ({ ...d, [key]: value }));

  const startNew = () => {
    router.push('/contractors?new=1');
  };

  const closeForm = () => {
    router.push('/contractors');
    setShowForm(false);
  };

  const save = async () => {
    if (!home) return;
    if (!draft.name.trim()) {
      toast.error('Name is required');
      return;
    }
    setBusy(true);
    const payload = {
      home_id: home.id,
      name: draft.name.trim(),
      company: draft.company.trim() || null,
      category: draft.category.trim() || null,
      phone: draft.phone.trim() || null,
      email: draft.email.trim() || null,
      website: draft.website.trim() || null,
      address: draft.address.trim() || null,
      notes: draft.notes.trim() || null,
      updated_at: new Date().toISOString(),
    } as any;
    try {
      if (editing) {
        const { data, error } = await supabase
          .from('contractors')
          .update(payload as any)
          .eq('id', editing.id)
          .select()
          .single();
        if (error) throw error;
        setContractors(
          contractors.map((c) => (c.id === editing.id ? (data as Contractor) : c))
        );
        toast.success('Contractor updated');
        setEditMode(false);
      } else {
        const { data, error } = await supabase
          .from('contractors')
          .insert(payload as any)
          .select()
          .single();
        if (error) throw error;
        setContractors(
          [...contractors, data as Contractor].sort((a, b) =>
            (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' })
          )
        );
        toast.success('Contractor added');
        router.replace(`/contractors?edit=${(data as Contractor).id}`);
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to save');
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!editing) return;
    const ok = await confirm({
      title: `Delete ${editing.name}?`,
      message: 'Linked tasks, documents, and appliances will stay — they\'ll just be unlinked.',
      confirmLabel: 'Delete',
      destructive: true,
    });
    if (!ok) return;
    setBusy(true);
    try {
      const { error } = await supabase.from('contractors').delete().eq('id', editing.id);
      if (error) throw error;
      // Local cleanup: drop the contractor and null out any in-memory
      // references so the user sees it disappear immediately.
      setContractors(contractors.filter((c) => c.id !== editing.id));
      setTasks(
        tasks.map((t) =>
          (t as any).contractor_id === editing.id ? { ...t, contractor_id: null } : t
        )
      );
      setHistory(
        history.map((h) =>
          (h as any).contractor_id === editing.id ? { ...h, contractor_id: null } : h
        )
      );
      setDocuments(
        documents.map((d) =>
          (d as any).contractor_id === editing.id ? { ...d, contractor_id: null } : d
        )
      );
      setAppliances(
        appliances.map((a) =>
          (a as any).contractor_id === editing.id ? { ...a, contractor_id: null } : a
        )
      );
      toast.success('Deleted');
      router.push('/contractors');
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete');
    } finally {
      setBusy(false);
    }
  };

  // Linked items for the profile sidebar
  const linkedTasks = useMemo<Task[]>(
    () =>
      editing
        ? tasks.filter((t) => (t as any).contractor_id === editing.id)
        : [],
    [tasks, editing]
  );
  const linkedHistory = useMemo<TaskHistory[]>(
    () =>
      editing
        ? history.filter((h) => (h as any).contractor_id === editing.id)
        : [],
    [history, editing]
  );
  const linkedDocuments = useMemo<Document[]>(
    () =>
      editing
        ? documents.filter((d) => (d as any).contractor_id === editing.id)
        : [],
    [documents, editing]
  );
  const linkedAppliances = useMemo<Appliance[]>(
    () =>
      editing
        ? appliances.filter((a) => (a as any).contractor_id === editing.id)
        : [],
    [appliances, editing]
  );
  const totalSpent = useMemo(
    () => linkedHistory.reduce((sum, h) => sum + (h.cost || 0), 0),
    [linkedHistory]
  );

  // ============================================================
  // Detect-from-notes importer state
  // ============================================================
  const [detectOpen, setDetectOpen] = useState(false);
  const [detections, setDetections] = useState<ContractorDetection[]>([]);
  // The user can edit each name and tick / un-tick it before import.
  const [detectChoices, setDetectChoices] = useState<
    Record<string, { include: boolean; name: string }>
  >({});
  const [importing, setImporting] = useState(false);

  // Recompute the candidate detection list whenever the source data
  // changes, so opening the sheet always reflects the latest notes.
  const allDetections = useMemo(
    () =>
      detectContractorsFromNotes({
        history,
        tasks,
        appliances,
        documents,
        existingContractors: contractors,
      }),
    [history, tasks, appliances, documents, contractors]
  );

  const openDetect = () => {
    setDetections(allDetections);
    const initial: Record<string, { include: boolean; name: string }> = {};
    for (const d of allDetections) {
      // Use the lowercase name as the stable key — the detector
      // dedupes on it too.
      initial[d.name.toLowerCase()] = { include: true, name: d.name };
    }
    setDetectChoices(initial);
    setDetectOpen(true);
  };

  const importDetected = async () => {
    if (!home) return;
    const picked = detections.filter(
      (d) => detectChoices[d.name.toLowerCase()]?.include
    );
    if (picked.length === 0) {
      setDetectOpen(false);
      return;
    }
    setImporting(true);
    try {
      // Create contractors first.
      const insertRows = picked.map((d) => ({
        home_id: home.id,
        name: detectChoices[d.name.toLowerCase()]?.name?.trim() || d.name,
        phone: d.phone,
        updated_at: new Date().toISOString(),
      }));
      const { data: inserted, error: insertErr } = await supabase
        .from('contractors')
        .insert(insertRows as any)
        .select();
      if (insertErr) throw insertErr;
      const newRows = (inserted || []) as Contractor[];

      // Map detection → newly-created contractor, by index (insert order
      // matches input order in Postgres). Builders are PostgrestFilter-
      // Builder; they're thenable at runtime so Promise.allSettled just
      // works — we sidestep TS's stricter Promise<T>[] typing.
      const updates: any[] = [];
      const taskUpdates: Task[] = [...tasks];
      const historyUpdates: TaskHistory[] = [...history];
      const docUpdates: Document[] = [...documents];
      const applianceUpdates: Appliance[] = [...appliances];

      picked.forEach((d, i) => {
        const created = newRows[i];
        if (!created) return;
        for (const src of d.sources) {
          if (src.kind === 'history') {
            updates.push(
              supabase
                .from('task_history')
                .update({ contractor_id: created.id } as any)
                .eq('id', src.id)
            );
            const idx = historyUpdates.findIndex((h) => h.id === src.id);
            if (idx >= 0)
              historyUpdates[idx] = { ...historyUpdates[idx], contractor_id: created.id } as any;
          } else if (src.kind === 'task') {
            updates.push(
              supabase
                .from('tasks')
                .update({ contractor_id: created.id, updated_at: new Date().toISOString() } as any)
                .eq('id', src.id)
            );
            const idx = taskUpdates.findIndex((t) => t.id === src.id);
            if (idx >= 0)
              taskUpdates[idx] = { ...taskUpdates[idx], contractor_id: created.id } as any;
          } else if (src.kind === 'document') {
            updates.push(
              supabase
                .from('documents')
                .update({ contractor_id: created.id, updated_at: new Date().toISOString() } as any)
                .eq('id', src.id)
            );
            const idx = docUpdates.findIndex((dd) => dd.id === src.id);
            if (idx >= 0)
              docUpdates[idx] = { ...docUpdates[idx], contractor_id: created.id } as any;
          } else if (src.kind === 'appliance') {
            updates.push(
              supabase
                .from('appliances')
                .update({ contractor_id: created.id } as any)
                .eq('id', src.id)
            );
            const idx = applianceUpdates.findIndex((a) => a.id === src.id);
            if (idx >= 0)
              applianceUpdates[idx] = { ...applianceUpdates[idx], contractor_id: created.id } as any;
          }
        }
      });

      await Promise.allSettled(updates);

      // Local store updates so the UI reflects the new links right
      // away (realtime will eventually catch up but this avoids the
      // post-import lag).
      setContractors(
        [...contractors, ...newRows].sort((a, b) =>
          (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' })
        )
      );
      setTasks(taskUpdates);
      setHistory(historyUpdates);
      setDocuments(docUpdates);
      setAppliances(applianceUpdates);

      const linkCount = picked.reduce((sum, d) => sum + d.sources.length, 0);
      toast.success(
        `Imported ${picked.length} contractor${picked.length === 1 ? '' : 's'} · linked ${linkCount} ${linkCount === 1 ? 'row' : 'rows'}`
      );
      setDetectOpen(false);
    } catch (err: any) {
      toast.error(err.message || 'Import failed');
    } finally {
      setImporting(false);
    }
  };

  // ============================================================
  // Form (create / edit / view) — shown when ?new=1 or ?edit=id
  // ============================================================
  if (showForm) {
    return (
      <div>
        <PageHeader
          title={editing ? editing.name : 'New Contractor'}
          subtitle={editing?.company || undefined}
          back
          onBack={closeForm}
          rightAction={
            editing && !editMode ? (
              <button
                onClick={() => setEditMode(true)}
                className="px-3 py-1.5 rounded-full text-xs font-semibold bg-brand-50 text-brand-600 active:bg-brand-100 border border-brand-200"
              >
                ✏️ Edit
              </button>
            ) : (
              <button
                onClick={save}
                disabled={busy || !draft.name.trim()}
                className="px-3 py-1.5 rounded-full text-xs font-semibold bg-brand-500 text-white active:bg-brand-600 disabled:opacity-50"
              >
                {busy ? 'Saving…' : 'Save'}
              </button>
            )
          }
        />

        <div className="px-4 py-4 space-y-5 md:max-w-2xl md:mx-auto">
          {/* Quick contact strip — shown on the profile when not editing
              and at least one channel is filled in. */}
          {editing && !editMode && (
            (editing.phone || editing.email || editing.website) && (
              <div className="ios-card overflow-hidden">
                <div className="grid grid-cols-3 divide-x divide-gray-100">
                  {editing.phone && (
                    <a
                      href={`tel:${editing.phone.replace(/\D/g, '')}`}
                      className="flex flex-col items-center justify-center py-3 active:bg-gray-50 md:hover:bg-gray-50 transition-colors"
                    >
                      <Phone size={20} className="text-brand-500 mb-1" />
                      <span className="text-micro font-semibold uppercase tracking-wider text-ink-secondary">Call</span>
                    </a>
                  )}
                  {editing.email && (
                    <a
                      href={`mailto:${editing.email}`}
                      className="flex flex-col items-center justify-center py-3 active:bg-gray-50 md:hover:bg-gray-50 transition-colors"
                    >
                      <Mail size={20} className="text-brand-500 mb-1" />
                      <span className="text-micro font-semibold uppercase tracking-wider text-ink-secondary">Email</span>
                    </a>
                  )}
                  {editing.website && (
                    <a
                      href={normalizeUrl(editing.website)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex flex-col items-center justify-center py-3 active:bg-gray-50 md:hover:bg-gray-50 transition-colors"
                    >
                      <Globe size={20} className="text-brand-500 mb-1" />
                      <span className="text-micro font-semibold uppercase tracking-wider text-ink-secondary">Site</span>
                    </a>
                  )}
                </div>
              </div>
            )
          )}

          {/* Edit form fields. The same fields are used in both create
              and edit modes; the parent header swaps Save/Edit. */}
          <fieldset disabled={!editMode} className="m-0 p-0 border-0 min-w-0 space-y-4 disabled:opacity-100">
            <div>
              <label className="text-micro font-semibold text-ink-secondary uppercase tracking-wider mb-2 block">
                Name *
              </label>
              <input
                type="text"
                value={draft.name}
                onChange={(e) => update('name', e.target.value)}
                placeholder="e.g. Mario Tolentino"
                className="ios-input"
                maxLength={120}
                autoFocus={!editing}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-micro font-semibold text-ink-secondary uppercase tracking-wider mb-2 block">
                  Company
                </label>
                <input
                  type="text"
                  value={draft.company}
                  onChange={(e) => update('company', e.target.value)}
                  placeholder="Optional"
                  className="ios-input"
                  maxLength={120}
                />
              </div>
              <div>
                <label className="text-micro font-semibold text-ink-secondary uppercase tracking-wider mb-2 block">
                  Trade
                </label>
                <input
                  type="text"
                  value={draft.category}
                  onChange={(e) => update('category', e.target.value)}
                  placeholder="Plumber, Cleaner, Lawn…"
                  className="ios-input"
                  maxLength={60}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-micro font-semibold text-ink-secondary uppercase tracking-wider mb-2 block">
                  Phone
                </label>
                <input
                  type="tel"
                  value={draft.phone}
                  onChange={(e) => update('phone', e.target.value)}
                  placeholder="(919) 555-0123"
                  className="ios-input"
                  maxLength={40}
                />
              </div>
              <div>
                <label className="text-micro font-semibold text-ink-secondary uppercase tracking-wider mb-2 block">
                  Email
                </label>
                <input
                  type="email"
                  value={draft.email}
                  onChange={(e) => update('email', e.target.value)}
                  placeholder="name@company.com"
                  className="ios-input"
                  maxLength={120}
                />
              </div>
            </div>
            <div>
              <label className="text-micro font-semibold text-ink-secondary uppercase tracking-wider mb-2 block">
                Website
              </label>
              <input
                type="text"
                value={draft.website}
                onChange={(e) => update('website', e.target.value)}
                placeholder="company.com"
                className="ios-input"
                maxLength={200}
              />
            </div>
            <div>
              <label className="text-micro font-semibold text-ink-secondary uppercase tracking-wider mb-2 block">
                Address
              </label>
              <input
                type="text"
                value={draft.address}
                onChange={(e) => update('address', e.target.value)}
                placeholder="Optional"
                className="ios-input"
                maxLength={200}
              />
            </div>
            <div>
              <label className="text-micro font-semibold text-ink-secondary uppercase tracking-wider mb-2 block">
                Notes
              </label>
              <textarea
                value={draft.notes}
                onChange={(e) => update('notes', e.target.value)}
                placeholder="Hours, license number, references…"
                className="ios-input resize-none"
                rows={3}
                maxLength={1000}
              />
            </div>
          </fieldset>

          {/* Linked items — only on the profile (existing contractor)
              and only when not in edit mode. Each section is hidden
              when empty so a fresh contractor doesn't show four blank
              cards. */}
          {editing && !editMode && (
            <>
              {(linkedTasks.length > 0 || linkedHistory.length > 0 || totalSpent > 0) && (
                <div>
                  <p className="section-header">Activity</p>
                  <div className="mx-0 ios-card overflow-hidden">
                    <div className="grid grid-cols-3 divide-x divide-gray-100">
                      <div className="p-3 text-center">
                        <p className="text-headline font-bold text-brand-600">
                          {linkedTasks.length}
                        </p>
                        <p className="text-micro font-semibold uppercase tracking-wider text-ink-tertiary">
                          Pending
                        </p>
                      </div>
                      <div className="p-3 text-center">
                        <p className="text-headline font-bold text-status-green">
                          {linkedHistory.length}
                        </p>
                        <p className="text-micro font-semibold uppercase tracking-wider text-ink-tertiary">
                          Completed
                        </p>
                      </div>
                      <div className="p-3 text-center">
                        <p className="text-headline font-bold text-emerald-600">
                          {totalSpent > 0 ? formatCurrency(totalSpent) : '—'}
                        </p>
                        <p className="text-micro font-semibold uppercase tracking-wider text-ink-tertiary">
                          Spent
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {linkedTasks.length > 0 && (
                <LinkedSection title="Open Tasks" icon={Hammer}>
                  {linkedTasks.map((t) => (
                    <Link
                      key={t.id}
                      href={`/add-task?edit=${t.id}`}
                      className="ios-list-item w-full"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-body font-medium truncate">{t.title}</p>
                        <p className="text-caption text-ink-tertiary">
                          {t.due_date
                            ? `Due ${format(parseISO(t.due_date), 'MMM d, yyyy')}`
                            : 'No due date'}
                          {t.estimated_cost ? ` · ${formatCurrency(t.estimated_cost)}` : ''}
                        </p>
                      </div>
                      <ChevronRight size={16} className="text-ink-tertiary" />
                    </Link>
                  ))}
                </LinkedSection>
              )}

              {linkedHistory.length > 0 && (
                <LinkedSection title="Past Jobs" icon={Clock}>
                  {linkedHistory.slice(0, 8).map((h) => (
                    <div key={h.id} className="ios-list-item">
                      <div className="flex-1 min-w-0">
                        <p className="text-body font-medium truncate">{h.title}</p>
                        <p className="text-caption text-ink-tertiary">
                          {format(parseISO(h.completed_at), 'MMM d, yyyy')}
                          {h.cost ? ` · ${formatCurrency(h.cost)}` : ''}
                        </p>
                      </div>
                    </div>
                  ))}
                  {linkedHistory.length > 8 && (
                    <Link
                      href="/history"
                      className="block px-4 py-2.5 text-caption font-semibold text-brand-500 active:bg-gray-50 md:hover:bg-gray-50 transition-colors text-center"
                    >
                      View all {linkedHistory.length} →
                    </Link>
                  )}
                </LinkedSection>
              )}

              {linkedDocuments.length > 0 && (
                <LinkedSection title="Documents" icon={FileText}>
                  {linkedDocuments.map((d) => (
                    <Link
                      key={d.id}
                      href={`/documents?edit=${d.id}`}
                      className="ios-list-item w-full"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-body font-medium truncate">{d.title || d.file_name}</p>
                        <p className="text-caption text-ink-tertiary">
                          {d.category || 'Uncategorized'}
                        </p>
                      </div>
                      <ChevronRight size={16} className="text-ink-tertiary" />
                    </Link>
                  ))}
                </LinkedSection>
              )}

              {linkedAppliances.length > 0 && (
                <LinkedSection title="Appliances Serviced" icon={Package}>
                  {linkedAppliances.map((a) => (
                    <Link
                      key={a.id}
                      href={`/appliances?edit=${a.id}`}
                      className="ios-list-item w-full"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-body font-medium truncate">{a.name}</p>
                        <p className="text-caption text-ink-tertiary">
                          {a.category || 'Other'}{a.location ? ` · ${a.location}` : ''}
                        </p>
                      </div>
                      <ChevronRight size={16} className="text-ink-tertiary" />
                    </Link>
                  ))}
                </LinkedSection>
              )}

              <button
                onClick={remove}
                disabled={busy}
                className="w-full py-3 text-status-red font-semibold text-body disabled:opacity-50"
              >
                Delete Contractor
              </button>
            </>
          )}
        </div>
      </div>
    );
  }

  // ============================================================
  // List view
  // ============================================================
  return (
    <div>
      <PageHeader
        title="Contractors"
        subtitle={
          contractors.length === 0
            ? 'No one saved yet'
            : `${contractors.length} ${contractors.length === 1 ? 'contractor' : 'contractors'}`
        }
        back
        rightAction={
          <button
            onClick={startNew}
            aria-label="Add contractor"
            className="text-brand-500 active:scale-95 transition-transform"
          >
            <Plus size={24} />
          </button>
        }
      />
      <div className="px-4 py-4 space-y-3 md:max-w-2xl md:mx-auto">
        {/* "Found in past notes" banner — surfaces when the heuristic
            spots possible contractors in notes the user already wrote
            (e.g. "Mario Tolentino (919) 390-4202" on a history entry)
            and they haven't imported them yet. */}
        {contractors.length > 0 && allDetections.length > 0 && (
          <button
            onClick={openDetect}
            className="w-full rounded-ios bg-gradient-warm p-3 flex items-center gap-3 text-left active:scale-[0.99] md:hover:shadow-card-hover transition-all"
          >
            <div className="w-9 h-9 rounded-ios bg-white/70 flex items-center justify-center text-amber-600 flex-shrink-0">
              <Sparkles size={18} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-body font-semibold text-ink-primary">
                Found {allDetections.length} possible{' '}
                {allDetections.length === 1 ? 'contractor' : 'contractors'} in your past notes
              </p>
              <p className="text-caption text-ink-secondary">
                Tap to review and import
              </p>
            </div>
            <ChevronRight size={16} className="text-ink-tertiary" />
          </button>
        )}
        {contractors.length > 0 && (
          <>
            <div className="relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-tertiary" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search contractors…"
                className="ios-input pl-9"
              />
            </div>
            {contractors.length > 1 && (
              <div className="flex items-center gap-2 text-micro text-ink-tertiary">
                <span className="font-semibold uppercase tracking-wider">Sort</span>
                <div className="flex gap-1">
                  {([
                    { key: 'name',     label: 'Name' },
                    { key: 'category', label: 'Trade' },
                    { key: 'recent',   label: 'Recent' },
                  ] as const).map(({ key, label }) => (
                    <button
                      key={key}
                      onClick={() => setSortBy(key)}
                      className={`px-2.5 py-1 rounded-full text-caption font-medium transition-colors ${
                        sortBy === key
                          ? 'bg-brand-50 text-brand-600'
                          : 'text-ink-secondary md:hover:bg-gray-100 active:bg-gray-100'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {contractors.length === 0 ? (
          <div className="rounded-ios-xl bg-gradient-warm p-7 text-center">
            <div className="text-5xl mb-3" aria-hidden="true">🛠️</div>
            <p className="text-headline font-bold text-ink-primary tracking-[-0.02em]">
              Save your trusted vendors
            </p>
            <p className="text-caption text-ink-secondary mt-1.5 mb-5 max-w-sm mx-auto">
              Plumbers, cleaners, electricians, lawn services. Link them to
              tasks and appliances so you always know who you've used.
            </p>
            <div className="flex flex-col sm:flex-row gap-2 justify-center">
              <button
                onClick={startNew}
                className="px-5 py-2.5 rounded-ios bg-brand-500 text-white text-body font-semibold active:bg-brand-600 active:scale-[0.98] md:hover:bg-brand-600 transition-all shadow-card"
              >
                Add your first contractor
              </button>
              {allDetections.length > 0 && (
                <button
                  onClick={openDetect}
                  className="px-5 py-2.5 rounded-ios bg-white/70 backdrop-blur-sm text-brand-600 text-body font-semibold active:bg-white active:scale-[0.98] md:hover:bg-white transition-all inline-flex items-center justify-center gap-2"
                >
                  <Sparkles size={16} />
                  Find {allDetections.length} from past notes
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="ios-card overflow-hidden">
            {visible.map((c) => (
              <Link
                key={c.id}
                href={`/contractors?edit=${c.id}`}
                className="ios-list-item w-full"
              >
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <div className="w-10 h-10 rounded-full bg-brand-50 flex items-center justify-center text-brand-500 flex-shrink-0">
                    <Briefcase size={18} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-body font-semibold truncate">{c.name}</p>
                    <p className="text-caption text-ink-tertiary truncate">
                      {[c.category, c.company].filter(Boolean).join(' · ') ||
                        fmtPhone(c.phone) ||
                        c.email ||
                        'Tap to add details'}
                    </p>
                  </div>
                </div>
                <ChevronRight size={16} className="text-ink-tertiary" />
              </Link>
            ))}
            {visible.length === 0 && search.trim() && (
              <div className="px-4 py-6 text-caption text-ink-tertiary text-center">
                No matches for &ldquo;{search}&rdquo;
              </div>
            )}
          </div>
        )}
      </div>

      {/* Detect-from-notes modal. Lists every detected name with the
          source row count + an editable name field + an include
          checkbox. Importing creates contractors and back-fills
          contractor_id on every linked source row. */}
      {detectOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
          onClick={() => !importing && setDetectOpen(false)}
        >
          <div
            aria-hidden="true"
            className="absolute inset-0 animate-fade-in"
            style={{
              backgroundColor: 'rgba(0, 0, 0, 0.7)',
              WebkitBackdropFilter: 'blur(20px)',
              backdropFilter: 'blur(20px)',
            }}
          />
          <div
            className="relative bg-white rounded-ios-xl w-full max-w-md shadow-elevated overflow-hidden animate-slide-up flex flex-col"
            onClick={(e) => e.stopPropagation()}
            style={{ maxHeight: 'calc(100vh - 4rem)' }}
          >
            <div className="flex justify-center pt-2.5 sm:hidden">
              <div className="w-9 h-1 rounded-full bg-gray-300" />
            </div>
            <div className="px-5 pt-3 pb-2 flex items-center justify-between">
              <div>
                <p className="text-title font-semibold flex items-center gap-1.5">
                  <Sparkles size={16} className="text-amber-500" />
                  Found in past notes
                </p>
                <p className="text-caption text-ink-tertiary">
                  Pulled from your task, history, document, and appliance notes
                </p>
              </div>
              <button
                onClick={() => !importing && setDetectOpen(false)}
                aria-label="Close"
                className="p-1 -mr-1 text-ink-tertiary tap-shrink"
              >
                <X size={20} />
              </button>
            </div>
            {detections.length === 0 ? (
              <div className="px-5 py-10 text-center text-caption text-ink-tertiary">
                Nothing detected — your existing contractors might already
                cover everything.
              </div>
            ) : (
              <div className="px-2 pb-2 overflow-y-auto flex-1">
                {detections.map((d) => {
                  const key = d.name.toLowerCase();
                  const choice = detectChoices[key] || { include: true, name: d.name };
                  return (
                    <label
                      key={key}
                      className={`flex items-start gap-3 px-3 py-3 rounded-ios cursor-pointer transition-colors ${
                        choice.include
                          ? 'bg-brand-50/50'
                          : 'active:bg-gray-50 md:hover:bg-gray-50'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={choice.include}
                        onChange={(e) =>
                          setDetectChoices((c) => ({
                            ...c,
                            [key]: { ...choice, include: e.target.checked },
                          }))
                        }
                        className="mt-1.5 w-4 h-4 accent-brand-500 flex-shrink-0"
                      />
                      <div className="flex-1 min-w-0 space-y-1">
                        <input
                          type="text"
                          value={choice.name}
                          onChange={(e) =>
                            setDetectChoices((c) => ({
                              ...c,
                              [key]: { ...choice, name: e.target.value },
                            }))
                          }
                          className="w-full text-body font-semibold bg-transparent outline-none border-b border-transparent focus:border-brand-300"
                          placeholder="Contractor name"
                        />
                        {d.phone && (
                          <p className="text-caption text-ink-secondary flex items-center gap-1">
                            <Phone size={11} className="text-ink-tertiary" />
                            {d.phone}
                          </p>
                        )}
                        <p className="text-micro text-ink-tertiary">
                          From {d.sources.length}{' '}
                          {d.sources.length === 1 ? 'entry' : 'entries'}
                          {' · '}
                          {d.sources.slice(0, 2).map((s) => s.title).join(', ')}
                          {d.sources.length > 2 ? ` +${d.sources.length - 2}` : ''}
                        </p>
                      </div>
                    </label>
                  );
                })}
              </div>
            )}
            <div className="px-4 py-3 bg-gray-50 border-t border-gray-100 flex gap-2">
              <button
                onClick={() => !importing && setDetectOpen(false)}
                disabled={importing}
                className="flex-1 py-2.5 rounded-ios bg-white border border-gray-200 text-sm font-semibold text-ink-secondary active:bg-gray-50 md:hover:bg-gray-50 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={importDetected}
                disabled={
                  importing ||
                  detections.length === 0 ||
                  !Object.values(detectChoices).some((c) => c.include)
                }
                className="flex-1 py-2.5 rounded-ios bg-brand-500 text-white text-sm font-semibold active:bg-brand-600 active:scale-[0.98] transition-all disabled:opacity-50 inline-flex items-center justify-center gap-1.5"
              >
                <Check size={14} strokeWidth={2.5} />
                {importing
                  ? 'Importing…'
                  : `Import ${
                      Object.values(detectChoices).filter((c) => c.include).length
                    }`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Small reusable section heading + card wrapper used for each linked
// list on the profile (Open Tasks, Past Jobs, Documents, Appliances).
function LinkedSection({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: any;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="section-header flex items-center">
        <Icon size={12} className="mr-1.5 text-ink-secondary" />
        {title}
      </p>
      <div className="mx-0 ios-card overflow-hidden">{children}</div>
    </div>
  );
}

export default function ContractorsPage() {
  return (
    <Suspense fallback={
      <div className="flex justify-center py-20">
        <span className="text-ink-tertiary text-caption">Loading…</span>
      </div>
    }>
      <ContractorsPageInner />
    </Suspense>
  );
}
