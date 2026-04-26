/* Profile form — must stay client; page.tsx wraps in server shell. */

'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { Loader2, ArrowLeft } from 'lucide-react';
import { useToast } from '@/components/ui/Toast';

type Profile = {
  id: string;
  email: string;
  name: string;
  avatar_url: string | null;
  job_title: string | null;
  phone: string | null;
  has_passport?: boolean;
  day_rate: number | null;
  per_diem_rate: number | null;
};

export function ProfilePageClient() {
  const { showToast } = useToast();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState('');
  const [jobTitle, setJobTitle] = useState('');
  const [phone, setPhone] = useState('');
  const [passport, setPassport] = useState('');
  const [passportClear, setPassportClear] = useState(false);
  const [passportEditing, setPassportEditing] = useState(false);
  const [dayRate, setDayRate] = useState<string | number>('');
  const [perDiemRate, setPerDiemRate] = useState<string | number>('');

  useEffect(() => {
    fetch('/api/profile')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('Failed to load'))))
      .then((data) => {
        setProfile(data);
        setName(data.name ?? '');
        setJobTitle(data.job_title ?? '');
        setPhone(data.phone ?? '');
        setDayRate(data.day_rate ?? '');
        setPerDiemRate(data.per_diem_rate ?? '');
      })
      .catch(() => showToast('Could not load profile', 'error'))
      .finally(() => setLoading(false));
  }, [showToast]);

  const handleSave = () => {
    setSaving(true);
    const body: Record<string, unknown> = {
      name,
      job_title: jobTitle || null,
      phone: phone || null,
      day_rate: dayRate === '' ? null : Number(dayRate),
      per_diem_rate: perDiemRate === '' ? null : Number(perDiemRate),
    };
    if (passportClear) body.passport_encrypted = null;
    else if (passport.trim()) body.passport_encrypted = passport.trim();
    fetch('/api/profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('Save failed'))))
      .then((data) => {
        setProfile((p) => (p ? { ...p, ...data } : p));
        setPassport('');
        setPassportClear(false);
        setPassportEditing(false);
        showToast('Profile saved');
      })
      .catch(() => showToast('Failed to save profile', 'error'))
      .finally(() => setSaving(false));
  };

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingAvatar(true);
    const formData = new FormData();
    formData.set('file', file);
    fetch('/api/profile/avatar', { method: 'POST', body: formData })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('Upload failed'))))
      .then((data) => {
        const url = (data.avatar_url ?? data.url) as string;
        setProfile((p) => (p ? { ...p, avatar_url: url } : p));
        showToast('Photo updated');
      })
      .catch(() => showToast('Failed to update photo', 'error'))
      .finally(() => {
        setUploadingAvatar(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
      });
  };

  if (loading) {
    return (
      <div className="mx-auto flex max-w-xl items-center justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-lp-text-tertiary" />
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="mx-auto max-w-xl py-8">
        <p className="text-lp-text-secondary">Could not load profile.</p>
        <Link href="/dashboard" className="mt-4 inline-flex items-center gap-2 text-sm text-lp-orange hover:underline">
          <ArrowLeft className="h-4 w-4" /> Back to Dashboard
        </Link>
      </div>
    );
  }

  const initials = (name || profile.email)
    .split(' ')
    .map((w: string) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase() || profile.email?.charAt(0).toUpperCase() || '?';

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <Link
        href="/dashboard"
        className="inline-flex items-center gap-2 text-sm text-lp-text-secondary hover:text-lp-text"
      >
        <ArrowLeft className="h-4 w-4" /> Back
      </Link>
      <div>
        <h1 className="text-2xl font-bold text-lp-text">Profile</h1>
        <p className="mt-1 text-sm text-lp-text-secondary">
          Update your photo, name, job title, contact details, and rates.
        </p>
      </div>

      <div className="rounded-xl border border-lp-border bg-lp-surface p-6 space-y-6">
        <div className="flex items-center gap-6">
          <div className="relative">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadingAvatar}
              className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-lp-border bg-lp-bg-tertiary text-2xl font-bold text-lp-text-secondary hover:border-lp-orange/50 transition-colors disabled:opacity-60"
            >
              {profile.avatar_url ? (
                <img src={profile.avatar_url} alt="" className="h-full w-full object-cover" />
              ) : (
                initials
              )}
              {uploadingAvatar && (
                <span className="absolute inset-0 flex items-center justify-center bg-black/40">
                  <Loader2 className="h-6 w-6 animate-spin text-white" />
                </span>
              )}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              className="sr-only"
              onChange={handleAvatarChange}
              aria-label="Upload profile photo"
            />
          </div>
          <div>
            <p className="text-sm font-medium text-lp-text">Profile photo</p>
            <p className="text-xs text-lp-text-tertiary mt-0.5">Click to upload (JPEG, PNG, WebP, GIF, max 2MB)</p>
          </div>
        </div>

        <div>
          <label htmlFor="profile-name" className="block text-sm font-medium text-lp-text mb-1.5">Name</label>
          <input
            id="profile-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="name"
            autoCorrect="off"
            autoCapitalize="none"
            spellCheck={false}
            className="w-full rounded-lg border border-lp-border bg-lp-bg px-3 py-2.5 text-sm text-lp-text focus:outline-none focus:ring-2 focus:ring-lp-orange/50"
            placeholder="Your name"
          />
        </div>
        <div>
          <label htmlFor="profile-email" className="block text-sm font-medium text-lp-text mb-1.5">Email</label>
          <input
            id="profile-email"
            type="text"
            value={profile.email}
            readOnly
            className="w-full rounded-lg border border-lp-border bg-lp-bg-tertiary px-3 py-2.5 text-sm text-lp-text-secondary cursor-not-allowed"
          />
          <p className="text-xs text-lp-text-tertiary mt-1">Email is managed by your sign-in provider.</p>
        </div>
        <div>
          <label htmlFor="profile-job" className="block text-sm font-medium text-lp-text mb-1.5">Job title</label>
          <input
            id="profile-job"
            type="text"
            value={jobTitle}
            onChange={(e) => setJobTitle(e.target.value)}
            className="w-full rounded-lg border border-lp-border bg-lp-bg px-3 py-2.5 text-sm text-lp-text focus:outline-none focus:ring-2 focus:ring-lp-orange/50"
            placeholder="e.g. Tour Manager"
          />
        </div>
        <div>
          <label htmlFor="profile-phone" className="block text-sm font-medium text-lp-text mb-1.5">Phone</label>
          <input
            id="profile-phone"
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="w-full rounded-lg border border-lp-border bg-lp-bg px-3 py-2.5 text-sm text-lp-text focus:outline-none focus:ring-2 focus:ring-lp-orange/50"
            placeholder="+44 …"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-lp-text mb-1.5">Passport number (optional)</label>
          {profile.has_passport && !passportClear && !passportEditing ? (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm text-lp-text-tertiary">••••••••</span>
              <button type="button" onClick={() => setPassportClear(true)} className="text-xs text-lp-orange hover:underline">Clear</button>
              <span className="text-lp-text-tertiary">or</span>
              <button type="button" onClick={() => { setPassport(''); setPassportEditing(true); }} className="text-xs text-lp-orange hover:underline">Change</button>
            </div>
          ) : (
            <input
              type="password"
              value={passport}
              onChange={(e) => { setPassport(e.target.value); setPassportClear(false); }}
              placeholder="Optional – stored encrypted"
              className="w-full rounded-lg border border-lp-border bg-lp-bg px-3 py-2.5 text-sm text-lp-text focus:outline-none focus:ring-2 focus:ring-lp-orange/50"
              autoComplete="off"
            />
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-lp-text mb-1.5">Day rate</label>
            <input
              type="number"
              min={0}
              step={0.01}
              value={dayRate}
              onChange={(e) => setDayRate(e.target.value)}
              placeholder="0.00"
              className="w-full rounded-lg border border-lp-border bg-lp-bg px-3 py-2.5 text-sm text-lp-text focus:outline-none focus:ring-2 focus:ring-lp-orange/50"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-lp-text mb-1.5">Per diem rate</label>
            <input
              type="number"
              min={0}
              step={0.01}
              value={perDiemRate}
              onChange={(e) => setPerDiemRate(e.target.value)}
              placeholder="0.00"
              className="w-full rounded-lg border border-lp-border bg-lp-bg px-3 py-2.5 text-sm text-lp-text focus:outline-none focus:ring-2 focus:ring-lp-orange/50"
            />
          </div>
        </div>

        <div className="pt-2">
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 rounded-lg bg-lp-orange px-5 py-2.5 text-sm font-medium text-white hover:bg-lp-orange-hover disabled:opacity-60 transition-colors"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Save changes
          </button>
        </div>
      </div>
    </div>
  );
}
