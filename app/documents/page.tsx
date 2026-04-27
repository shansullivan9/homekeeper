'use client';
import { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useStore } from '@/lib/store';
import { createClient } from '@/lib/supabase-browser';
import PageHeader from '@/components/layout/PageHeader';
import { Document } from '@/lib/types';
import {
  Plus,
  X,
  FileText,
  ChevronRight,
  Upload,
  Download,
  Search,
  Image as ImageIcon,
  FileSpreadsheet,
  File as FileIcon,
} from 'lucide-react';
import { format, parseISO, addDays, addMonths, addYears } from 'date-fns';
import toast from 'react-hot-toast';

const CATEGORIES = [
  'Insurance',
  'Deed / Title',
  'Mortgage',
  'Warranty',
  'Invoice',
  'Receipt',
  'Manual',
  'Builder Doc',
  'Inspection',
  'Tax',
  'Permit',
  'Utilities',
  'Other',
];

function formatBytes(bytes: number | null) {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fileIcon(mime: string | null) {
  if (!mime) return FileIcon;
  if (mime.startsWith('image/')) return ImageIcon;
  if (mime.includes('sheet') || mime.includes('csv') || mime.includes('excel')) return FileSpreadsheet;
  return FileText;
}

export default function DocumentsPage() {
  const {
    documents,
    home,
    setHome,
    setDocuments,
    user,
    appliances,
    setAppliances,
    tasks,
    setTasks,
    history,
    setHistory,
    categories,
  } = useStore();
  const supabase = createClient();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    if (searchParams.get('new') === '1') {
      setShowForm(true);
      router.replace('/documents');
    }
  }, [searchParams, router]);
  const [editing, setEditing] = useState<Document | null>(null);
  const [filter, setFilter] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [uploading, setUploading] = useState(false);
  const [analyzingId, setAnalyzingId] = useState<string | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [form, setForm] = useState({ title: '', category: '', notes: '' });

  // Run classify on each uploaded document. If the user didn't pick a
  // category in the form, use the classifier's pick. Always store the
  // searchable_text. Returns the documents reflecting any updates so the
  // caller can route by final category.
  const classifyAndUpdate = async (
    uploaded: Document[],
    userCategory: string | null
  ): Promise<Document[]> => {
    const { data: sess } = await supabase.auth.getSession();
    const token = sess.session?.access_token;
    if (!token || uploaded.length === 0) return uploaded;

    const t = toast.loading(
      uploaded.length === 1 ? 'Reading document…' : `Reading ${uploaded.length} documents…`
    );

    const out: Document[] = [];
    const stateUpdates: Record<string, Partial<Document>> = {};

    for (const doc of uploaded) {
      try {
        const res = await fetch('/api/documents/classify', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ documentId: doc.id }),
        });
        const json = await res.json();
        if (!res.ok || !json.ok) {
          out.push(doc);
          continue;
        }
        const finalCategory = userCategory || json.category || doc.category;
        const finalTitle = (json.title || '').trim() || doc.title;
        const patch: Record<string, any> = {
          category: finalCategory || null,
          title: finalTitle,
          searchable_text: json.searchable_text || null,
          updated_at: new Date().toISOString(),
        };
        const { data: updated } = await supabase
          .from('documents')
          .update(patch)
          .eq('id', doc.id)
          .select()
          .single();
        if (updated) {
          out.push(updated as Document);
          stateUpdates[doc.id] = updated as Document;
        } else {
          out.push(doc);
        }
      } catch {
        out.push(doc);
      }
    }

    if (Object.keys(stateUpdates).length > 0) {
      setDocuments(
        documents.map((d) =>
          stateUpdates[d.id] ? (stateUpdates[d.id] as Document) : d
        )
      );
    }
    toast.dismiss(t);
    return out;
  };

  const analyzeManual = async (doc: Document) => {
    setAnalyzingId(doc.id);
    const t = toast.loading('Reading manual…');
    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      if (!token) throw new Error('Not signed in');

      const res = await fetch('/api/manuals/extract', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ documentId: doc.id }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Could not analyze file');

      if (!json.ok) {
        toast.dismiss(t);
        toast(json.message || "This doesn't look like a manual.");
        return;
      }

      const newTitle: string = (json.document_title || '').trim();
      if (newTitle && newTitle !== doc.title) {
        const { data: updated } = await supabase
          .from('documents')
          .update({ title: newTitle, updated_at: new Date().toISOString() })
          .eq('id', doc.id)
          .select()
          .single();
        if (updated) {
          setDocuments(documents.map((d) => (d.id === doc.id ? (updated as Document) : d)));
        }
      }

      sessionStorage.setItem(
        'appliancePrefill',
        JSON.stringify({ ...json.appliance, manual_document_id: doc.id })
      );
      toast.dismiss(t);
      toast.success('Manual read — review and save the appliance');
      router.push('/appliances');
    } catch (err: any) {
      toast.dismiss(t);
      toast.error(err.message || 'Analysis failed');
    } finally {
      setAnalyzingId(null);
    }
  };

  const batchAnalyzeManuals = async (docs: Document[]) => {
    if (!home || docs.length === 0) return;
    const t = toast.loading(`Reading ${docs.length} manual${docs.length === 1 ? '' : 's'}…`);
    const { data: sess } = await supabase.auth.getSession();
    const token = sess.session?.access_token;
    if (!token) {
      toast.dismiss(t);
      toast.error('Not signed in');
      return;
    }

    const titleUpdates: Record<string, string> = {};
    const newAppliances: any[] = [];

    for (const doc of docs) {
      try {
        const res = await fetch('/api/manuals/extract', {
          method: 'POST',
          headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
          body: JSON.stringify({ documentId: doc.id }),
        });
        const json = await res.json();
        if (!res.ok || !json.ok) continue;

        const newTitle: string = (json.document_title || '').trim();
        if (newTitle && newTitle !== doc.title) {
          await supabase
            .from('documents')
            .update({ title: newTitle, updated_at: new Date().toISOString() })
            .eq('id', doc.id);
          titleUpdates[doc.id] = newTitle;
        }

        const a = json.appliance || {};
        const { data: app } = await supabase
          .from('appliances')
          .insert({
            home_id: home.id,
            name: a.name || doc.file_name,
            manufacturer: a.manufacturer || null,
            model_number: a.model_number || null,
            serial_number: a.serial_number || null,
            category: a.category || null,
            notes: a.notes || null,
            manual_document_id: doc.id,
          })
          .select()
          .single();
        if (app) newAppliances.push(app);
      } catch {
        // skip on error; keep going
      }
    }

    if (Object.keys(titleUpdates).length) {
      setDocuments(
        documents.map((d) =>
          titleUpdates[d.id] ? { ...d, title: titleUpdates[d.id] } : d
        )
      );
    }
    if (newAppliances.length) {
      setAppliances([...appliances, ...newAppliances]);
    }

    toast.dismiss(t);
    if (newAppliances.length > 0) {
      toast.success(`Added ${newAppliances.length} appliance${newAppliances.length === 1 ? '' : 's'}`);
      router.push('/appliances');
    } else {
      toast('No appliance details could be extracted.');
    }
  };

  const processInvoices = async (docs: Document[]) => {
    if (!home || docs.length === 0) return;
    const t = toast.loading(`Reading ${docs.length} invoice${docs.length === 1 ? '' : 's'}…`);
    const { data: sess } = await supabase.auth.getSession();
    const token = sess.session?.access_token;
    if (!token) {
      toast.dismiss(t);
      toast.error('Not signed in');
      return;
    }

    const titleUpdates: Record<string, string> = {};
    const newTasks: any[] = [];
    const newHistoryRows: any[] = [];

    const nextDueDate = (completed: string, recurrence: string): string | null => {
      const d = parseISO(completed);
      switch (recurrence) {
        case 'weekly':
          return format(addDays(d, 7), 'yyyy-MM-dd');
        case 'monthly':
          return format(addMonths(d, 1), 'yyyy-MM-dd');
        case 'quarterly':
          return format(addMonths(d, 3), 'yyyy-MM-dd');
        case 'yearly':
          return format(addYears(d, 1), 'yyyy-MM-dd');
        default:
          return null;
      }
    };

    for (const doc of docs) {
      try {
        const res = await fetch('/api/invoices/extract', {
          method: 'POST',
          headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
          body: JSON.stringify({ documentId: doc.id }),
        });
        const json = await res.json();
        if (!res.ok || !json.ok) continue;

        const newTitle: string = (json.document_title || '').trim();
        if (newTitle && newTitle !== doc.title) {
          await supabase
            .from('documents')
            .update({ title: newTitle, updated_at: new Date().toISOString() })
            .eq('id', doc.id);
          titleUpdates[doc.id] = newTitle;
        }

        const inv = json.invoice || {};
        const title = inv.task_title || inv.vendor || 'Service';
        const completedDate = inv.completed_date || null;
        const completedAt = completedDate ? `${completedDate}T12:00:00Z` : new Date().toISOString();
        const recurrence = inv.recurrence || 'one_time';
        const matchedCategory =
          (inv.category_hint &&
            categories.find((c) => c.name === inv.category_hint)) ||
          null;
        const description = [inv.vendor && `Vendor: ${inv.vendor}`, inv.notes]
          .filter(Boolean)
          .join('\n');

        const { data: task } = await supabase
          .from('tasks')
          .insert({
            home_id: home.id,
            category_id: matchedCategory?.id || null,
            title,
            description: description || null,
            due_date: completedDate || null,
            recurrence,
            priority: 'medium',
            status: 'completed',
            completed_at: completedAt,
            completed_by: user?.id || null,
            estimated_cost: inv.cost || null,
            created_by: user?.id || null,
            source_document_id: doc.id,
          })
          .select()
          .single();
        if (!task) continue;
        newTasks.push(task);

        const { data: hist } = await supabase
          .from('task_history')
          .insert({
            task_id: (task as any).id,
            home_id: home.id,
            title,
            category_name: matchedCategory?.name || null,
            completed_by: user?.id || null,
            completed_by_name: user?.display_name || null,
            completed_at: completedAt,
            notes: description || null,
            cost: inv.cost || null,
          })
          .select()
          .single();
        if (hist) newHistoryRows.push(hist);

        if (recurrence !== 'one_time' && completedDate) {
          const next = nextDueDate(completedDate, recurrence);
          if (next) {
            const normalized = title.trim().toLowerCase();
            const existing = tasks.find(
              (t) =>
                t.status === 'pending' &&
                !t.is_suggestion &&
                t.title.trim().toLowerCase() === normalized
            );
            if (existing) {
              if (!existing.due_date || existing.due_date < next) {
                const { data: updated } = await supabase
                  .from('tasks')
                  .update({
                    due_date: next,
                    recurrence,
                    updated_at: new Date().toISOString(),
                  })
                  .eq('id', existing.id)
                  .select()
                  .single();
                if (updated) newTasks.push(updated);
              }
            } else {
              const { data: nextTask } = await supabase
                .from('tasks')
                .insert({
                  home_id: home.id,
                  category_id: matchedCategory?.id || null,
                  title,
                  description: description || null,
                  due_date: next,
                  recurrence,
                  priority: 'medium',
                  status: 'pending',
                  estimated_cost: inv.cost || null,
                  created_by: user?.id || null,
                })
                .select()
                .single();
              if (nextTask) newTasks.push(nextTask);
            }
          }
        }
      } catch {
        // skip on error; keep going
      }
    }

    if (Object.keys(titleUpdates).length) {
      setDocuments(
        documents.map((d) =>
          titleUpdates[d.id] ? { ...d, title: titleUpdates[d.id] } : d
        )
      );
    }
    if (newTasks.length) {
      const newIds = new Set(newTasks.map((t: any) => t.id));
      setTasks([...newTasks, ...tasks.filter((t) => !newIds.has(t.id))]);
    }
    if (newHistoryRows.length) setHistory([...newHistoryRows, ...history]);

    toast.dismiss(t);
    const completedCount = newHistoryRows.length;
    const upcomingCount = newTasks.length - completedCount;
    if (completedCount > 0) {
      const parts = [
        `Logged ${completedCount} completed task${completedCount === 1 ? '' : 's'}`,
      ];
      if (upcomingCount > 0) {
        parts.push(`+ ${upcomingCount} upcoming`);
      }
      toast.success(parts.join(' '));
    } else {
      toast('No invoice details could be extracted.');
    }
  };

  const processBuilderDocs = async (docs: Document[]) => {
    if (!home || docs.length === 0) return;
    const t = toast.loading(
      `Reading ${docs.length} builder doc${docs.length === 1 ? '' : 's'}…`
    );
    const { data: sess } = await supabase.auth.getSession();
    const token = sess.session?.access_token;
    if (!token) {
      toast.dismiss(t);
      toast.error('Not signed in');
      return;
    }

    type Profile = {
      year_built: number;
      square_footage: number;
      floors: number;
      roof_type: string;
      roof_installed_year: number;
      exterior_type: string;
      hvac_type: string;
      hvac_units: number;
      hvac_installed_year: number;
      water_heater_type: string;
      water_heater_installed_year: number;
      plumbing_type: string;
      dryer_type: string;
      has_irrigation: boolean | null;
      has_septic: boolean | null;
      has_well_water: boolean | null;
      has_deck: boolean | null;
      has_pool: boolean | null;
      has_garage: boolean | null;
      has_fireplace: boolean | null;
      has_basement: boolean | null;
      has_attic: boolean | null;
      has_crawlspace: boolean | null;
      has_hoa: boolean | null;
    };
    const merged: Partial<Profile> = {};
    let docsAccepted = 0;
    type ExtractedAppliance = {
      name: string;
      manufacturer: string;
      model_number: string;
      category: string;
      notes: string;
    };
    const extractedAppliances: ExtractedAppliance[] = [];
    const seenApplianceNames = new Set<string>();

    const setIfMissingStr = (k: keyof Profile, v: string) => {
      if (v && !merged[k]) (merged as any)[k] = v;
    };
    const setIfMissingNum = (k: keyof Profile, v: number) => {
      if (v > 0 && !merged[k]) (merged as any)[k] = v;
    };
    const setIfMissingBool = (k: keyof Profile, v: boolean | null) => {
      if (v !== null && merged[k] === undefined) (merged as any)[k] = v;
    };

    for (const doc of docs) {
      try {
        const res = await fetch('/api/builder-docs/extract', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ documentId: doc.id }),
        });
        const json = await res.json();
        if (!res.ok || !json.ok) continue;
        docsAccepted += 1;
        const p = json.profile || {};
        setIfMissingNum('year_built', p.year_built);
        setIfMissingNum('square_footage', p.square_footage);
        setIfMissingNum('floors', p.floors);
        setIfMissingStr('roof_type', p.roof_type);
        setIfMissingNum('roof_installed_year', p.roof_installed_year);
        setIfMissingStr('exterior_type', p.exterior_type);
        setIfMissingStr('hvac_type', p.hvac_type);
        setIfMissingNum('hvac_units', p.hvac_units);
        setIfMissingNum('hvac_installed_year', p.hvac_installed_year);
        setIfMissingStr('water_heater_type', p.water_heater_type);
        setIfMissingNum('water_heater_installed_year', p.water_heater_installed_year);
        setIfMissingStr('plumbing_type', p.plumbing_type);
        setIfMissingStr('dryer_type', p.dryer_type);
        setIfMissingBool('has_irrigation', p.has_irrigation);
        setIfMissingBool('has_septic', p.has_septic);
        setIfMissingBool('has_well_water', p.has_well_water);
        setIfMissingBool('has_deck', p.has_deck);
        setIfMissingBool('has_pool', p.has_pool);
        setIfMissingBool('has_garage', p.has_garage);
        setIfMissingBool('has_fireplace', p.has_fireplace);
        setIfMissingBool('has_basement', p.has_basement);
        setIfMissingBool('has_attic', p.has_attic);
        setIfMissingBool('has_crawlspace', p.has_crawlspace);
        setIfMissingBool('has_hoa', p.has_hoa);

        const fromDoc: ExtractedAppliance[] = Array.isArray(json.appliances) ? json.appliances : [];
        for (const a of fromDoc) {
          const key = a.name?.trim().toLowerCase();
          if (!key || seenApplianceNames.has(key)) continue;
          seenApplianceNames.add(key);
          extractedAppliances.push(a);
        }
      } catch {
        // skip on error; keep going
      }
    }

    if (docsAccepted === 0) {
      toast.dismiss(t);
      toast("None of those looked like builder paperwork.");
      return;
    }

    const update: Record<string, any> = {};
    let dryerSet = false;
    for (const [key, val] of Object.entries(merged)) {
      if (val === undefined || val === '' || val === null) continue;
      if (key === 'dryer_type') {
        update.dryer_type = val;
        update.has_dryer = val === 'electric' || val === 'gas';
        dryerSet = true;
      } else {
        update[key] = val;
      }
    }
    const profileUpdateNeeded = Object.keys(update).length > 0;
    const insertedAppliances: any[] = [];
    if (profileUpdateNeeded) {
      update.updated_at = new Date().toISOString();
    }

    try {
      let fieldCount = 0;
      if (profileUpdateNeeded) {
        const { data: updatedHome, error } = await supabase
          .from('homes')
          .update(update)
          .eq('id', home.id)
          .select()
          .single();
        if (error) throw error;
        if (updatedHome) setHome(updatedHome as any);
        await supabase.rpc('generate_suggestions', { p_home_id: home.id });
        fieldCount = Object.keys(update).length - 1 - (dryerSet ? 1 : 0);
      }

      // Insert any builder-doc-extracted appliances (deduped against existing
      // ones by lowered name).
      if (extractedAppliances.length > 0) {
        const existingNames = new Set(
          appliances.map((a: any) => (a.name || '').trim().toLowerCase())
        );
        const fresh = extractedAppliances.filter(
          (a) => !existingNames.has(a.name.trim().toLowerCase())
        );
        if (fresh.length > 0) {
          const { data: applianceRows } = await supabase
            .from('appliances')
            .insert(
              fresh.map((a) => ({
                home_id: home.id,
                name: a.name,
                manufacturer: a.manufacturer || null,
                model_number: a.model_number || null,
                category: a.category || null,
                notes: a.notes || null,
              }))
            )
            .select();
          if (applianceRows) {
            insertedAppliances.push(...applianceRows);
            setAppliances([...appliances, ...applianceRows]);
          }
        }
      }

      toast.dismiss(t);
      const parts: string[] = [];
      if (fieldCount > 0) {
        parts.push(`Filled in ${fieldCount} home profile field${fieldCount === 1 ? '' : 's'}`);
      }
      if (insertedAppliances.length > 0) {
        parts.push(
          `+ ${insertedAppliances.length} appliance${insertedAppliances.length === 1 ? '' : 's'}`
        );
      }
      if (parts.length === 0) {
        toast('No new home profile fields could be extracted.');
        return;
      }
      toast.success(parts.join(' '));
      router.push(profileUpdateNeeded ? '/home-profile' : '/appliances');
    } catch (err: any) {
      toast.dismiss(t);
      toast.error(err.message || 'Could not update home profile');
    }
  };

  const resetForm = () => {
    setForm({ title: '', category: '', notes: '' });
    setFiles([]);
    setEditing(null);
    setShowForm(false);
  };

  const openEdit = (d: Document) => {
    setEditing(d);
    setForm({ title: d.title, category: d.category || '', notes: d.notes || '' });
    setFiles([]);
    setShowForm(true);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(e.target.files || []);
    if (selected.length === 0) return;
    setFiles(selected);
    if (selected.length === 1 && !form.title) {
      const name = selected[0].name.replace(/\.[^.]+$/, '');
      setForm((prev) => ({ ...prev, title: name }));
    } else if (selected.length > 1) {
      setForm((prev) => ({ ...prev, title: '' }));
    }
  };

  const handleSave = async () => {
    if (!home) return;

    if (editing) {
      const { data, error } = await supabase
        .from('documents')
        .update({
          title: form.title.trim() || editing.file_name,
          category: form.category || null,
          notes: form.notes || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', editing.id)
        .select()
        .single();
      if (error) {
        toast.error(error.message);
        return;
      }
      setDocuments(documents.map((d) => (d.id === editing.id ? (data as Document) : d)));
      toast.success('Updated');
      resetForm();
      return;
    }

    if (files.length === 0) {
      toast.error('Pick at least one file to upload');
      return;
    }

    setUploading(true);
    const uploaded: Document[] = [];
    const isBatch = files.length > 1;
    try {
      for (const f of files) {
        const safeName = f.name.replace(/[^a-zA-Z0-9._-]/g, '_');
        const path = `${home.id}/${crypto.randomUUID()}-${safeName}`;
        const { error: upErr } = await supabase.storage.from('documents').upload(path, f, {
          contentType: f.type || undefined,
          upsert: false,
        });
        if (upErr) {
          toast.error(`${f.name}: ${upErr.message}`);
          continue;
        }
        const { data, error } = await supabase
          .from('documents')
          .insert({
            home_id: home.id,
            title: isBatch
              ? f.name.replace(/\.[^.]+$/, '')
              : form.title.trim() || f.name,
            category: form.category || null,
            file_path: path,
            file_name: f.name,
            mime_type: f.type || null,
            file_size: f.size,
            notes: isBatch ? null : form.notes || null,
            uploaded_by: user?.id || null,
          })
          .select()
          .single();
        if (error) {
          await supabase.storage.from('documents').remove([path]);
          toast.error(`${f.name}: ${error.message}`);
          continue;
        }
        uploaded.push(data as Document);
      }

      if (uploaded.length === 0) return;

      setDocuments([...uploaded, ...documents]);
      toast.success(
        uploaded.length === 1 ? 'Document uploaded' : `Uploaded ${uploaded.length} documents`
      );
      const userCategory = form.category || null;
      resetForm();

      const classified = await classifyAndUpdate(uploaded, userCategory);

      const buckets: Record<string, Document[]> = {};
      for (const doc of classified) {
        const cat = doc.category || 'Other';
        if (!buckets[cat]) buckets[cat] = [];
        buckets[cat].push(doc);
      }

      if (buckets['Manual']?.length === 1) {
        await analyzeManual(buckets['Manual'][0]);
      } else if (buckets['Manual']?.length) {
        await batchAnalyzeManuals(buckets['Manual']);
      }
      if (buckets['Invoice']?.length) {
        await processInvoices(buckets['Invoice']);
      }
      if (buckets['Builder Doc']?.length) {
        await processBuilderDocs(buckets['Builder Doc']);
      }
    } catch (err: any) {
      toast.error(err.message || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async () => {
    if (!editing) return;
    if (!confirm('Delete this document? This cannot be undone.')) return;
    const { error } = await supabase.from('documents').delete().eq('id', editing.id);
    if (error) {
      toast.error('Failed to delete');
      return;
    }
    await supabase.storage.from('documents').remove([editing.file_path]);
    setDocuments(documents.filter((d) => d.id !== editing.id));
    toast.success('Deleted');
    resetForm();
  };

  const handleOpen = async (d: Document) => {
    const { data, error } = await supabase.storage
      .from('documents')
      .createSignedUrl(d.file_path, 60 * 5);
    if (error || !data) {
      toast.error('Could not open file');
      return;
    }
    window.open(data.signedUrl, '_blank');
  };

  const u = (key: keyof typeof form, val: string) =>
    setForm((f) => ({ ...f, [key]: val }));

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = { all: documents.length };
    for (const d of documents) {
      const key = d.category || 'Uncategorized';
      counts[key] = (counts[key] || 0) + 1;
    }
    return counts;
  }, [documents]);

  const visible = useMemo(() => {
    let list = documents;
    if (filter === 'Uncategorized') list = list.filter((d) => !d.category);
    else if (filter !== 'all') list = list.filter((d) => d.category === filter);
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (d) =>
          d.title.toLowerCase().includes(q) ||
          d.file_name.toLowerCase().includes(q) ||
          (d.category || '').toLowerCase().includes(q) ||
          (d.notes || '').toLowerCase().includes(q) ||
          (d.searchable_text || '').toLowerCase().includes(q)
      );
    }
    return list;
  }, [documents, filter, search]);

  const activeChips = useMemo(() => {
    const chips = ['all', ...Object.keys(categoryCounts).filter((k) => k !== 'all')];
    return chips;
  }, [categoryCounts]);

  if (showForm) {
    return (
      <div>
        <PageHeader
          title={editing ? 'Edit Document' : 'Upload Document'}
          back
          rightAction={
            <button onClick={resetForm} className="text-brand-500">
              <X size={22} />
            </button>
          }
        />
        <div className="px-4 py-4 space-y-3">
          {!editing && (
            <label className="block">
              <div className="ios-card flex items-center gap-3 p-4 active:bg-gray-50 cursor-pointer">
                <div className="w-10 h-10 rounded-lg bg-brand-50 text-brand-500 flex items-center justify-center">
                  <Upload size={20} />
                </div>
                <div className="flex-1 min-w-0">
                  {files.length === 0 ? (
                    <>
                      <p className="text-[15px] font-medium">Choose files</p>
                      <p className="text-xs text-ink-secondary">PDF or image. Pick multiple to batch upload.</p>
                    </>
                  ) : files.length === 1 ? (
                    <>
                      <p className="text-[15px] font-medium truncate">{files[0].name}</p>
                      <p className="text-xs text-ink-secondary">{formatBytes(files[0].size)}</p>
                    </>
                  ) : (
                    <>
                      <p className="text-[15px] font-medium">{files.length} files selected</p>
                      <p className="text-xs text-ink-secondary truncate">
                        {files.map((f) => f.name).join(', ')}
                      </p>
                    </>
                  )}
                </div>
                <input
                  type="file"
                  multiple
                  className="hidden"
                  onChange={handleFileChange}
                />
              </div>
            </label>
          )}

          {editing && (
            <button
              onClick={() => handleOpen(editing)}
              className="ios-card flex items-center gap-3 p-4 active:bg-gray-50 w-full"
            >
              <div className="w-10 h-10 rounded-lg bg-brand-50 text-brand-500 flex items-center justify-center">
                <Download size={20} />
              </div>
              <div className="flex-1 min-w-0 text-left">
                <p className="text-[15px] font-medium truncate">{editing.file_name}</p>
                <p className="text-xs text-ink-secondary">
                  {formatBytes(editing.file_size)} · Uploaded {format(parseISO(editing.uploaded_at), 'MMM d, yyyy')}
                </p>
              </div>
              <ChevronRight size={16} className="text-ink-tertiary" />
            </button>
          )}

          {(editing || files.length <= 1) && (
            <div>
              <label className="text-xs text-ink-secondary mb-1 block">Title *</label>
              <input
                type="text"
                value={form.title}
                onChange={(e) => u('title', e.target.value)}
                className="ios-input"
              />
            </div>
          )}

          <div>
            <label className="text-xs text-ink-secondary mb-1 block">Category</label>
            <select
              value={form.category}
              onChange={(e) => u('category', e.target.value)}
              className="ios-input"
            >
              <option value="">Uncategorized</option>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            {!editing && files.length > 1 && (
              <p className="text-xs text-ink-tertiary mt-1">Applied to all {files.length} files</p>
            )}
          </div>

          {(editing || files.length <= 1) && (
            <div>
              <label className="text-xs text-ink-secondary mb-1 block">Notes</label>
              <textarea
                value={form.notes}
                onChange={(e) => u('notes', e.target.value)}
                rows={3}
                className="ios-input resize-none"
              />
            </div>
          )}

          <button
            onClick={handleSave}
            disabled={
              uploading ||
              (!editing && files.length === 0) ||
              (files.length <= 1 && !editing && !form.title.trim())
            }
            className="ios-button"
          >
            {uploading
              ? 'Uploading…'
              : editing
              ? 'Update'
              : files.length > 1
              ? `Upload ${files.length} files`
              : 'Upload'}
          </button>
          {editing && editing.category === 'Manual' && (
            <button
              onClick={() => analyzeManual(editing)}
              disabled={analyzingId === editing.id}
              className="ios-button-secondary"
            >
              {analyzingId === editing.id ? 'Reading manual…' : 'Create appliance from this manual'}
            </button>
          )}
          {editing && (
            <button
              onClick={handleDelete}
              className="w-full py-3 text-status-red font-semibold text-sm"
            >
              Delete Document
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Documents"
        subtitle={`${documents.length} stored`}
        back
      />

      {documents.length > 0 && (
        <div className="px-4 pt-3 pb-2">
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-tertiary" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search documents..."
              className="ios-input pl-9"
            />
          </div>
        </div>
      )}

      {documents.length > 0 && (
        <div className="px-4 pb-2 flex gap-2 overflow-x-auto no-scrollbar">
          {activeChips.map((key) => {
            const label = key === 'all' ? 'All' : key;
            const count = categoryCounts[key] || 0;
            const active = filter === key;
            return (
              <button
                key={key}
                onClick={() => setFilter(key)}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-colors ${
                  active
                    ? 'bg-brand-500 text-white'
                    : 'bg-gray-100 text-ink-secondary active:bg-gray-200'
                }`}
              >
                {label} {count > 0 && <span className="opacity-75">· {count}</span>}
              </button>
            );
          })}
        </div>
      )}

      <div className="py-2">
        {documents.length === 0 ? (
          <div className="text-center py-16">
            <FileText size={40} className="mx-auto text-ink-tertiary mb-3" />
            <p className="text-ink-secondary text-sm">No documents yet</p>
            <p className="text-ink-tertiary text-xs mt-1 px-8">
              Store insurance policies, deeds, warranties, receipts, and more.
            </p>
            <button
              onClick={() => setShowForm(true)}
              className="mt-4 text-brand-500 text-sm font-semibold"
            >
              + Upload your first document
            </button>
          </div>
        ) : visible.length === 0 ? (
          <div className="text-center py-12 text-sm text-ink-secondary">
            No documents in this category.
          </div>
        ) : (
          <div className="mx-4 ios-card overflow-hidden">
            {visible.map((d) => {
              const Icon = fileIcon(d.mime_type);
              return (
                <div key={d.id} className="ios-list-item">
                  <button
                    onClick={() => handleOpen(d)}
                    className="flex items-center gap-3 flex-1 min-w-0 text-left"
                  >
                    <div className="w-9 h-9 rounded-lg bg-sky-50 text-sky-500 flex items-center justify-center flex-shrink-0">
                      <Icon size={18} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[15px] font-medium truncate">{d.title}</p>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        {d.category && (
                          <span className="text-xs text-ink-secondary">{d.category}</span>
                        )}
                        {d.category && d.file_size && (
                          <span className="text-xs text-ink-tertiary">·</span>
                        )}
                        {d.file_size && (
                          <span className="text-xs text-ink-tertiary">
                            {formatBytes(d.file_size)}
                          </span>
                        )}
                        <span className="text-xs text-ink-tertiary">·</span>
                        <span className="text-xs text-ink-tertiary">
                          {format(parseISO(d.uploaded_at), 'MMM d, yyyy')}
                        </span>
                      </div>
                    </div>
                  </button>
                  <button
                    onClick={() => openEdit(d)}
                    className="p-1 -mr-1 text-ink-tertiary active:opacity-60"
                    aria-label="Edit"
                  >
                    <ChevronRight size={16} />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
