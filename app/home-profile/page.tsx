'use client';
import { useState, useEffect, useRef } from 'react';
import { createClient } from '@/lib/supabase-browser';
import { useStore } from '@/lib/store';
import PageHeader from '@/components/layout/PageHeader';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { ExternalLink, ChevronDown } from 'lucide-react';

// Native <select> always shows the option's full text once chosen, so we
// build a small custom dropdown: closed state shows just the 2-letter
// code (e.g. "NC"), open state lists "NC — North Carolina" for every
// option so users can still find their state by name.
function StateDropdown({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (next: string) => void;
  options: { code: string; name: string }[];
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="ios-input flex items-center justify-between text-left"
      >
        <span className={value ? '' : 'text-ink-tertiary'}>
          {value || 'Select…'}
        </span>
        <ChevronDown size={16} className="text-ink-tertiary" />
      </button>
      {open && (
        <div className="absolute z-30 mt-1 left-0 right-0 ios-card max-h-64 overflow-auto">
          {options.map((s) => (
            <button
              key={s.code}
              type="button"
              onClick={() => { onChange(s.code); setOpen(false); }}
              className={`w-full text-left px-4 py-2.5 text-[15px] active:bg-gray-50 ${
                value === s.code ? 'bg-brand-50 text-brand-600 font-semibold' : ''
              }`}
            >
              <span className="font-mono">{s.code}</span>
              <span className="text-ink-secondary"> — {s.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function HomeProfilePage() {
  const { home, user, setHome } = useStore();
  const supabase = createClient();
  const router = useRouter();
  const isNew = !home;

  const [form, setForm] = useState({
    name: '', address: '', city: '', zip_code: '', state: '',
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
        city: (home as any).city || '',
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
      city: form.city.trim() || null,
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
        // Server-side RPC creates the home and the owner-membership in
        // one transaction so it can't race the home_members RLS policy.
        const { data: newHome, error: homeErr } = await supabase
          .rpc('create_home_with_owner', { p_payload: payload });

        if (homeErr) throw homeErr;

        setHome(newHome as any);
        await supabase.rpc('generate_suggestions', { p_home_id: (newHome as any).id });

        toast.success('Home created! Check your dashboard for suggested tasks.');
        setEditMode(false);
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
        setEditMode(false);
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

  const US_STATES: { code: string; name: string }[] = [
    { code: 'AL', name: 'Alabama' }, { code: 'AK', name: 'Alaska' }, { code: 'AZ', name: 'Arizona' },
    { code: 'AR', name: 'Arkansas' }, { code: 'CA', name: 'California' }, { code: 'CO', name: 'Colorado' },
    { code: 'CT', name: 'Connecticut' }, { code: 'DE', name: 'Delaware' }, { code: 'DC', name: 'District of Columbia' },
    { code: 'FL', name: 'Florida' }, { code: 'GA', name: 'Georgia' }, { code: 'HI', name: 'Hawaii' },
    { code: 'ID', name: 'Idaho' }, { code: 'IL', name: 'Illinois' }, { code: 'IN', name: 'Indiana' },
    { code: 'IA', name: 'Iowa' }, { code: 'KS', name: 'Kansas' }, { code: 'KY', name: 'Kentucky' },
    { code: 'LA', name: 'Louisiana' }, { code: 'ME', name: 'Maine' }, { code: 'MD', name: 'Maryland' },
    { code: 'MA', name: 'Massachusetts' }, { code: 'MI', name: 'Michigan' }, { code: 'MN', name: 'Minnesota' },
    { code: 'MS', name: 'Mississippi' }, { code: 'MO', name: 'Missouri' }, { code: 'MT', name: 'Montana' },
    { code: 'NE', name: 'Nebraska' }, { code: 'NV', name: 'Nevada' }, { code: 'NH', name: 'New Hampshire' },
    { code: 'NJ', name: 'New Jersey' }, { code: 'NM', name: 'New Mexico' }, { code: 'NY', name: 'New York' },
    { code: 'NC', name: 'North Carolina' }, { code: 'ND', name: 'North Dakota' }, { code: 'OH', name: 'Ohio' },
    { code: 'OK', name: 'Oklahoma' }, { code: 'OR', name: 'Oregon' }, { code: 'PA', name: 'Pennsylvania' },
    { code: 'RI', name: 'Rhode Island' }, { code: 'SC', name: 'South Carolina' }, { code: 'SD', name: 'South Dakota' },
    { code: 'TN', name: 'Tennessee' }, { code: 'TX', name: 'Texas' }, { code: 'UT', name: 'Utah' },
    { code: 'VT', name: 'Vermont' }, { code: 'VA', name: 'Virginia' }, { code: 'WA', name: 'Washington' },
    { code: 'WV', name: 'West Virginia' }, { code: 'WI', name: 'Wisconsin' }, { code: 'WY', name: 'Wyoming' },
  ];

  const currentYear = new Date().getFullYear();
  const yearBuiltOptions = (() => {
    const arr: number[] = [];
    for (let y = currentYear; y >= 1900; y--) arr.push(y);
    return arr;
  })();
  const minComponentYear = form.year_built ? parseInt(form.year_built) : 1900;
  const componentYearOptions = (() => {
    const arr: number[] = [];
    for (let y = currentYear; y >= minComponentYear; y--) arr.push(y);
    return arr;
  })();

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
      <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-secondary">{label}</span>
      <span className="text-[15px] font-medium text-right">{value}</span>
    </div>
  );

  const fullAddress = [form.address, form.city, form.state, form.zip_code]
    .filter((s) => s && s.trim())
    .join(', ');
  const encodedAddress = encodeURIComponent(fullAddress);
  // Only direct address-aware links: each one accepts the full address
  // as a query parameter and lands the user on this exact property.
  // We tried Bing Maps and OpenStreetMap and dropped them — neither
  // is useful enough to keep at the top of the screen. No other major
  // real-estate site (Redfin, Realtor.com, Trulia, Movoto) supports a
  // direct full-address URL — they all require pre-known city/listing
  // slugs — so Zillow is the only realty link we can reliably make
  // address-direct.
  const externalLinks = fullAddress
    ? [
        {
          name: 'Zillow',
          url: `https://www.zillow.com/homes/${encodedAddress}_rb/`,
          domain: 'zillow.com',
        },
        {
          name: 'Google Maps',
          url: `https://www.google.com/maps/search/?api=1&query=${encodedAddress}`,
          domain: 'maps.google.com',
        },
        {
          name: 'Apple Maps',
          url: `https://maps.apple.com/?q=${encodedAddress}`,
          domain: 'maps.apple.com',
        },
        {
          name: 'Waze',
          url: `https://www.waze.com/ul?q=${encodedAddress}`,
          domain: 'waze.com',
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
              onClick={async () => {
                if (editMode) await handleSave();
                else setEditMode(true);
              }}
              disabled={saving}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors disabled:opacity-50 ${
                editMode
                  ? 'bg-brand-500 text-white active:bg-brand-600'
                  : 'bg-brand-50 text-brand-600 active:bg-brand-100 border border-brand-200'
              }`}
            >
              {editMode ? (saving ? 'Saving…' : 'Save') : '✏️ Edit'}
            </button>
          ) : undefined
        }
      />

      {!editMode && !isNew && (
        <div className="py-4 space-y-5 md:max-w-3xl">
          {externalLinks.length > 0 && (
            <div>
              <p className="section-header">Open Address In…</p>
              <p className="text-[13px] text-ink-tertiary mx-4 mb-2.5">
                Direct links to this exact address — opens in a new tab.
              </p>
              <div className="mx-4 grid grid-cols-2 gap-3">
                {externalLinks.map((link) => (
                  <a
                    key={link.name}
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="ios-card p-3 flex flex-col items-center text-center gap-2 active:shadow-card-hover transition-shadow"
                  >
                    <img
                      src={`https://www.google.com/s2/favicons?domain=${link.domain}&sz=128`}
                      alt=""
                      className="w-10 h-10 rounded-lg"
                      loading="lazy"
                    />
                    <span className="text-[13px] font-semibold leading-tight">
                      {link.name}
                    </span>
                    <ExternalLink size={11} className="text-ink-tertiary" />
                  </a>
                ))}
              </div>
            </div>
          )}

          <div>
            <p className="section-header">Property Basics</p>
            <div className="mx-4 ios-card overflow-hidden">
              <ViewRow label="Home Name" value={fmtText(form.name)} />
              <ViewRow label="Address" value={fmtText(form.address)} />
              <ViewRow label="City" value={fmtText(form.city)} />
              <ViewRow label="State" value={fmtText(form.state)} />
              <ViewRow label="ZIP" value={fmtText(form.zip_code)} />
              <ViewRow label="Year Built" value={fmtText(form.year_built)} />
              <ViewRow label="Sq. Footage" value={fmtText(form.square_footage)} />
              <ViewRow label="Floors" value={fmtText(form.floors)} />
              <ViewRow label="Roof Type" value={fmtSelect('roof_type', form.roof_type)} />
              <ViewRow label="Roof Installed" value={fmtText(form.roof_installed_year)} />
              <ViewRow label="Exterior" value={fmtSelect('exterior_type', form.exterior_type)} />
            </div>
          </div>

          <div>
            <p className="section-header">Major Systems</p>
            <div className="mx-4 ios-card overflow-hidden">
              <ViewRow label="HVAC" value={fmtSelect('hvac_type', form.hvac_type)} />
              <ViewRow label="HVAC Units" value={fmtText(form.hvac_units)} />
              <ViewRow label="HVAC Year" value={fmtText(form.hvac_installed_year)} />
              <ViewRow label="Water Heater" value={fmtSelect('water_heater_type', form.water_heater_type)} />
              <ViewRow label="Water Heater Year" value={fmtText(form.water_heater_installed_year)} />
              <ViewRow label="Plumbing" value={fmtSelect('plumbing_type', form.plumbing_type)} />
              <ViewRow label="Dryer" value={fmtSelect('dryer_type', form.dryer_type)} />
            </div>
          </div>

          <div>
            <p className="section-header">Features & Systems</p>
            <div className="mx-4 ios-card overflow-hidden">
              <ViewRow label="📐 Attic" value={fmtBool(form.has_attic)} />
              <ViewRow label="🏠 Basement" value={fmtBool(form.has_basement)} />
              <ViewRow label="🕸️ Crawlspace" value={fmtBool(form.has_crawlspace)} />
              <ViewRow label="🪵 Deck" value={fmtBool(form.has_deck)} />
              <ViewRow label="🔥 Fireplace" value={fmtBool(form.has_fireplace)} />
              <ViewRow label="🚗 Garage" value={fmtBool(form.has_garage)} />
              <ViewRow label="🏘️ HOA" value={fmtBool(form.has_hoa)} />
              <ViewRow label="🌧️ Irrigation System" value={fmtBool(form.has_irrigation)} />
              <ViewRow label="🏊 Pool" value={fmtBool(form.has_pool)} />
              <ViewRow label="🚰 Septic System" value={fmtBool(form.has_septic)} />
              <ViewRow label="💧 Well Water" value={fmtBool(form.has_well_water)} />
            </div>
          </div>

        </div>
      )}

      {(editMode || isNew) && (
      <div className="py-4 space-y-5 md:max-w-3xl">
        <div>
          <p className="section-header">Property Basics</p>
          <p className="text-[13px] text-gray-500 mx-4 mb-2">ZIP and state help us tailor maintenance tasks to your climate and season.</p>
          <div className="mx-4 space-y-3">
            <div>
              <label className="text-[11px] font-semibold uppercase tracking-wider text-ink-secondary mb-1 block">Home Name *</label>
              <input type="text" value={form.name} onChange={(e) => update('name', e.target.value)} className="ios-input" />
            </div>
            <div>
              <label className="text-[11px] font-semibold uppercase tracking-wider text-ink-secondary mb-1 block">Address</label>
              <input
                type="text"
                value={form.address}
                onChange={(e) => update('address', e.target.value)}
                placeholder="Street address"
                autoComplete="street-address"
                className="ios-input"
              />
            </div>
            <div>
              <label className="text-[11px] font-semibold uppercase tracking-wider text-ink-secondary mb-1 block">City</label>
              <input
                type="text"
                value={form.city}
                onChange={(e) => update('city', e.target.value)}
                autoComplete="address-level2"
                className="ios-input"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] font-semibold uppercase tracking-wider text-ink-secondary mb-1 block">State</label>
                <StateDropdown
                  value={form.state}
                  onChange={(v) => update('state', v)}
                  options={US_STATES}
                />
              </div>
              <div>
                <label className="text-[11px] font-semibold uppercase tracking-wider text-ink-secondary mb-1 block">ZIP Code</label>
                <input
                  type="text"
                  value={form.zip_code}
                  onChange={(e) => update('zip_code', e.target.value)}
                  maxLength={10}
                  autoComplete="postal-code"
                  className="ios-input"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] font-semibold uppercase tracking-wider text-ink-secondary mb-1 block">Year Built</label>
                <select
                  value={form.year_built}
                  onChange={(e) => {
                    const v = e.target.value;
                    update('year_built', v);
                    // If a roof install year is older than the new year_built,
                    // clear it so we never claim the roof predates the house.
                    if (v && form.roof_installed_year && parseInt(form.roof_installed_year) < parseInt(v)) {
                      update('roof_installed_year', '');
                    }
                    if (v && form.hvac_installed_year && parseInt(form.hvac_installed_year) < parseInt(v)) {
                      update('hvac_installed_year', '');
                    }
                    if (v && form.water_heater_installed_year && parseInt(form.water_heater_installed_year) < parseInt(v)) {
                      update('water_heater_installed_year', '');
                    }
                  }}
                  className="ios-input"
                >
                  <option value="">Select…</option>
                  {yearBuiltOptions.map((y) => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-[11px] font-semibold uppercase tracking-wider text-ink-secondary mb-1 block">Sq. Footage</label>
                <input type="number" value={form.square_footage} onChange={(e) => update('square_footage', e.target.value)} className="ios-input" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] font-semibold uppercase tracking-wider text-ink-secondary mb-1 block">Floors</label>
                <select
                  value={form.floors}
                  onChange={(e) => update('floors', e.target.value)}
                  className="ios-input"
                >
                  {[1, 2, 3, 4, 5].map((n) => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-[11px] font-semibold uppercase tracking-wider text-ink-secondary mb-1 block">Roof Type</label>
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
              <label className="text-[11px] font-semibold uppercase tracking-wider text-ink-secondary mb-1 block">Roof Installed Year</label>
              <select
                value={form.roof_installed_year}
                onChange={(e) => update('roof_installed_year', e.target.value)}
                className="ios-input"
              >
                <option value="">Select…</option>
                {componentYearOptions.map((y) => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[11px] font-semibold uppercase tracking-wider text-ink-secondary mb-1 block">Exterior Type</label>
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
              <label className="text-[11px] font-semibold uppercase tracking-wider text-ink-secondary mb-1 block">HVAC Type</label>
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
                <label className="text-[11px] font-semibold uppercase tracking-wider text-ink-secondary mb-1 block"># HVAC Units</label>
                <select value={form.hvac_units} onChange={(e) => update('hvac_units', e.target.value)} className="ios-input">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-[11px] font-semibold uppercase tracking-wider text-ink-secondary mb-1 block">HVAC Year</label>
                <select
                  value={form.hvac_installed_year}
                  onChange={(e) => update('hvac_installed_year', e.target.value)}
                  className="ios-input"
                >
                  <option value="">Select…</option>
                  {componentYearOptions.map((y) => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] font-semibold uppercase tracking-wider text-ink-secondary mb-1 block">Water Heater Type</label>
                <select value={form.water_heater_type} onChange={(e) => update('water_heater_type', e.target.value)} className="ios-input">
                  <option value="">Select…</option>
                  <option value="tank">Tank</option>
                  <option value="tankless">Tankless</option>
                  <option value="heat_pump">Heat Pump</option>
                  <option value="solar">Solar</option>
                </select>
              </div>
              <div>
                <label className="text-[11px] font-semibold uppercase tracking-wider text-ink-secondary mb-1 block">Water Heater Year</label>
                <select
                  value={form.water_heater_installed_year}
                  onChange={(e) => update('water_heater_installed_year', e.target.value)}
                  className="ios-input"
                >
                  <option value="">Select…</option>
                  {componentYearOptions.map((y) => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label className="text-[11px] font-semibold uppercase tracking-wider text-ink-secondary mb-1 block">Plumbing Type</label>
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
              <label className="text-[11px] font-semibold uppercase tracking-wider text-ink-secondary mb-1 block">Dryer Type</label>
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
            <ToggleItem label="📐 Attic" field="has_attic" />
            <ToggleItem label="🏠 Basement" field="has_basement" />
            <ToggleItem label="🕸️ Crawlspace" field="has_crawlspace" />
            <ToggleItem label="🪵 Deck" field="has_deck" />
            <ToggleItem label="🔥 Fireplace" field="has_fireplace" />
            <ToggleItem label="🚗 Garage" field="has_garage" />
            <ToggleItem label="🏘️ HOA" field="has_hoa" />
            <ToggleItem label="🌧️ Irrigation System" field="has_irrigation" />
            <ToggleItem label="🏊 Pool" field="has_pool" />
            <ToggleItem label="🚰 Septic System" field="has_septic" />
            <ToggleItem label="💧 Well Water" field="has_well_water" />
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
