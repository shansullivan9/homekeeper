'use client';
import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase-browser';
import { useStore } from '@/lib/store';
import PageHeader from '@/components/layout/PageHeader';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';

export default function HomeProfilePage() {
  const { home, user, setHome } = useStore();
  const supabase = createClient();
  const router = useRouter();
  const isNew = !home;

  const [form, setForm] = useState({
    name: '', address: '', year_built: '', square_footage: '', floors: '1',
    roof_type: '', exterior_type: '', hvac_type: '', hvac_units: '1',
    water_heater_type: '', plumbing_type: '',
    has_irrigation: false, has_septic: false, has_well_water: false,
    has_deck: false, has_pool: false, has_garage: false, has_fireplace: false, has_dryer: false,
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (home) {
      setForm({
        name: home.name || '',
        address: home.address || '',
        year_built: home.year_built?.toString() || '',
        square_footage: home.square_footage?.toString() || '',
        floors: home.floors?.toString() || '1',
        roof_type: home.roof_type || '',
        exterior_type: home.exterior_type || '',
        hvac_type: home.hvac_type || '',
        hvac_units: home.hvac_units?.toString() || '1',
        water_heater_type: home.water_heater_type || '',
        plumbing_type: home.plumbing_type || '',
        has_irrigation: home.has_irrigation,
        has_septic: home.has_septic,
        has_well_water: home.has_well_water,
        has_deck: home.has_deck,
        has_pool: home.has_pool,
        has_garage: home.has_garage,
        has_fireplace: home.has_fireplace,
        has_dryer: home.has_dryer,
      });
    }
  }, [home]);

  const update = (key: string, value: any) => setForm((f) => ({ ...f, [key]: value }));

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast.error('Please enter a home name');
      return;
    }
    setSaving(true);

    const payload = {
      name: form.name.trim(),
      address: form.address || null,
      year_built: form.year_built ? parseInt(form.year_built) : null,
      square_footage: form.square_footage ? parseInt(form.square_footage) : null,
      floors: parseInt(form.floors) || 1,
      roof_type: form.roof_type || null,
      exterior_type: form.exterior_type || null,
      hvac_type: form.hvac_type || null,
      hvac_units: parseInt(form.hvac_units) || 1,
      water_heater_type: form.water_heater_type || null,
      plumbing_type: form.plumbing_type || null,
      has_irrigation: form.has_irrigation,
      has_septic: form.has_septic,
      has_well_water: form.has_well_water,
      has_deck: form.has_deck,
      has_pool: form.has_pool,
      has_garage: form.has_garage,
      has_fireplace: form.has_fireplace,
      has_dryer: form.has_dryer,
    };

    try {
      if (isNew) {
        // Create home
        const { data: newHome, error: homeErr } = await supabase
          .from('homes')
          .insert(payload)
          .select()
          .single();

        if (homeErr) throw homeErr;

        // Add current user as owner
        const { error: memberErr } = await supabase.from('home_members').insert({
          home_id: newHome.id,
          user_id: user!.id,
          role: 'owner',
        });

        if (memberErr) throw memberErr;

        setHome(newHome);

        // Generate maintenance suggestions
        await supabase.rpc('generate_suggestions', { p_home_id: newHome.id });

        toast.success('Home created! Check your dashboard for suggested tasks.');
        router.push('/dashboard');
      } else {
        const { data, error } = await supabase
          .from('homes')
          .update(payload)
          .eq('id', home!.id)
          .select()
          .single();

        if (error) throw error;
        setHome(data);

        // Regenerate suggestions
        await supabase.rpc('generate_suggestions', { p_home_id: home!.id });

        toast.success('Home profile updated');
        router.push('/dashboard');
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const ToggleItem = ({ label, field }: { label: string; field: string }) => (
    <button
      onClick={() => update(field, !(form as any)[field])}
      className="ios-list-item w-full"
    >
      <span className="text-[15px]">{label}</span>
      <div className={`w-12 h-7 rounded-full transition-colors relative ${(form as any)[field] ? 'bg-status-green' : 'bg-gray-200'}`}>
        <div className={`absolute top-0.5 w-6 h-6 rounded-full bg-white shadow transition-transform ${(form as any)[field] ? 'translate-x-5' : 'translate-x-0.5'}`} />
      </div>
    </button>
  );

  return (
    <div>
      <PageHeader title={isNew ? 'Set Up Your Home' : 'Home Profile'} back={!isNew} />

      <div className="py-4 space-y-5">
        {/* Basics */}
        <div>
          <p className="section-header">Property Basics</p>
          <div className="mx-4 space-y-3">
            <input
              type="text" value={form.name} onChange={(e) => update('name', e.target.value)}
              placeholder="Home name *" className="ios-input"
            />
            <input
              type="text" value={form.address} onChange={(e) => update('address', e.target.value)}
              placeholder="Address" className="ios-input"
            />
            <div className="grid grid-cols-2 gap-3">
              <input
                type="number" value={form.year_built} onChange={(e) => update('year_built', e.target.value)}
                placeholder="Year built" className="ios-input"
              />
              <input
                type="number" value={form.square_footage} onChange={(e) => update('square_footage', e.target.value)}
                placeholder="Sq. footage" className="ios-input"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <input
                type="number" value={form.floors} onChange={(e) => update('floors', e.target.value)}
                placeholder="Floors" className="ios-input"
              />
              <select value={form.roof_type} onChange={(e) => update('roof_type', e.target.value)} className="ios-input">
                <option value="">Roof type</option>
                <option value="asphalt_shingle">Asphalt Shingle</option>
                <option value="metal">Metal</option>
                <option value="tile">Tile</option>
                <option value="slate">Slate</option>
                <option value="flat">Flat</option>
              </select>
            </div>
            <select value={form.exterior_type} onChange={(e) => update('exterior_type', e.target.value)} className="ios-input">
              <option value="">Exterior type</option>
              <option value="vinyl">Vinyl Siding</option>
              <option value="brick">Brick</option>
              <option value="stucco">Stucco</option>
              <option value="wood">Wood</option>
              <option value="stone">Stone</option>
              <option value="fiber_cement">Fiber Cement</option>
            </select>
          </div>
        </div>

        {/* Major Systems */}
        <div>
          <p className="section-header">Major Systems</p>
          <div className="mx-4 space-y-3">
            <select value={form.hvac_type} onChange={(e) => update('hvac_type', e.target.value)} className="ios-input">
              <option value="">HVAC type</option>
              <option value="central_air">Central Air</option>
              <option value="heat_pump">Heat Pump</option>
              <option value="window_units">Window Units</option>
              <option value="mini_split">Mini Split</option>
              <option value="radiant">Radiant</option>
            </select>
            <input
              type="number" value={form.hvac_units} onChange={(e) => update('hvac_units', e.target.value)}
              placeholder="Number of HVAC units" className="ios-input"
            />
            <select value={form.water_heater_type} onChange={(e) => update('water_heater_type', e.target.value)} className="ios-input">
              <option value="">Water heater type</option>
              <option value="tank">Tank</option>
              <option value="tankless">Tankless</option>
              <option value="heat_pump">Heat Pump</option>
              <option value="solar">Solar</option>
            </select>
            <select value={form.plumbing_type} onChange={(e) => update('plumbing_type', e.target.value)} className="ios-input">
              <option value="">Plumbing type</option>
              <option value="copper">Copper</option>
              <option value="pex">PEX</option>
              <option value="pvc">PVC</option>
              <option value="galvanized">Galvanized</option>
              <option value="mixed">Mixed</option>
            </select>
          </div>
        </div>

        {/* Outdoor & Features */}
        <div>
          <p className="section-header">Features & Systems</p>
          <div className="mx-4 ios-card overflow-hidden">
            <ToggleItem label="🌧️ Irrigation System" field="has_irrigation" />
            <ToggleItem label="🪵 Deck" field="has_deck" />
            <ToggleItem label="🏊 Pool" field="has_pool" />
            <ToggleItem label="🚗 Garage" field="has_garage" />
            <ToggleItem label="🔥 Fireplace" field="has_fireplace" />
            <ToggleItem label="👕 Dryer" field="has_dryer" />
            <ToggleItem label="🚰 Septic System" field="has_septic" />
            <ToggleItem label="💧 Well Water" field="has_well_water" />
          </div>
        </div>

        {/* Save */}
        <div className="mx-4 pb-4">
          <button onClick={handleSave} disabled={saving} className="ios-button">
            {saving ? 'Saving...' : isNew ? 'Create Home' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}
