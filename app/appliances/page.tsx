'use client';
import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useStore } from '@/lib/store';
import { createClient } from '@/lib/supabase-browser';
import PageHeader from '@/components/layout/PageHeader';
import { Appliance } from '@/lib/types';
import { Plus, X, Package, ChevronRight, FileText } from 'lucide-react';
import { format, parseISO, isPast, differenceInDays } from 'date-fns';
import toast from 'react-hot-toast';
import { confirm } from '@/lib/confirm';

const APPLIANCE_CATEGORIES = [
  'Kitchen',
  'Laundry',
  'HVAC',
  'Plumbing',
  'Outdoor',
  'Garage',
  'Other',
];

export default function AppliancesPage() {
  const { appliances, home, setAppliances, documents, tasks, history } = useStore();
  const supabase = createClient();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Appliance | null>(null);
  const [editMode, setEditMode] = useState(true);
  const [manualDocId, setManualDocId] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: '', manufacturer: '', model_number: '', serial_number: '',
    category: '', location: '', installation_date: '', warranty_expiration: '',
    purchase_price: '', notes: '',
  });

  // Existing locations across this home, used to populate the
  // location autocomplete so users see "Kitchen" as a real option
  // instead of recreating "kitchen", "Kitchen ", etc.
  const knownLocations = Array.from(
    new Set(
      appliances
        .map((a) => (a.location || '').trim())
        .filter((s) => s.length > 0)
    )
  ).sort();

  useEffect(() => {
    const raw = sessionStorage.getItem('appliancePrefill');
    if (!raw) return;
    sessionStorage.removeItem('appliancePrefill');
    try {
      const p = JSON.parse(raw);
      setForm((f) => ({
        ...f,
        name: p.name || '',
        manufacturer: p.manufacturer || '',
        model_number: p.model_number || '',
        serial_number: p.serial_number || '',
        category: p.category || '',
        notes: p.notes || '',
        installation_date: p.installation_date || '',
        warranty_expiration: p.warranty_expiration || '',
      }));
      if (p.manual_document_id) setManualDocId(p.manual_document_id);
      setShowForm(true);
      toast('Review the details, then save.', { icon: '✏️' });
    } catch {}
  }, []);

  useEffect(() => {
    if (searchParams.get('new') === '1') {
      setShowForm(true);
      router.replace('/appliances');
      return;
    }
    const editId = searchParams.get('edit');
    if (editId) {
      const target = appliances.find((a) => a.id === editId);
      if (target) {
        openEdit(target);
        router.replace('/appliances');
      }
    }
  }, [searchParams, router, appliances]);

  const resetForm = () => {
    setForm({
      name: '', manufacturer: '', model_number: '', serial_number: '',
      category: '', location: '', installation_date: '', warranty_expiration: '',
      purchase_price: '', notes: '',
    });
    setManualDocId(null);
    setEditing(null);
    setShowForm(false);
    setEditMode(true);
  };

  const openEdit = (a: Appliance) => {
    setEditing(a);
    setForm({
      name: a.name, manufacturer: a.manufacturer || '', model_number: a.model_number || '',
      serial_number: a.serial_number || '', category: a.category || '', location: a.location || '',
      installation_date: a.installation_date || '', warranty_expiration: a.warranty_expiration || '',
      purchase_price: a.purchase_price?.toString() || '', notes: a.notes || '',
    });
    setManualDocId(a.manual_document_id || null);
    setShowForm(true);
    setEditMode(false);
  };

  // Reset the form back to the loaded appliance values and exit edit
  // mode. Used by the Cancel button so users can back out of an edit
  // without silently discarding changes via the back arrow.
  const cancelEdit = () => {
    if (!editing) {
      resetForm();
      return;
    }
    setForm({
      name: editing.name,
      manufacturer: editing.manufacturer || '',
      model_number: editing.model_number || '',
      serial_number: editing.serial_number || '',
      category: editing.category || '',
      location: editing.location || '',
      installation_date: editing.installation_date || '',
      warranty_expiration: editing.warranty_expiration || '',
      purchase_price: editing.purchase_price?.toString() || '',
      notes: editing.notes || '',
    });
    setManualDocId(editing.manual_document_id || null);
    setEditMode(false);
  };

  // All documents linked to the appliance currently being edited.
  // Includes both the original source manual (manual_document_id) and any
  // docs that point at this appliance via appliance_id.
  const linkedDocuments = (() => {
    if (!editing && !manualDocId) return [];
    const ids = new Set<string>();
    if (manualDocId) ids.add(manualDocId);
    if (editing) {
      for (const d of documents) {
        if ((d as any).appliance_id === editing.id) ids.add(d.id);
      }
    }
    return Array.from(ids)
      .map((id) => documents.find((d) => d.id === id))
      .filter(Boolean)
      .sort((a: any, b: any) =>
        (a.title || '').localeCompare(b.title || '', undefined, { sensitivity: 'base' })
      ) as typeof documents;
  })();

  const attachableDocuments = editing
    ? documents
        .filter((d: any) => d.appliance_id !== editing.id && d.id !== manualDocId)
        .sort((a: any, b: any) =>
          (a.title || '').localeCompare(b.title || '', undefined, { sensitivity: 'base' })
        )
    : [];

  const attachDocument = async (docId: string) => {
    if (!editing || !docId) return;
    const { error } = await supabase
      .from('documents')
      .update({ appliance_id: editing.id, updated_at: new Date().toISOString() })
      .eq('id', docId);
    if (error) {
      toast.error('Could not link document');
      return;
    }
    // Update Zustand store so the form re-renders with the new link.
    const { setDocuments } = useStore.getState();
    setDocuments(
      useStore.getState().documents.map((d: any) =>
        d.id === docId ? { ...d, appliance_id: editing.id } : d
      )
    );
    toast.success('Document linked');
  };

  const handleSave = async () => {
    if (!form.name.trim() || !home) return;

    const payload = {
      home_id: home.id,
      name: form.name.trim(),
      manufacturer: form.manufacturer || null,
      model_number: form.model_number || null,
      serial_number: form.serial_number || null,
      category: form.category || null,
      location: form.location || null,
      installation_date: form.installation_date || null,
      warranty_expiration: form.warranty_expiration || null,
      purchase_price: form.purchase_price ? parseFloat(form.purchase_price) : null,
      notes: form.notes || null,
      manual_document_id: manualDocId || null,
    };

    try {
      if (editing) {
        const { data, error } = await supabase
          .from('appliances').update(payload).eq('id', editing.id).select().single();
        if (error) throw error;
        setAppliances(appliances.map((a) => (a.id === editing.id ? data : a)));
        toast.success('Updated');
      } else {
        const { data, error } = await supabase
          .from('appliances').insert(payload).select().single();
        if (error) throw error;
        setAppliances([...appliances, data]);
        // If this appliance was created from a source document, link the
        // document back to it so the doc shows up under the appliance.
        if (manualDocId) {
          await supabase
            .from('documents')
            .update({ appliance_id: (data as any).id, updated_at: new Date().toISOString() })
            .eq('id', manualDocId);
        }
        toast.success('Appliance added');
      }
      resetForm();
    } catch (err: any) {
      toast.error(err.message || 'Failed');
    }
  };

  const handleDelete = async () => {
    if (!editing) return;
    const ok = await confirm({
      title: `Delete "${editing.name}"?`,
      message: 'This cannot be undone.',
      confirmLabel: 'Delete',
      destructive: true,
    });
    if (!ok) return;
    const { error } = await supabase.from('appliances').delete().eq('id', editing.id);
    if (error) {
      toast.error('Failed to delete');
    } else {
      setAppliances(appliances.filter((a) => a.id !== editing.id));
      toast.success('Deleted');
      resetForm();
    }
  };

  const u = (key: string, val: string) => setForm((f) => ({ ...f, [key]: val }));

  const warrantyStatus = (expDate: string | null) => {
    if (!expDate) return null;
    const exp = parseISO(expDate);
    const daysLeft = differenceInDays(exp, new Date());
    if (daysLeft <= 0) return { label: 'Expired', color: 'text-status-red bg-red-50' };
    if (daysLeft <= 90) return { label: `${daysLeft}d left`, color: 'text-status-yellow bg-amber-50' };
    return { label: 'Active', color: 'text-status-green bg-green-50' };
  };

  if (showForm) {
    return (
      <div>
        <PageHeader
          title={editing ? 'Appliance' : 'Add Appliance'}
          back
          onBack={resetForm}
          rightAction={
            editing ? (
              <button
                onClick={async () => {
                  if (editMode) await handleSave();
                  else setEditMode(true);
                }}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                  editMode
                    ? 'bg-brand-500 text-white active:bg-brand-600'
                    : 'bg-brand-50 text-brand-600 active:bg-brand-100 border border-brand-200'
                }`}
              >
                {editMode ? 'Save' : '✏️ Edit'}
              </button>
            ) : (
              <button onClick={resetForm} className="text-brand-500"><X size={22} /></button>
            )
          }
        />
        <div className="px-4 py-4 space-y-3">
          {editing && (
            <div>
              <p className="text-xs text-ink-secondary mb-1 block">
                Linked documents
              </p>
              <div className="ios-card overflow-hidden">
                {linkedDocuments.length > 0 ? (
                  linkedDocuments.map((d) => {
                    const unlink = async (e: React.MouseEvent) => {
                      e.stopPropagation();
                      e.preventDefault();
                      if (!editing) return;
                      const ok = await confirm({
                        title: `Unlink "${d.title}"?`,
                        message: 'It stays in Documents — just no longer attached to this appliance.',
                        confirmLabel: 'Unlink',
                      });
                      if (!ok) return;
                      const isManual = manualDocId === d.id;
                      const { error } = await supabase
                        .from('documents')
                        .update({
                          appliance_id: null,
                          updated_at: new Date().toISOString(),
                        })
                        .eq('id', d.id);
                      if (error) {
                        toast.error('Could not unlink');
                        return;
                      }
                      // Also clear the manual_document_id pointer if this
                      // doc was the one we extracted appliance details from.
                      if (isManual) {
                        await supabase
                          .from('appliances')
                          .update({ manual_document_id: null })
                          .eq('id', editing.id);
                        setManualDocId(null);
                        setAppliances(
                          appliances.map((a) =>
                            a.id === editing.id ? { ...a, manual_document_id: null } : a
                          )
                        );
                      }
                      const { setDocuments } = useStore.getState();
                      setDocuments(
                        useStore.getState().documents.map((doc: any) =>
                          doc.id === d.id ? { ...doc, appliance_id: null } : doc
                        )
                      );
                      toast.success('Unlinked');
                    };
                    return (
                      <div key={d.id} className="ios-list-item">
                        <button
                          onClick={() => router.push(`/documents?edit=${d.id}`)}
                          className="flex items-center gap-3 flex-1 min-w-0 text-left"
                        >
                          <div className="w-9 h-9 rounded-lg bg-sky-50 text-sky-500 flex items-center justify-center flex-shrink-0">
                            <FileText size={18} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-[14px] font-medium truncate">{d.title}</p>
                            <p className="text-xs text-ink-tertiary truncate">
                              {d.category || 'Uncategorized'}
                            </p>
                          </div>
                        </button>
                        <button
                          onClick={unlink}
                          title="Unlink"
                          className="text-ink-tertiary md:hover:text-status-red active:text-status-red transition-colors p-1.5 -mr-1"
                        >
                          <X size={16} />
                        </button>
                      </div>
                    );
                  })
                ) : (
                  <div className="px-4 py-3.5 text-sm text-ink-tertiary">
                    No documents linked yet.
                  </div>
                )}
              </div>
              {attachableDocuments.length > 0 && (
                <select
                  value=""
                  onChange={(e) => {
                    if (e.target.value) attachDocument(e.target.value);
                  }}
                  className="ios-input mt-2"
                >
                  <option value="">Attach a document…</option>
                  {attachableDocuments.map((d: any) => (
                    <option key={d.id} value={d.id}>
                      {d.title}
                      {d.category ? ` · ${d.category}` : ''}
                    </option>
                  ))}
                </select>
              )}
            </div>
          )}

          <div>
            <label className="text-xs text-ink-secondary mb-1 block">Appliance name *</label>
            <input type="text" value={form.name} onChange={(e) => u('name', e.target.value)} disabled={!!editing && !editMode} className="ios-input disabled:opacity-60 disabled:cursor-not-allowed" autoFocus />
          </div>
          <div>
            <label className="text-xs text-ink-secondary mb-1 block">Manufacturer</label>
            <input type="text" value={form.manufacturer} onChange={(e) => u('manufacturer', e.target.value)} disabled={!!editing && !editMode} className="ios-input disabled:opacity-60 disabled:cursor-not-allowed" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-ink-secondary mb-1 block">Model #</label>
              <input type="text" value={form.model_number} onChange={(e) => u('model_number', e.target.value)} disabled={!!editing && !editMode} className="ios-input disabled:opacity-60 disabled:cursor-not-allowed" />
            </div>
            <div>
              <label className="text-xs text-ink-secondary mb-1 block">Serial #</label>
              <input type="text" value={form.serial_number} onChange={(e) => u('serial_number', e.target.value)} disabled={!!editing && !editMode} className="ios-input disabled:opacity-60 disabled:cursor-not-allowed" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-ink-secondary mb-1 block">Category</label>
              <select
                value={form.category}
                onChange={(e) => u('category', e.target.value)}
                disabled={!!editing && !editMode}
                className="ios-input disabled:opacity-60 disabled:cursor-not-allowed"
              >
                <option value="">Select…</option>
                {APPLIANCE_CATEGORIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
                {form.category && !APPLIANCE_CATEGORIES.includes(form.category) && (
                  <option value={form.category}>{form.category}</option>
                )}
              </select>
            </div>
            <div>
              <label className="text-xs text-ink-secondary mb-1 block">Location</label>
              <input
                type="text"
                value={form.location}
                onChange={(e) => u('location', e.target.value)}
                disabled={!!editing && !editMode}
                list="appliance-locations"
                placeholder="e.g. Kitchen"
                className="ios-input disabled:opacity-60 disabled:cursor-not-allowed"
              />
              <datalist id="appliance-locations">
                {knownLocations.map((loc) => (
                  <option key={loc} value={loc} />
                ))}
              </datalist>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-ink-secondary mb-1 block">Installed</label>
              <input type="date" value={form.installation_date} onChange={(e) => u('installation_date', e.target.value)} disabled={!!editing && !editMode} className="ios-input disabled:opacity-60 disabled:cursor-not-allowed" />
            </div>
            <div>
              <label className="text-xs text-ink-secondary mb-1 block">Warranty Expires</label>
              <input type="date" value={form.warranty_expiration} onChange={(e) => u('warranty_expiration', e.target.value)} disabled={!!editing && !editMode} className="ios-input disabled:opacity-60 disabled:cursor-not-allowed" />
            </div>
          </div>
          <div>
            <label className="text-xs text-ink-secondary mb-1 block">Purchase price ($)</label>
            <input type="number" min="0" step="0.01" value={form.purchase_price} onChange={(e) => u('purchase_price', e.target.value)} disabled={!!editing && !editMode} className="ios-input disabled:opacity-60 disabled:cursor-not-allowed" />
          </div>
          {/* Linked tasks — every task with appliance_id == this one,
              grouped into pending vs. completed and sorted by due date.
              Tap a row to open the task edit screen. Read-only here;
              this is just an at-a-glance "what's scheduled for this
              appliance" view. */}
          {editing && (() => {
            const linked = tasks.filter((t: any) => t.appliance_id === editing.id);
            if (linked.length === 0) return null;
            const pending = linked
              .filter((t: any) => t.status !== 'completed' && t.status !== 'skipped')
              .sort((a: any, b: any) => (a.due_date || '').localeCompare(b.due_date || ''));
            const done = linked
              .filter((t: any) => t.status === 'completed')
              .sort((a: any, b: any) =>
                (b.completed_at || '').localeCompare(a.completed_at || '')
              )
              .slice(0, 5);
            return (
              <div>
                <p className="text-xs text-ink-secondary mb-1 block">
                  Linked tasks
                </p>
                <div className="ios-card overflow-hidden">
                  {pending.length === 0 && done.length === 0 ? (
                    <div className="px-4 py-3.5 text-sm text-ink-tertiary">
                      No tasks linked yet.
                    </div>
                  ) : (
                    <>
                      {pending.map((t: any) => (
                        <button
                          key={t.id}
                          onClick={() => router.push(`/add-task?edit=${t.id}`)}
                          className="ios-list-item w-full"
                        >
                          <div className="flex-1 min-w-0 text-left">
                            <p className="text-[14px] font-medium truncate">{t.title}</p>
                            <p className="text-xs text-ink-tertiary truncate">
                              {t.due_date
                                ? `Due ${new Date(t.due_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
                                : 'No due date'}
                            </p>
                          </div>
                          <ChevronRight size={16} className="text-ink-tertiary flex-shrink-0" />
                        </button>
                      ))}
                      {done.map((t: any) => (
                        <button
                          key={t.id}
                          onClick={() => router.push(`/add-task?edit=${t.id}`)}
                          className="ios-list-item w-full opacity-70"
                        >
                          <div className="flex-1 min-w-0 text-left">
                            <p className="text-[14px] font-medium truncate strike-middle text-ink-tertiary">
                              {t.title}
                            </p>
                            <p className="text-xs text-ink-tertiary truncate">
                              Completed
                              {t.completed_at
                                ? ` ${new Date(t.completed_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
                                : ''}
                            </p>
                          </div>
                          <ChevronRight size={16} className="text-ink-tertiary flex-shrink-0" />
                        </button>
                      ))}
                    </>
                  )}
                </div>
              </div>
            );
          })()}

          {/* Photo gallery — every photo from a completed task linked
              to this appliance. Read-only thumbnail wall; tap to open
              the full image in a new tab. */}
          {editing && (() => {
            const linkedTaskIds = new Set(
              tasks.filter((t: any) => t.appliance_id === editing.id).map((t) => t.id)
            );
            const photos: string[] = [];
            for (const h of history) {
              if (!h.photos || h.photos.length === 0) continue;
              if (h.task_id && linkedTaskIds.has(h.task_id)) {
                for (const u of h.photos) photos.push(u);
              }
            }
            if (photos.length === 0) return null;
            return (
              <div>
                <p className="text-xs text-ink-secondary mb-1 block">
                  Photos ({photos.length})
                </p>
                <div className="grid grid-cols-3 gap-2">
                  {photos.map((url, i) => (
                    <a
                      key={`${url}-${i}`}
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="aspect-square rounded-ios overflow-hidden bg-gray-100"
                    >
                      <img
                        src={url}
                        alt=""
                        loading="lazy"
                        className="w-full h-full object-cover"
                      />
                    </a>
                  ))}
                </div>
              </div>
            );
          })()}

          <div>
            <label className="text-xs text-ink-secondary mb-1 block">Notes</label>
            <textarea value={form.notes} onChange={(e) => u('notes', e.target.value)} rows={3} disabled={!!editing && !editMode} className="ios-input resize-none disabled:opacity-60 disabled:cursor-not-allowed" />
          </div>

          {(!editing || editMode) && (
            <button onClick={handleSave} disabled={!form.name.trim()} className="ios-button">
              {editing ? 'Update' : 'Add Appliance'}
            </button>
          )}
          {editing && editMode && (
            <>
              <button
                onClick={cancelEdit}
                className="w-full py-3 text-ink-secondary font-medium text-sm md:hover:text-ink-primary transition-colors"
              >
                Cancel
              </button>
              <button onClick={handleDelete} className="w-full py-3 text-status-red font-semibold text-sm">
                Delete Appliance
              </button>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Appliances"
        subtitle={`${appliances.length} registered`}
        back
      />

      <div className="py-2">
        {appliances.length === 0 ? (
          <div className="text-center py-16 px-8">
            <Package size={40} className="mx-auto text-ink-tertiary mb-3" />
            <p className="text-ink-secondary text-sm">No appliances yet</p>
            <p className="text-ink-tertiary text-xs mt-1">
              Track HVAC, water heater, fridge, washer/dryer, and more.
              Linking a manual auto-fills make and model.
            </p>
            <button
              onClick={() => setShowForm(true)}
              className="mt-4 px-4 py-2 rounded-ios bg-brand-500 text-white text-sm font-semibold active:bg-brand-600 md:hover:bg-brand-600 transition-colors"
            >
              + Add your first appliance
            </button>
          </div>
        ) : (
          <div className="mx-4 ios-card overflow-hidden">
            {[...appliances]
              .sort((a, b) =>
                (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' })
              )
              .map((a) => {
              const ws = warrantyStatus(a.warranty_expiration);
              return (
                <button key={a.id} onClick={() => openEdit(a)} className="ios-list-item w-full">
                  <div className="flex-1 min-w-0">
                    <p className="text-[15px] font-medium truncate">{a.name}</p>
                    {a.location && (
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-xs text-ink-tertiary">{a.location}</span>
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {ws && (
                      <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${ws.color}`}>
                        {ws.label}
                      </span>
                    )}
                    <ChevronRight size={16} className="text-ink-tertiary" />
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
