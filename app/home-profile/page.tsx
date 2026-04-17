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
        await supabase.rpc('generate_suggest
