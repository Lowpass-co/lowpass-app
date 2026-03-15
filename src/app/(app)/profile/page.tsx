/* ============================================
   LOWPASS — Profile Page

   Edit profile: avatar, name, job title, contact.
   ============================================ */

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
};

export default function ProfilePage() {
  const { showToast } = useToast();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState('');
  const [jobTitle, setJobTitle] = useState('');
  const [phone, setPhone] = useState('');

  useEffect(() => {
    fetch('/api/profile')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('Failed to load'))))
      .then((data) => {
        setProfile(data);
        setName(data.name ?? '');
        setJobTitle(data.job_title ?? '');
        setPhone(data.phone ?? '');
      })
      .catch(() => showToast('Could not load profile', 'error'))
      .finally(() => setLoading(false));
  }, [showToast]);

  const handleSave = () => {
    setSaving(true);
    fetch('/api/profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, job_title: jobTitle || null, phone: phone || null }),
    })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('Save failed'))))
      .then((data) => {
        setProfile((p) => (p ? { ...p, ...data } : p));
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
        const url = data.url as string;
        return fetch('/api/profile', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ avatar_url: url }),
        });
      })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('Update failed'))))
      .then((data) => {
        setProfile((p) => (p ? { ...p, avatar_url: data.avatar_url } : p));
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
          Update your photo, name, job title, and contact details.
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
          <label htmlFor="profile-name" className="block text-sm font-medium text-lp-text mb-1.5">
            Name
          </label>
          <input
            id="profile-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-lg border border-lp-border bg-lp-bg px-3 py-2.5 text-sm text-lp-text focus:outline-none focus:ring-2 focus:ring-lp-orange/50"
            placeholder="Your name"
          />
        </div>
        <div>
          <label htmlFor="profile-email" className="block text-sm font-medium text-lp-text mb-1.5">
            Email
          </label>
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
          <label htmlFor="profile-job" className="block text-sm font-medium text-lp-text mb-1.5">
            Job title
          </label>
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
          <label htmlFor="profile-phone" className="block text-sm font-medium text-lp-text mb-1.5">
            Phone
          </label>
          <input
            id="profile-phone"
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="w-full rounded-lg border border-lp-border bg-lp-bg px-3 py-2.5 text-sm text-lp-text focus:outline-none focus:ring-2 focus:ring-lp-orange/50"
            placeholder="+44 …"
          />
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
