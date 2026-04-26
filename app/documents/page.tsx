'use client';
import { useMemo, useState } from 'react';
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
  Image as ImageIcon,
  FileSpreadsheet,
  File as FileIcon,
} from 'lucide-react';
import { format, parseISO } from 'date-fns';
import toast from 'react-hot-toast';

const CATEGORIES = [
  'Insurance',
  'Deed / Title',
  'Mortgage',
  'Warranty',
  'Receipt',
  'Manual',
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
  const { documents, home, setDocuments, user } = useStore();
  const supabase = createClient();
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Document | null>(null);
  const [filter, setFilter] = useState<string>('all');
  const [uploading, setUploading] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [form, setForm] = useState({ title: '', category: '', notes: '' });

  const resetForm = () => {
    setForm({ title: '', category: '', notes: '' });
    setFile(null);
    setEditing(null);
    setShowForm(false);
  };

  const openEdit = (d: Document) => {
    setEditing(d);
    setForm({ title: d.title, category: d.category || '', notes: d.notes || '' });
    setFile(null);
    setShowForm(true);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    if (!form.title) {
      const name = f.name.replace(/\.[^.]+$/, '');
      setForm((prev) => ({ ...prev, title: name }));
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

    if (!file) {
      toast.error('Pick a file to upload');
      return;
    }

    setUploading(true);
    try {
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const path = `${home.id}/${crypto.randomUUID()}-${safeName}`;
      const { error: upErr } = await supabase.storage.from('documents').upload(path, file, {
        contentType: file.type || undefined,
        upsert: false,
      });
      if (upErr) throw upErr;

      const { data, error } = await supabase
        .from('documents')
        .insert({
          home_id: home.id,
          title: form.title.trim() || file.name,
          category: form.category || null,
          file_path: path,
          file_name: file.name,
          mime_type: file.type || null,
          file_size: file.size,
          notes: form.notes || null,
          uploaded_by: user?.id || null,
        })
        .select()
        .single();
      if (error) {
        await supabase.storage.from('documents').remove([path]);
        throw error;
      }
      setDocuments([data as Document, ...documents]);
      toast.success('Document uploaded');
      resetForm();
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
    if (filter === 'all') return documents;
    if (filter === 'Uncategorized') return documents.filter((d) => !d.category);
    return documents.filter((d) => d.category === filter);
  }, [documents, filter]);

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
                  {file ? (
                    <>
                      <p className="text-[15px] font-medium truncate">{file.name}</p>
                      <p className="text-xs text-ink-secondary">{formatBytes(file.size)}</p>
                    </>
                  ) : (
                    <>
                      <p className="text-[15px] font-medium">Choose a file</p>
                      <p className="text-xs text-ink-secondary">PDF, image, or any file</p>
                    </>
                  )}
                </div>
                <input
                  type="file"
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

          <input
            type="text"
            value={form.title}
            onChange={(e) => u('title', e.target.value)}
            placeholder="Title *"
            className="ios-input"
          />

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
          </div>

          <textarea
            value={form.notes}
            onChange={(e) => u('notes', e.target.value)}
            placeholder="Notes..."
            rows={3}
            className="ios-input resize-none"
          />

          <button
            onClick={handleSave}
            disabled={uploading || (!editing && !file) || !form.title.trim()}
            className="ios-button"
          >
            {uploading ? 'Uploading…' : editing ? 'Update' : 'Upload'}
          </button>
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
        rightAction={
          <button onClick={() => setShowForm(true)} className="text-brand-500">
            <Plus size={24} />
          </button>
        }
      />

      {documents.length > 0 && (
        <div className="px-4 pt-3 pb-2 flex gap-2 overflow-x-auto no-scrollbar">
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
