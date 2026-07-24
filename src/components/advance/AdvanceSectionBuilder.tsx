'use client';

/* ============================================
   LOWPASS — Advance Section Builder

   SETUP: two-panel section picker + reorder. FILL: accordion form with fields.
   ============================================ */

import { useState, useEffect, useCallback, useRef, Fragment, createContext, useContext } from 'react';
import Link from 'next/link';
import { StartAdvancePanel } from './StartAdvancePanel';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  ChevronDown,
  ChevronRight,
  GripVertical,
  Plus,
  X,
  Save,
  Copy,
  LayoutTemplate,
  MessageSquarePlus,
  Flag,
  Loader2,
  ClipboardList,
  Speaker,
  UtensilsCrossed,
  Clock,
  Truck,
  Users,
  FileText,
  Music,
  MapPin,
  Wifi,
  Car,
  Building2,
  Reply,
  Send,
  Bed,
  Plane,
  ShoppingBag,
  ShieldCheck,
  Banknote,
  Check,
  CheckCircle2,
  Trash2,
  UserPlus,
  Search,
  Star,
  Heart,
  Zap,
  Wrench,
  Camera,
  Mic,
  Headphones,
  Globe,
  Coffee,
  Gift,
  Award,
  Bookmark,
  Tag,
  Hash,
  Link as LinkIcon,
  Paperclip,
  Folder,
  Type,
  AlignLeft,
  ChevronDown as ChevronDownIcon,
  Calendar,
  ToggleLeft,
  Upload,
  User,
  Sliders,
  Lock,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { SlidingToggle } from '@/components/ui/SlidingToggle';
import { useToast } from '@/components/ui/Toast';
import { detectAiCap, aiCapMessage } from '@/lib/ai/client';
import { ContextMenu } from '@/components/ui/ContextMenu';
import { DeleteConfirmationModal } from '@/components/ui/DeleteConfirmationModal';
import { BrandedSelect } from '@/components/ui/BrandedSelect';
import { useAuth } from '@/hooks/useAuth';
import { AddPlatformFieldModal } from './AddPlatformFieldModal';

import {
  relativeTime, STATUS_ORDER, ICON_MAP, CUSTOM_SECTION_ICONS, SectionIcon, FIELD_TYPE_ICONS, FIELD_TYPE_OPTIONS, slugify, FieldTypeIcon, setDragGhost, FieldDef, SectionDef, sortFieldsContactsFirst, sortHospitalityFieldsFirst, ContactRow, AdvanceDocument, KEY_CONTACTS_LABEL, IMPORTANT_DOCUMENTS_KEY, RIDER_LABEL, FLIGHTS_LABEL, SETTLEMENT_LABEL, PARKING_ACCESS_LABEL, SECTION_CONTACT_ROLES, DEFAULT_CONTACT_ROLES, getContactRolesForSection, CONTACT_ROLES, ApiTemplate, AdvanceData, SectionStatuses, AdvanceFlag, PageData, AdvanceComment, AdvanceDropdownZContext, AdvanceDropdownZProvider,
} from './parts/model';
import { SetupMode } from './builder/SetupMode';
import { FillMode } from './fill/FillMode';

export function AdvanceSectionBuilder({
  tourId,
  routingId,
  wrappedInShell = false,
}: {
  tourId: string;
  routingId: string;
  /** Hotfix 3 §2 — when AdvanceBuilderShellClient mounts this
   *  builder inside the three-pane Variant-parity shell, the shell
   *  already renders its own AdvanceSectionLibrary on the left.
   *  This flag tells SetupMode to suppress its internal Library
   *  column so the user sees ONE library, not two. */
  wrappedInShell?: boolean;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  // Post-merge fix-up: when the per-show page routes here with
  // ?mode=edit, the builder must render SetupMode regardless of
  // whether the advance already has sections — the FillMode
  // accordion fall-through (showSetup = setupMode || !hasSections)
  // was swallowing the builder when sections existed, leaving the
  // user stuck on the read view via an edit URL.
  const isBuilderMode = searchParams?.get('mode') === 'edit';
  const { user } = useAuth();
  const [data, setData] = useState<PageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [setupMode, setSetupMode] = useState(false);
  const [saving, setSaving] = useState(false);
  const [autosaveStatus, setAutosaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [conflictWarning, setConflictWarning] = useState<string | null>(null);
  const autosaveRetryRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (autosaveStatus !== 'saved') return;
    const t = setTimeout(() => setAutosaveStatus('idle'), 2500);
    return () => clearTimeout(t);
  }, [autosaveStatus]);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/tours/${tourId}/advance/${routingId}`)
      .then((r) => {
        if (!r.ok) throw new Error('Not found');
        return r.json();
      })
      .then((d) => { if (!cancelled) setData(d); })
      .catch(() => { if (!cancelled) setError(true); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [tourId, routingId]);

  /* R5-1 — the `?all=true` tour-wide fetch that fed the private day strip is
     gone with it. It ran on every builder mount to populate a branch that could
     never render, so this is a dead request removed, not just dead markup. The
     canonical day list is fetched once by AdvanceUpcomingSidebar → <RoutingRail>. */

  const hasSections = data?.advance?.sections?.length ? true : false;
  // Post-merge fix-up: ?mode=edit forces SetupMode regardless of
  // section count. FillMode (the accordion read view) is only the
  // default for show-tab visits, never for explicit builder URLs.
  const showSetup = isBuilderMode || setupMode || !hasSections;

  const [contentVisible, setContentVisible] = useState(false);
  useEffect(() => {
    if (!loading && data) {
      const t = requestAnimationFrame(() => requestAnimationFrame(() => setContentVisible(true)));
      return () => cancelAnimationFrame(t);
    }
    if (loading) setContentVisible(false);
  }, [loading, data]);

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-lp-text-tertiary" />
          <p className="text-sm text-lp-text-tertiary">Loading advance…</p>
        </div>
      </div>
    );
  }
  if (error || !data) {
    // A2 (ADV-40) — no raw "Advance not found.". Advances are created lazily, so
    // offer to start this one (seeds from the tour's default template) instead of
    // dead-ending. A full reload re-mounts the builder against the new instance.
    return (
      <div>
        <StartAdvancePanel tourId={tourId} routingId={routingId} onStarted={() => window.location.reload()} />
        <div className="text-center">
          <Link href={`/advance/${tourId}`} className="inline-block text-sm text-lp-text-secondary hover:text-lp-text">
            Back to advance overview
          </Link>
        </div>
      </div>
    );
  }

  const mainContent = (
    <>
      <Header
        routing={data.routing}
        advance={data.advance}
        saving={saving}
        onSave={async () => {
          if (!data.advance) return;
          setSaving(true);
          try {
            await fetch(`/api/tours/${tourId}/advance/${routingId}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                data: data.advance.data,
                section_statuses: data.advance.section_statuses,
                status: data.advance.status,
              }),
            });
          } finally {
            setSaving(false);
          }
        }}
        showSaveButton={!showSetup && !!data.advance}
        autosaveStatus={autosaveStatus}
        conflictWarning={conflictWarning}
        onAutosaveRetry={() => autosaveRetryRef.current?.()}
      />
      {showSetup ? (
        <SetupMode
          tourId={tourId}
          routingId={routingId}
          currentSections={data.advance?.sections ?? []}
          defaultAdvanceTemplateId={(data.tour as { default_advance_template_id?: string })?.default_advance_template_id ?? null}
          wrappedInShell={wrappedInShell}
          onSaved={async () => {
            const res = await fetch(`/api/tours/${tourId}/advance/${routingId}`);
            if (res.ok) {
              const d = await res.json();
              setData(d);
              setSetupMode(false);
            }
          }}
          onCancel={() => hasSections && setSetupMode(false)}
        />
      ) : (
        <FillMode
          tourId={tourId}
          routingId={routingId}
          artistName={(data.tour as { artist_name?: string | null })?.artist_name ?? null}
          currentUserId={user?.id ?? null}
          currency={data.tour.currency}
          tourPersonnelCounts={{
            principal_count: (data.tour as { principal_count?: number }).principal_count ?? 0,
            band_count: (data.tour as { band_count?: number }).band_count ?? 0,
            crew_count: (data.tour as { crew_count?: number }).crew_count ?? 0,
          }}
          venueName={data.routing.venue_name ?? null}
          venueLat={data.routing.latitude ?? undefined}
          venueLng={data.routing.longitude ?? undefined}
          advance={data.advance!}
          initialLastUpdatedAt={(data.advance as { last_updated_at?: string | null })?.last_updated_at ?? null}
          onAutosaveStatusChange={setAutosaveStatus}
          onConflictWarning={setConflictWarning}
          autosaveRetryRef={autosaveRetryRef}
          onUpdate={(patch) => {
            setData((prev) => {
              if (!prev?.advance) return prev;
              return {
                ...prev,
                advance: {
                  ...prev.advance,
                  ...patch,
                },
              };
            });
          }}
          onEditSections={() => setSetupMode(true)}
          onCopyToOther={() => router.push(`/advance/${tourId}?copy=${routingId}`)}
          onRemoveSection={async (templateId) => {
            const sections = (data.advance?.sections ?? []).filter((s) => s.template_id !== templateId);
            const res = await fetch(`/api/tours/${tourId}/advance`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ routing_id: routingId, sections }),
            });
            if (res.ok) {
              const advanceRes = await fetch(`/api/tours/${tourId}/advance/${routingId}`);
              const d = await advanceRes.json();
              setData(d);
            }
          }}
        />
      )}
    </>
  );

  return (
    <div className={cn('transition-opacity duration-300', contentVisible ? 'opacity-100' : 'opacity-0')}>
      {/* R5-1 — the in-canvas day strip is GONE. It was a private fourth rail
          implementation gated behind `!wrappedInShell`, and the only mount chain
          (AdvanceBuilderShellClient → AdvanceSectionBuilderDynamic → here) always
          passes wrappedInShell, so the branch was unreachable. <RoutingRail> via
          AdvanceUpcomingSidebar is the canonical day picker on this surface. */}
      <div className="space-y-6">{mainContent}</div>
    </div>
  );
}

/**
 * UX22 cleanup P1 — slim toolbar replacing the previous chunky Header.
 * Date / venue / day-type pill / status pill / breadcrumb all duplicated
 * AdvanceShowContextBar from UX22 phase 2; that data is now removed
 * here. The toolbar carries only what the ContextBar doesn't:
 * autosave indicator, Save button, conflict warning. Stays sticky just
 * below the ContextBar via top: var(--lp-topbar-height).
 */
function Header({
  routing,
  advance,
  saving,
  onSave,
  showSaveButton,
  autosaveStatus,
  conflictWarning,
  onAutosaveRetry,
}: {
  routing: PageData['routing'];
  advance: PageData['advance'];
  saving: boolean;
  onSave: () => void;
  showSaveButton?: boolean;
  autosaveStatus?: 'idle' | 'saving' | 'saved' | 'error';
  conflictWarning?: string | null;
  onAutosaveRetry?: () => void;
}) {
  // routing + advance still come in for prop-shape compatibility with
  // existing call sites; only the autosave / save state matters now.
  void routing;
  void advance;

  return (
    <div
      className="sticky z-10 flex flex-wrap items-center justify-end gap-3 rounded-xl border border-lp-border bg-lp-surface/95 px-4 py-2 backdrop-blur"
      style={{ top: 'var(--lp-topbar-height, 56px)' }}
    >
      {conflictWarning ? (
        <p className="text-xs text-amber-600 dark:text-amber-400" title={conflictWarning}>
          {conflictWarning}
        </p>
      ) : null}
      <span className="inline-flex min-w-[6.5rem] items-center overflow-hidden">
        {autosaveStatus === 'saving' && (
          <span className="flex items-center gap-1.5 text-sm text-lp-text-tertiary">
            <Loader2 size={14} className="animate-spin shrink-0" />
            Saving…
          </span>
        )}
        {autosaveStatus === 'saved' && (
          <span className="inline-flex items-center text-sm text-emerald-600 dark:text-emerald-400 animate-slide-in-left">
            Saved ✓
          </span>
        )}
        {autosaveStatus === 'error' && (
          <span className="flex items-center gap-2 text-sm text-red-500">
            Error saving
            <button
              type="button"
              onClick={onAutosaveRetry}
              className="rounded border border-red-500/50 px-2 py-0.5 text-xs font-medium hover:bg-red-500/10 shrink-0"
            >
              Retry
            </button>
          </span>
        )}
      </span>
      {showSaveButton && (
        <button
          type="button"
          onClick={onSave}
          disabled={saving}
          className="btn-transition btn-primary-press flex items-center gap-2 rounded-lg bg-lp-orange px-3.5 py-1.5 text-sm font-medium text-white hover:bg-lp-orange-hover disabled:opacity-50"
        >
          {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
          Save
        </button>
      )}
    </div>
  );
}

