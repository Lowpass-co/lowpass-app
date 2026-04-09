/* ============================================
   LOWPASS — Inventory Item Modal (Add / Edit)
   ============================================ */

'use client';

import { useState, useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { createClient } from '@/lib/supabase-client';
import { CATEGORIES, type RentalInventoryItem } from './types';

interface Props {
  userId: string;
  editing: RentalInventoryItem | null;
  onSave: (item: RentalInventoryItem) => void;
  onClose: () => void;
}

export function InventoryModal({ userId, editing, onSave, onClose }: Props) {
  const [name, setName]             = useState(editing?.name             ?? '');
  const [category, setCategory]     = useState(editing?.category         ?? '');
  const [serial, setSerial]         = useState(editing?.serial_number    ?? '');
  const [origin, setOrigin]         = useState(editing?.country_of_origin ?? '');
  const [weightKg, setWeight]       = useState(editing?.weight_kg?.toString() ?? '');
  const [purchaseCost, setPurchase] = useState(editing?.purchase_cost?.toString() ?? '');
  const [dayRate, setDayRate]       = useState(editing?.day_rate?.toString() ?? '');
  const [imageUrl, setImageUrl]     = useState(editing?.image_url        ?? '');
  const [notes, setNotes]           = useState(editing?.notes            ?? '');
  const [saving, setSaving]         = useState(false);
  const [rateHint, setRateHint]     = useState('');
  const nameRef = useRef<HTMLInputElement>(null);
  const supabase = createClient();

  useEffect(() => { nameRef.current?.focus(); }, []);

  function handlePurchaseCostChange(val: string) {
    setPurchase(val);
    const cost = parseFloat(val);
    if (cost > 0) {
      const sug = (cost * 0.01).toFixed(2);
      setRateHint(`Suggested: $${sug}/day (1% of cost — industry standard)`);
      if (!dayRate) setDayRate(sug);
    } else {
      setRateHint('');
    }
  }

  async function handleSave() {
    if (!name.trim()) { nameRef.current?.focus(); return; }
    setSaving(true);

    const payload = {
      user_id:           userId,
      name:              name.trim(),
      category:          category || null,
      serial_number:     serial.trim() || null,
      country_of_origin: origin.trim() || null,
      weight_kg:         weightKg   ? parseFloat(weightKg)   : null,
      purchase_cost:     purchaseCost ? parseFloat(purchaseCost) : null,
      day_rate:          dayRate    ? parseFloat(dayRate)    : null,
      image_url:         imageUrl.trim() || null,
      notes:             notes.trim() || null,
    };

    let result;
    if (editing) {
      result = await supabase.from('rental_inventory').update(payload).eq('id', editing.id).select().single();
    } else {
      result = await supabase.from('rental_inventory').insert(payload).select().single();
    }

    setSaving(false);
    if (result.error) { alert('Save failed: ' + result.error.message); return; }
    onSave(result.data as RentalInventoryItem);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div
        className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl shadow-2xl"
        style={{ backgroundColor: 'var(--lp-surface)', border: '1px solid var(--lp-border)' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-4" style={{ borderBottom: '1px solid var(--lp-border)' }}>
          <h2 className="text-base font-bold" style={{ color: 'var(--lp-text)' }}>
            {editing ? 'Edit Item' : 'Add Inventory Item'}
          </h2>
          <button onClick={onClose} className="rounded-md p-1 transition-colors" style={{ color: 'var(--lp-text-tertiary)' }}>
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-4">
          {/* Name */}
          <Field label="Name" required>
            <input
              ref={nameRef}
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. L-Acoustics K2 Cabinet"
              className="lp-input"
            />
          </Field>

          {/* Category + Serial */}
          <div className="grid grid-cols-2 gap-4">
            <Field label="Category">
              <select value={category} onChange={e => setCategory(e.target.value)} className="lp-input">
                <option value="">— select —</option>
                {CATEGORIES.map(c => <option key={c}>{c}</option>)}
              </select>
            </Field>
            <Field label="Serial Number">
              <input value={serial} onChange={e => setSerial(e.target.value)} placeholder="SN-00000" className="lp-input" />
            </Field>
          </div>

          {/* Origin + Weight */}
          <div className="grid grid-cols-2 gap-4">
            <Field label="Country of Origin">
              <input value={origin} onChange={e => setOrigin(e.target.value)} placeholder="e.g. France" className="lp-input" />
            </Field>
            <Field label="Weight (kg)">
              <input type="number" value={weightKg} onChange={e => setWeight(e.target.value)} min="0" step="0.1" placeholder="0.0" className="lp-input" />
            </Field>
          </div>

          {/* Purchase cost + Day rate */}
          <div className="grid grid-cols-2 gap-4">
            <Field label="Purchase / Replacement Cost">
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm" style={{ color: 'var(--lp-text-tertiary)' }}>$</span>
                <input
                  type="number" value={purchaseCost}
                  onChange={e => handlePurchaseCostChange(e.target.value)}
                  min="0" step="0.01" placeholder="0.00"
                  className="lp-input pl-6"
                />
              </div>
            </Field>
            <Field label="Day Rate" hint={rateHint}>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm" style={{ color: 'var(--lp-text-tertiary)' }}>$</span>
                <input
                  type="number" value={dayRate}
                  onChange={e => setDayRate(e.target.value)}
                  min="0" step="0.01" placeholder="0.00"
                  className="lp-input pl-6"
                />
              </div>
            </Field>
          </div>

          {/* Image URL */}
          <Field label="Image URL">
            <input
              type="url" value={imageUrl}
              onChange={e => setImageUrl(e.target.value)}
              placeholder="https://…"
              className="lp-input"
            />
            {imageUrl && (
              <img
                src={imageUrl} alt="preview"
                className="mt-2 h-14 w-14 rounded-lg object-cover"
                style={{ border: '1px solid var(--lp-border)' }}
                onError={e => (e.currentTarget.style.display = 'none')}
              />
            )}
          </Field>

          {/* Notes */}
          <Field label="Notes">
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Condition, accessories, quirks…"
              rows={2}
              className="lp-input resize-none"
            />
          </Field>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 px-6 pb-5 pt-2" style={{ borderTop: '1px solid var(--lp-border)' }}>
          <button
            onClick={onClose}
            className="rounded-lg border px-4 py-2 text-sm font-medium transition-colors"
            style={{ borderColor: 'var(--lp-border)', color: 'var(--lp-text-secondary)', backgroundColor: 'transparent' }}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !name.trim()}
            className="rounded-lg px-4 py-2 text-sm font-semibold text-white transition-colors disabled:opacity-50"
            style={{ backgroundColor: '#FF4500' }}
          >
            {saving ? 'Saving…' : editing ? 'Save Changes' : 'Add Item'}
          </button>
        </div>
      </div>

      <style>{`
        .lp-input {
          width: 100%;
          border-radius: 8px;
          border: 1px solid var(--lp-border);
          background-color: var(--lp-bg);
          color: var(--lp-text);
          padding: 8px 12px;
          font-size: 0.875rem;
          outline: none;
          transition: border-color 0.15s;
        }
        .lp-input:focus { border-color: #FF4500; }
        .lp-input::placeholder { color: var(--lp-text-tertiary); }
      `}</style>
    </div>
  );
}

function Field({ label, required, hint, children }: {
  label: string; required?: boolean; hint?: string; children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--lp-text-secondary)' }}>
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
      {hint && <p className="text-xs" style={{ color: '#FF4500' }}>{hint}</p>}
    </div>
  );
}
