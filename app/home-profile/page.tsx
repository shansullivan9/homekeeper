'use client';
import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase-browser';
import { useStore } from '@/lib/store';
import PageHeader from '@/components/layout/PageHeader';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { ExternalLink } from 'lucide-react';

export default function HomeProfilePage() {
  const { home, user, setHome } = useStore();
  const supabase = createClient();
  const router = useRouter();
  const isNew = !home;

  const [form, setForm] = useState({
    name: '', address: '', zip_code: '', state: '',
    year_built: '', square_footage: '', floors: '1',
    roof_type: '', roof_installed_year: '',
    exterior_type: '',
    hvac_type: '', hvac_units: '1', hvac_installed_year: '',
    water_heater_type: '', water_heater_installed_year: '',
    plumbing_type: '',
    dryer_type: '',
    has_irrigation: false, has_septic: false, has_well_water: false,
    has_deck: false, has_pool: false, has_garage: false,
    has_fireplace: false,
    has_basement: false, has_attic: false, has_crawlspace: false, has_hoa: false,
  });
  const [saving, setSaving] = useState(false);
  const [editMode, setEditMode] = useState(isNew);

  useEffect(() => {
    setEditMode(isNew);
  }, [isNew]);

  useEffect(() => {
    if (home) {
      const inferredDryerType =
        (home as any).dryer_type ||
        (home.has_dryer ? 'electric' : 'none');

      setForm({
        name: home.name || '',
        address: home.address || '',
        zip_code: (home as any).zip_code || '',
        state: (home as any).state || '',
        year_built: home.year_built?.toString() || '',
        square_footage: home.square_footage?.toString() || '',
        floors: home.floors?.toString() || '1',
        roof_type: home.roof_type || '',
        roof_installed_year: (home as any).roof_installed_year?.toString() || '',
        exterior_type: home.exterior_type || '',
        hvac_type: home.hvac_type || '',
        hvac_units: home.hvac_units?.toString() || '1',
        hvac_installed_year: (home as any).hvac_installed_year?.toString() || '',
        water_heater_type: home.water_heater_type || '',
        water_heater_installed_year: (home as any).water_heater_installed_year?.toString() || '',
        plumbing_type: home.plumbing_type || '',
        dryer_type: inferredDryerType,
        has_irrigation: home.has_irrigation,
        has_septic: home.has_septic,
        has_well_water: home.has_well_water,
        has_deck: home.has_deck,
        has_pool: home.has_pool,
        has_garage: home.has_garage,
        has_fireplace: home.has_fireplace,
        has_basement: (home as any).has_basement || false,
        has_attic: (home as any).has_attic || false,
        has_crawlspace: (home as any).has_crawlspace || false,
        has_hoa: (home as any).has_hoa || false,
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

    const hasDryer = form.dryer_type === 'gas' || form.dryer_type === 'electric';

    const payload = {
      name: form.name.trim(),
      address: form.address || null,
      zip_code: form.zip_code.trim() || null,
      state: form.state.trim().toUpperCase() || null,
      year_built: form.year_built ? parseInt(form.year_built) : null,
      square_footage: form.square_footage ? parseInt(form.square_footage) : null,
      floors: parseInt(form.floors) || 1,
      roof_type: form.roof_type || null,
      roof_installed_year: form.roof_installed_year ? parseInt(form.roof_installed_year) : null,
      exterior_type: form.exterior_type || null,
      hvac_type: form.hvac_type || null,
      hvac_units: parseInt(form.hvac_units) || 1,
      hvac_installed_year: form.hvac_installed_year ? parseInt(form.hvac_installed_year) : null,
      water_heater_type: form.water_heater_type || null,
      water_heater_installed_year: form.water_heater_installed_year ? parseInt(form.water_heater_installed_year) : null,
      plumbing_type: form.plumbing_type || null,
      dryer_type: form.dryer_type || null,
      has_dryer: hasDryer,
      has_irrigation: form.has_irrigation,
      has_septic: form.has_septic,
      has_well_water: form.has_well_water,
      has_deck: form.has_deck,
      has_pool: form.has_pool,
      has_garage: form.has_garage,
      has_fireplace: form.has_fireplace,
      has_basement: form.has_basement,
      has_attic: form.has_attic,
      has_crawlspace: form.has_crawlspace,
      has_hoa: form.has_hoa,
    };

    try {
      if (isNew) {
        const { data: newHome, error: homeErr } = await supabase
          .from('homes')
          .insert(payload)
          .select()
          .single();

        if (homeErr) throw homeErr;

        const { error: memberErr } = await supabase.from('home_members').insert({
          home_id: newHome.id,
          user_id: user!.id,
          role: 'owner',
        });

        if (memberErr) throw memberErr;

        setHome(newHome);
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

  const SELECT_LABELS: Record<string, Record<string, string>> = {
    roof_type: { asphalt_shingle: 'Asphalt Shingle', metal: 'Metal', tile: 'Tile', slate: 'Slate', flat: 'Flat' },
    exterior_type: { vinyl: 'Vinyl Siding', brick: 'Brick', stucco: 'Stucco', wood: 'Wood', stone: 'Stone', fiber_cement: 'Fiber Cement' },
    hvac_type: { central_air: 'Central Air', heat_pump: 'Heat Pump', window_units: 'Window Units', mini_split: 'Mini Split', radiant: 'Radiant' },
    water_heater_type: { tank: 'Tank', tankless: 'Tankless', heat_pump: 'Heat Pump', solar: 'Solar' },
    plumbing_type: { copper: 'Copper', pex: 'PEX', pvc: 'PVC', galvanized: 'Galvanized', mixed: 'Mixed' },
    dryer_type: { electric: 'Electric Dryer', gas: 'Gas Dryer', none: 'No Dryer' },
  };
  const fmtSelect = (field: string, value: string) =>
    SELECT_LABELS[field]?.[value] || value || '—';
  const fmtText = (v: any) => (v === '' || v == null ? '—' : String(v));
  const fmtBool = (v: boolean) => (v ? 'Yes' : 'No');

  const ViewRow = ({ label, value }: { label: string; value: string }) => (
    <div className="ios-list-item">
      <span className="text-[15px] text-ink-secondary">{label}</span>
      <span className="text-[15px] font-medium text-right">{value}</span>
    </div>
  );

  const fullAddress = [form.address, form.state, form.zip_code]
    .filter((s) => s && s.trim())
    .join(', ');
  const encodedAddress = encodeURIComponent(fullAddress);
  const zip = form.zip_code?.trim();
  const externalLinks = fullAddress
    ? [
        {
          name: 'Zillow',
          url: `https://www.zillow.com/homes/${encodedAddress}_rb/`,
          domain: 'zillow.com',
        },
        {
          name: 'Redfin',
          url: zip
            ? `https://www.redfin.com/zipcode/${zip}`
            : `https://www.redfin.com/`,
          domain: 'redfin.com',
        },
        {
          name: 'Realtor.com',
          url: zip
            ? `https://www.realtor.com/realestateandhomes-search/${zip}`
            : `https://www.realtor.com/`,
          domain: 'realtor.com',
        },
        {
          name: 'Google Maps',
          url: `https://www.google.com/maps/search/?api=1&query=${encodedAddress}`,
          domain: 'maps.google.com',
        },
      ]
    : [];

  return (
    <div>
      <PageHeader
        title={isNew ? 'Set Up Your Home' : 'Home Profile'}
        back={!isNew}
        rightAction={
          !isNew ? (
            <button
              onClick={() => setEditMode((v) => !v)}
              className="text-brand-500 text-sm font-semibold"
            >
              {editMode ? 'Done' : 'Edit'}
            </button>
          ) : undefined
        }
      />

      {!editMode && !isNew && (
        <div className="py-4 space-y-5">
          <div>
            <p className="section-header">Property Basics</p>
            <div className="mx-4 ios-card overflow-hidden">
              <ViewRow label="Home name" value={fmtText(form.name)} />
              <ViewRow label="Address" value={fmtText(form.address)} />
              <ViewRow label="ZIP" value={fmtText(form.zip_code)} />
              <ViewRow label="State" value={fmtText(form.state)} />
              <ViewRow label="Year built" value={fmtText(form.year_built)} />
              <ViewRow label="Sq. footage" value={fmtText(form.square_footage)} />
              <ViewRow label="Floors" value={fmtText(form.floors)} />
              <ViewRow label="Roof type" value={fmtSelect('roof_type', form.roof_type)} />
              <ViewRow label="Roof installed" value={fmtText(form.roof_installed_year)} />
              <ViewRow label="Exterior" value={fmtSelect('exterior_type', form.exterior_type)} />
            </div>
          </div>

          <div>
            <p className="section-header">Major Systems</p>
            <div className="mx-4 ios-card overflow-hidden">
              <ViewRow label="HVAC" value={fmtSelect('hvac_type', form.hvac_type)} />
              <ViewRow label="HVAC units" value={fmtText(form.hvac_units)} />
              <ViewRow label="HVAC year" value={fmtText(form.hvac_installed_year)} />
              <ViewRow label="Water heater" value={fmtSelect('water_heater_type', form.water_heater_type)} />
              <ViewRow label="Water heater year" value={fmtText(form.water_heater_installed_year)} />
              <ViewRow label="Plumbing" value={fmtSelect('plumbing_type', form.plumbing_type)} />
              <ViewRow label="Dryer" value={fmtSelect('dryer_type', form.dryer_type)} />
            </div>
          </div>

          <div>
            <p className="section-header">Features & Systems</p>
            <div className="mx-4 ios-card overflow-hidden">
              <ViewRow label="🌧️ Irrigation System" value={fmtBool(form.has_irrigation)} />
              <ViewRow label="🪵 Deck" value={fmtBool(form.has_deck)} />
              <ViewRow label="🏊 Pool" value={fmtBool(form.has_pool)} />
              <ViewRow label="🚗 Garage" value={fmtBool(form.has_garage)} />
              <ViewRow label="🔥 Fireplace" value={fmtBool(form.has_fireplace)} />
              <ViewRow label="🚰 Septic System" value={fmtBool(form.has_septic)} />
              <ViewRow label="💧 Well Water" value={fmtBool(form.has_well_water)} />
              <ViewRow label="🏠 Basement" value={fmtBool(form.has_basement)} />
              <ViewRow label="📐 Attic" value={fmtBool(form.has_attic)} />
              <ViewRow label="🕸️ Crawlspace" value={fmtBool(form.has_crawlspace)} />
              <ViewRow label="🏘️ HOA" value={fmtBool(form.has_hoa)} />
            </div>
          </div>

          {externalLinks.length > 0 && (
            <div>
              <p className="section-header">Public Listings</p>
              <p className="text-[13px] text-gray-500 mx-4 mb-2">
                Quick lookup of this address on real estate sites and maps.
              </p>
              <div className="mx-4 ios-card overflow-hidden">
                {externalLinks.map((link) => (
                  <a
                    key={link.name}
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="ios-list-item"
                  >
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <img
                        src={`https://www.google.com/s2/favicons?domain=${link.domain}&sz=64`}
                        alt=""
                        className="w-7 h-7 rounded-md flex-shrink-0"
                        loading="lazy"
                      />
                      <span className="text-[15px] font-medium truncate">{link.name}</span>
                    </div>
                    <ExternalLink size={14} className="text-ink-tertiary flex-shrink-0" />
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {(editMode || isNew) && (
      <div className="py-4 space-y-5">
        <div>
          <p className="section-header">Property Basics</p>
          <p className="text-[13px] text-gray-500 mx-4 mb-2">ZIP and state help us tailor maintenance tasks to your climate and season.</p>
          <div className="mx-4 space-y-3">
            <div>
              <label className="text-xs text-ink-secondary mb-1 block">Home name *</label>
              <input type="text" value={form.name} onChange={(e) => update('name', e.target.value)} className="ios-input" />
            </div>
            <div>
              <label className="text-xs text-ink-secondary mb-1 block">Address</label>
              <input type="text" value={form.address} onChange={(e) => update('address', e.target.value)} className="ios-input" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-ink-secondary mb-1 block">ZIP code</label>
                <input type="text" value={form.zip_code} onChange={(e) => update('zip_code', e.target.value)} maxLength={10} className="ios-input" />
              </div>
              <div>
                <label className="text-xs text-ink-secondary mb-1 block">State (e.g. NC)</label>
                <input type="text" value={form.state} onChange={(e) => update('state', e.target.value.toUpperCase())} maxLength={2} className="ios-input" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-ink-secondary mb-1 block">Year built</label>
                <input type="number" value={form.year_built} onChange={(e) => update('year_built', e.target.value)} className="ios-input" />
              </div>
              <div>
                <label className="text-xs text-ink-secondary mb-1 block">Sq. footage</label>
                <input type="number" value={form.square_footage} onChange={(e) => update('square_footage', e.target.value)} className="ios-input" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-ink-secondary mb-1 block">Floors</label>
                <input type="number" value={form.floors} onChange={(e) => update('floors', e.target.value)} className="ios-input" />
              </div>
              <div>
                <label className="text-xs text-ink-secondary mb-1 block">Roof type</label>
                <select value={form.roof_type} onChange={(e) => update('roof_type', e.target.value)} className="ios-input">
                  <option value="">Select…</option>
                  <option value="asphalt_shingle">Asphalt Shingle</option>
                  <option value="metal">Metal</option>
                  <option value="tile">Tile</option>
                  <option value="slate">Slate</option>
                  <option value="flat">Flat</option>
                </select>
              </div>
            </div>
            <div>
              <label className="text-xs text-ink-secondary mb-1 block">Roof installed year (if known)</label>
              <input type="number" value={form.roof_installed_year} onChange={(e) => update('roof_installed_year', e.target.value)} className="ios-input" />
            </div>
            <div>
              <label className="text-xs text-ink-secondary mb-1 block">Exterior type</label>
              <select value={form.exterior_type} onChange={(e) => update('exterior_type', e.target.value)} className="ios-input">
                <option value="">Select…</option>
                <option value="vinyl">Vinyl Siding</option>
                <option value="brick">Brick</option>
                <option value="stucco">Stucco</option>
                <option value="wood">Wood</option>
                <option value="stone">Stone</option>
                <option value="fiber_cement">Fiber Cement</option>
              </select>
            </div>
          </div>
        </div>

        <div>
          <p className="section-header">Major Systems</p>
          <p className="text-[13px] text-gray-500 mx-4 mb-2">Install years are optional but make recommendations more accurate.</p>
          <div className="mx-4 space-y-3">
            <div>
              <label className="text-xs text-ink-secondary mb-1 block">HVAC type</label>
              <select value={form.hvac_type} onChange={(e) => update('hvac_type', e.target.value)} className="ios-input">
                <option value="">Select…</option>
                <option value="central_air">Central Air</option>
                <option value="heat_pump">Heat Pump</option>
                <option value="window_units">Window Units</option>
                <option value="mini_split">Mini Split</option>
                <option value="radiant">Radiant</option>
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-ink-secondary mb-1 block"># HVAC units</label>
                <input type="number" value={form.hvac_units} onChange={(e) => update('hvac_units', e.target.value)} className="ios-input" />
              </div>
              <div>
                <label className="text-xs text-ink-secondary mb-1 block">HVAC year</label>
                <input type="number" value={form.hvac_installed_year} onChange={(e) => update('hvac_installed_year', e.target.value)} className="ios-input" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-ink-secondary mb-1 block">Water heater type</label>
                <select value={form.water_heater_type} onChange={(e) => update('water_heater_type', e.target.value)} className="ios-input">
                  <option value="">Select…</option>
                  <option value="tank">Tank</option>
                  <option value="tankless">Tankless</option>
                  <option value="heat_pump">Heat Pump</option>
                  <option value="solar">Solar</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-ink-secondary mb-1 block">Water heater year</label>
                <input type="number" value={form.water_heater_installed_year} onChange={(e) => update('water_heater_installed_year', e.target.value)} className="ios-input" />
              </div>
            </div>
            <div>
              <label className="text-xs text-ink-secondary mb-1 block">Plumbing type</label>
              <select value={form.plumbing_type} onChange={(e) => update('plumbing_type', e.target.value)} className="ios-input">
                <option value="">Select…</option>
                <option value="copper">Copper</option>
                <option value="pex">PEX</option>
                <option value="pvc">PVC</option>
                <option value="galvanized">Galvanized</option>
                <option value="mixed">Mixed</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-ink-secondary mb-1 block">Dryer type</label>
              <select value={form.dryer_type} onChange={(e) => update('dryer_type', e.target.value)} className="ios-input">
                <option value="">Select…</option>
                <option value="electric">Electric Dryer</option>
                <option value="gas">Gas Dryer</option>
                <option value="none">No Dryer</option>
              </select>
            </div>
          </div>
        </div>

        <div>
          <p className="section-header">Features & Systems</p>
          <div className="mx-4 ios-card overflow-hidden">
            <ToggleItem label="🌧️ Irrigation System" field="has_irrigation" />
            <ToggleItem label="🪵 Deck" field="has_deck" />
            <ToggleItem label="🏊 Pool" field="has_pool" />
            <ToggleItem label="🚗 Garage" field="has_garage" />
            <ToggleItem label="🔥 Fireplace" field="has_fireplace" />
            <ToggleItem label="🚰 Septic System" field="has_septic" />
            <ToggleItem label="💧 Well Water" field="has_well_water" />
            <ToggleItem label="🏠 Basement" field="has_basement" />
            <ToggleItem label="📐 Attic" field="has_attic" />
            <ToggleItem label="🕸️ Crawlspace" field="has_crawlspace" />
            <ToggleItem label="🏘️ HOA" field="has_hoa" />
          </div>
        </div>

        <div className="mx-4 pb-4">
          <button onClick={handleSave} disabled={saving} className="ios-button">
            {saving ? 'Saving...' : isNew ? 'Create Home' : 'Save Changes'}
          </button>
        </div>
      </div>
      )}
    </div>
  );
}
