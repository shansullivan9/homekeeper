'use client';
import { useEffect, useState } from 'react';
import { useStore } from '@/lib/store';
import { createClient } from '@/lib/supabase-browser';
import PageHeader from '@/components/layout/PageHeader';
import { Appliance } from '@/lib/types';
import { Plus, X, Package, ChevronRight, AlertTriangle } from 'lucide-react';
import { format, parseISO, isPast, differenceInDays } from 'date-fns';
import toast from 'react-hot-toast';

export default function AppliancesPage() {
  const { appliances, home, setAppliances } = useStore();
  const supabase = createClient();
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Appliance | null>(null);
  const [form, setForm] = useState({
    name: '', manufacturer: '', model_number: '', serial_number: '',
    category: '', location: '', installation_date: '', warranty_expiration: '',
    purchase_price: '', notes: '',
  });

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
      }));
      setShowForm(true);
      toast('Review the details, then save.', { icon: '✏️' });
    } catch {}
  }, []);

  const resetForm = () => {
    setForm({
      name: '', manufacturer: '', model_number: '', serial_number: '',
      category: '', location: '', installation_date: '', warranty_expiration: '',
      purchase_price: '', notes: '',
    });
    setEditing(null);
    setShowForm(false);
  };

  const openEdit = (a: Appliance) => {
    setEditing(a);
    setForm({
      name: a.name, manufacturer: a.manufacturer || '', model_number: a.model_number || '',
      serial_number: a.serial_number || '', category: a.category || '', location: a.location || '',
      installation_date: a.installation_date || '', warranty_expiration: a.warranty_expiration || '',
      purchase_price: a.purchase_price?.toString() || '', notes: a.notes || '',
    });
    setShowForm(true);
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
        toast.success('Appliance added');
      }
      resetForm();
    } catch (err: any) {
      toast.error(err.message || 'Failed');
    }
  };

  const handleDelete = async () => {
    if (!editing) return;
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
    if (isPast(exp)) return { label: 'Expired', color: 'text-status-red bg-red-50' };
    const daysLeft = differenceInDays(exp, new Date());
    if (daysLeft <= 90) return { label: `${daysLeft}d left`, color: 'text-status-yellow bg-amber-50' };
    return { label: 'Active', color: 'text-status-green bg-green-50' };
  };

  if (showForm) {
    return (
      <div>
        <PageHeader
          title={editing ? 'Edit Appliance' : 'Add Appliance'}
          back
          rightAction={
            <button onClick={resetForm} className="text-brand-500"><X size={22} /></button>
          }
        />
        <div className="px-4 py-4 space-y-3">
          <div>
            <label className="text-xs text-ink-secondary mb-1 block">Appliance name *</label>
            <input type="text" value={form.name} onChange={(e) => u('name', e.target.value)} className="ios-input" autoFocus />
          </div>
          <div>
            <label className="text-xs text-ink-secondary mb-1 block">Manufacturer</label>
            <input type="text" value={form.manufacturer} onChange={(e) => u('manufacturer', e.target.value)} className="ios-input" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-ink-secondary mb-1 block">Model #</label>
              <input type="text" value={form.model_number} onChange={(e) => u('model_number', e.target.value)} className="ios-input" />
            </div>
            <div>
              <label className="text-xs text-ink-secondary mb-1 block">Serial #</label>
              <input type="text" value={form.serial_number} onChange={(e) => u('serial_number', e.target.value)} className="ios-input" />
            </div>
          </div>
          <div>
            <label className="text-xs text-ink-secondary mb-1 block">Category</label>
            <input type="text" value={form.category} onChange={(e) => u('category', e.target.value)} className="ios-input" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-ink-secondary mb-1 block">Installed</label>
              <input type="date" value={form.installation_date} onChange={(e) => u('installation_date', e.target.value)} className="ios-input" />
            </div>
            <div>
              <label className="text-xs text-ink-secondary mb-1 block">Warranty Expires</label>
              <input type="date" value={form.warranty_expiration} onChange={(e) => u('warranty_expiration', e.target.value)} className="ios-input" />
            </div>
          </div>
          <div>
            <label className="text-xs text-ink-secondary mb-1 block">Purchase price ($)</label>
            <input type="number" step="0.01" value={form.purchase_price} onChange={(e) => u('purchase_price', e.target.value)} className="ios-input" />
          </div>
          <div>
            <label className="text-xs text-ink-secondary mb-1 block">Notes</label>
            <textarea value={form.notes} onChange={(e) => u('notes', e.target.value)} rows={3} className="ios-input resize-none" />
          </div>

          <button onClick={handleSave} disabled={!form.name.trim()} className="ios-button">
            {editing ? 'Update' : 'Add Appliance'}
          </button>
          {editing && (
            <button onClick={handleDelete} className="w-full py-3 text-status-red font-semibold text-sm">
              Delete Appliance
            </button>
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
        rightAction={
          <button onClick={() => setShowForm(true)} className="text-brand-500"><Plus size={24} /></button>
        }
      />

      <div className="py-2">
        {appliances.length === 0 ? (
          <div className="text-center py-16">
            <Package size={40} className="mx-auto text-ink-tertiary mb-3" />
            <p className="text-ink-secondary text-sm">No appliances registered</p>
            <button onClick={() => setShowForm(true)} className="mt-3 text-brand-500 text-sm font-semibold">
              + Add your first appliance
            </button>
          </div>
        ) : (
          <div className="mx-4 ios-card overflow-hidden">
            {appliances.map((a) => {
              const ws = warrantyStatus(a.warranty_expiration);
              return (
                <button key={a.id} onClick={() => openEdit(a)} className="ios-list-item w-full">
                  <div className="flex-1 min-w-0">
                    <p className="text-[15px] font-medium truncate">{a.name}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      {a.manufacturer && <span className="text-xs text-ink-secondary">{a.manufacturer}</span>}
                      {a.location && <span className="text-xs text-ink-tertiary">· {a.location}</span>}
                    </div>
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
