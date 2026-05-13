/* ============================================
   LOWPASS — Packet rider payload fetcher (Sprint 12 §11c)

   Given a packet manifest, walk every rider / channel-list
   doc and build the same PublicRiderPayload shape the §10
   single-rider PDF + public reader use. This is the input to
   buildPacketPdfHtml.

   Rental jobs are NOT rendered into the bundled PDF — they
   have no PDF render function yet (their data is structured
   inventory, not a document). Adam's packet UI lists them as
   manifest entries but the bundle skips them. Tracked as a
   §11 follow-up if/when there's user demand.

   Reuses every helper from the rider-pack stack:
     resolvePack          (lib/rider-packs/resolve)
     signedUrlsForAssets  (lib/rider-packs/assets)
     resolveVariableMap   (lib/rider-packs/variable-resolver)
     substituteInText / substituteInTiptapDoc
     listMics             (lib/rider-packs/mic-library)

   Pure server-side. Accepts either the auth-gated client
   (in-app PDF download) or service-role (public token flow).
   ============================================ */

import type { SupabaseClient } from '@supabase/supabase-js';
import { resolvePack } from '@/lib/rider-packs/resolve';
import { signedUrlsForAssets } from '@/lib/rider-packs/assets';
import { listMics } from '@/lib/rider-packs/mic-library';
import {
  resolveVariableMap,
  substituteInText,
  substituteInTiptapDoc,
} from '@/lib/rider-packs/variable-resolver';
import type {
  Field,
  FieldAsset,
  FieldText,
  MicLibraryEntry,
  RiderPack,
} from '@/lib/rider-packs/types';
import type { PublicRiderPayload } from '@/lib/rider-packs/web-links';
import type { PacketManifest } from './manifest';

/** Build the PublicRiderPayload for every rider / channel-list
 *  doc in the manifest. Returns payloads in manifest order so
 *  the bundled PDF respects the natural sort (show → tour →
 *  artist scope). */
export async function getPacketRiderPayloads(
  client: SupabaseClient,
  manifest: PacketManifest,
): Promise<PublicRiderPayload[]> {
  const packIds = manifest.docs
    .filter((d) => d.kind === 'rider' || d.kind === 'channel_list')
    .map((d) => d.id);
  if (packIds.length === 0) return [];

  /* Load all packs in one round-trip. RLS or the caller's
     auth scope determines visibility. */
  const { data: packs } = await client
    .from('rider_packs')
    .select('*')
    .in('id', packIds);
  if (!packs || packs.length === 0) return [];

  const byId = new Map<string, RiderPack>();
  for (const p of packs as RiderPack[]) byId.set(p.id, p);

  /* One workspace mic library lookup shared by every payload
     (channel_list sections need it for the kind-tag badge).
     workspace_id is identical across all packs since RLS
     scopes by workspace. */
  const firstPack = packs[0] as RiderPack;
  let mics: MicLibraryEntry[] = [];
  try {
    mics = await listMics(client, firstPack.workspace_id);
  } catch {
    mics = [];
  }

  const payloads: PublicRiderPayload[] = [];
  /* Iterate the manifest order rather than the DB order so
     the bundle reads in the same sequence the UI surfaces. */
  for (const doc of manifest.docs) {
    if (doc.kind !== 'rider' && doc.kind !== 'channel_list') continue;
    const pack = byId.get(doc.id);
    if (!pack) continue;
    const payload = await buildRiderPayload(client, pack, mics);
    if (payload) payloads.push(payload);
  }
  return payloads;
}

/** Per-pack payload assembly. Mirrors the public reader +
 *  /api/rider-packs/[id]/pdf flow exactly so the bundled
 *  output looks byte-identical to standalone renders. */
async function buildRiderPayload(
  client: SupabaseClient,
  pack: RiderPack,
  mics: MicLibraryEntry[],
): Promise<PublicRiderPayload | null> {
  const { data: artist } = await client
    .from('artists')
    .select('name, default_logo_url')
    .eq('id', pack.artist_id)
    .maybeSingle<{ name: string; default_logo_url: string | null }>();

  const resolved = await resolvePack(client, pack);

  /* Asset signing — identical to public-rider route. */
  const assetIds = new Set<string>();
  for (const section of resolved.sections) {
    for (const field of section.fields as Field[]) {
      if (field.type === 'asset') {
        const id = (field as FieldAsset).asset_id;
        if (id) assetIds.add(id);
      }
    }
  }
  let signedUrls: Record<string, string | null> = {};
  if (assetIds.size > 0) {
    const { data: assets } = await client
      .from('rider_assets')
      .select('id, asset_type, storage_path, external_url')
      .in('id', Array.from(assetIds));
    if (assets) signedUrls = await signedUrlsForAssets(client, assets);
  }

  /* Cover logo cascade — mirror of public route. */
  const rawCoverLogo = pack.cover_logo_url ?? artist?.default_logo_url ?? null;
  let coverLogoResolved: string | null = rawCoverLogo;
  if (rawCoverLogo && !/^https?:\/\//i.test(rawCoverLogo)) {
    const { data: signed } = await client.storage
      .from('rider-assets')
      .createSignedUrl(rawCoverLogo, 60 * 60);
    coverLogoResolved = signed?.signedUrl ?? null;
  }

  /* Variable substitution — same flow as public route. */
  const varMap = await resolveVariableMap(client, pack);

  const sectionsResolved = resolved.sections.map((s) => {
    let fields = s.fields;
    if (Array.isArray(fields)) {
      fields = (fields as Field[]).map((f) => {
        if (f.type === 'text' && typeof (f as FieldText).value === 'string') {
          return {
            ...(f as FieldText),
            value: substituteInText((f as FieldText).value, varMap),
          };
        }
        return f;
      });
    }
    let metadata = s.metadata ?? null;
    if (s.section_type === 'rich_text' && metadata && typeof metadata === 'object') {
      const meta = metadata as Record<string, unknown>;
      const content = meta.content;
      if (content && typeof content === 'object') {
        metadata = {
          ...meta,
          content: substituteInTiptapDoc(
            content as Parameters<typeof substituteInTiptapDoc>[0],
            varMap,
          ),
        };
      }
    }
    const isChannelList = s.section_type === 'channel_list';
    return {
      id: s.id,
      section_key: s.section_key,
      title: substituteInText(s.title, varMap),
      sort_order: s.sort_order,
      section_type: s.section_type,
      fields,
      metadata,
      inherited_from: s.inherited_from,
      source_pack_id: s.source_pack_id,
      sub_snakes: isChannelList ? s.subSnakes ?? [] : undefined,
      stage_boxes: isChannelList ? s.stageBoxes ?? [] : undefined,
      rows: isChannelList ? s.rows ?? [] : undefined,
    };
  });

  return {
    pack: {
      id: pack.id,
      title: substituteInText(pack.title, varMap) || null,
      scope: pack.scope,
      artist_id: pack.artist_id,
      artist_name: artist?.name ?? 'Unknown artist',
      cover_logo_url: coverLogoResolved,
      cover_subtitle: substituteInText(pack.cover_subtitle, varMap) || null,
      cover_disclaimer: substituteInText(pack.cover_disclaimer, varMap) || null,
      updated_at: pack.updated_at,
    },
    sections: sectionsResolved,
    signedUrls,
    mics,
  };
}
