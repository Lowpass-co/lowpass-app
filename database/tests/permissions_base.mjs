// Minimal Supabase-shaped database for permission migrations (292/293).
import { PGlite } from '@electric-sql/pglite';
export const WS = '00000000-0000-0000-0000-0000000000a1', WS2 = '00000000-0000-0000-0000-0000000000b1';
export const ADAM = '00000000-0000-0000-0000-00000000000a', MGR = '00000000-0000-0000-0000-00000000000d',
  PA = '00000000-0000-0000-0000-00000000000e', CREW = '00000000-0000-0000-0000-00000000000f',
  NOBODY = '00000000-0000-0000-0000-000000000010', OTHER = '00000000-0000-0000-0000-00000000000b';
export const T1 = '10000000-0000-0000-0000-000000000001', T2 = '10000000-0000-0000-0000-000000000002', TX = '10000000-0000-0000-0000-0000000000ff';
export const R1 = '20000000-0000-0000-0000-000000000001', R2 = '20000000-0000-0000-0000-000000000002';
export const PK1 = '30000000-0000-0000-0000-000000000001', PKA = '30000000-0000-0000-0000-00000000000a';
export const L1 = '40000000-0000-0000-0000-000000000001', S1 = '50000000-0000-0000-0000-000000000001';
export const P_CREW = '60000000-0000-0000-0000-000000000001', P_OTHER = '60000000-0000-0000-0000-000000000002';

export async function base() {
  const db = new PGlite();
  await db.exec(`
CREATE ROLE authenticated; CREATE ROLE anon; CREATE ROLE service_role BYPASSRLS;
CREATE SCHEMA auth; CREATE SCHEMA storage;
CREATE TABLE auth.users (id uuid primary key, email text);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
GRANT USAGE ON SCHEMA auth, storage, public TO authenticated, service_role, anon; GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated, service_role, anon;
CREATE TABLE storage.buckets (id text primary key, public boolean);
CREATE TABLE storage.objects (id serial primary key, bucket_id text, name text, owner uuid);
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
CREATE FUNCTION storage.foldername(name text) RETURNS text[] LANGUAGE sql IMMUTABLE AS $$ SELECT (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'),1)-1] $$;
GRANT EXECUTE ON FUNCTION storage.foldername(text) TO authenticated, anon, service_role;
CREATE TABLE public.workspaces (id uuid primary key, name text, owner_id uuid);
CREATE TABLE public.workspace_members (id uuid primary key default gen_random_uuid(), user_id uuid, workspace_id uuid, role text, is_workspace_owner boolean default false, created_at timestamptz default now(), unique(user_id, workspace_id));
CREATE TABLE public.workspace_member_tags (id uuid primary key default gen_random_uuid(), workspace_id uuid, member_id uuid references public.workspace_members(id) on delete cascade, tag_name text, unique(member_id, tag_name));
CREATE TABLE public.permission_grants (id uuid primary key default gen_random_uuid(), workspace_id uuid, subject_type text, subject_id text, resource_type text, resource_id text, permission text, unique (workspace_id, subject_type, subject_id, resource_type, resource_id, permission));
CREATE TABLE public.profiles (id uuid primary key, workspace_id uuid, is_site_admin boolean default false, email text, name text);
CREATE TABLE public.audit_log (id serial, workspace_id uuid, actor_user_id uuid, action text, entity_type text, entity_id uuid, field_changes jsonb);
CREATE TABLE public.tours (id uuid primary key default gen_random_uuid(), workspace_id uuid, artist_id uuid, name text);
CREATE TABLE public.routing (id uuid primary key default gen_random_uuid(), tour_id uuid references public.tours(id) on delete cascade, date date);
CREATE TABLE public.rider_packs (id uuid primary key default gen_random_uuid(), workspace_id uuid, tour_id uuid, routing_id uuid, artist_id uuid, name text);
CREATE TABLE public.budget_line_items (id uuid primary key default gen_random_uuid(), workspace_id uuid, tour_id uuid, routing_id uuid, name text);
CREATE TABLE public.settlement (id uuid primary key default gen_random_uuid(), workspace_id uuid, routing_id uuid);
CREATE TABLE public.personnel (id uuid primary key default gen_random_uuid(), workspace_id uuid, name text, user_id uuid, passport_info jsonb default '{}');
CREATE TABLE public.workspace_invites (id uuid primary key default gen_random_uuid(), workspace_id uuid, invited_email text, invited_role text default 'readonly', initial_tags text[] not null default '{}', initial_grants jsonb not null default '[]', token text unique, invited_by_user_id uuid, expires_at timestamptz default now() + interval '14 days', accepted_at timestamptz, accepted_user_id uuid);
CREATE FUNCTION public.get_my_workspace_id() RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT p.workspace_id FROM public.profiles p WHERE p.id = auth.uid() AND EXISTS (SELECT 1 FROM public.workspace_members m WHERE m.user_id = p.id AND m.workspace_id = p.workspace_id) $$;
CREATE FUNCTION public.get_my_role() RETURNS text LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT m.role FROM public.profiles p JOIN public.workspace_members m ON m.user_id = p.id AND m.workspace_id = p.workspace_id WHERE p.id = auth.uid() $$;
CREATE FUNCTION public.is_workspace_admin() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$ SELECT public.get_my_role() = 'admin' $$;
CREATE FUNCTION public.is_site_admin() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$ SELECT coalesce((SELECT is_site_admin FROM public.profiles WHERE id = auth.uid()), false) $$;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON storage.objects TO authenticated, service_role;
INSERT INTO auth.users VALUES ('${ADAM}','adam@x'),('${MGR}','mgr@x'),('${PA}','pa@x'),('${CREW}','crew@x'),('${NOBODY}','nobody@x'),('${OTHER}','other@x');
INSERT INTO public.workspaces VALUES ('${WS}','Adam','${ADAM}'),('${WS2}','Other','${OTHER}');
INSERT INTO public.profiles (id, workspace_id, email, is_site_admin) VALUES ('${ADAM}','${WS}','adam@x', true),('${MGR}','${WS}','mgr@x', false),('${PA}','${WS}','pa@x', false),('${CREW}','${WS}','crew@x', false),('${NOBODY}','${WS}','nobody@x', false),('${OTHER}','${WS2}','other@x', false);
INSERT INTO public.workspace_members (user_id, workspace_id, role) VALUES ('${ADAM}','${WS}','admin'),('${MGR}','${WS}','manager'),('${PA}','${WS}','readonly'),('${CREW}','${WS}','readonly'),('${NOBODY}','${WS}','readonly'),('${OTHER}','${WS2}','admin');
INSERT INTO public.tours (id, workspace_id, name) VALUES ('${T1}','${WS}','Tour One'),('${T2}','${WS}','Tour Two'),('${TX}','${WS2}','Other WS tour');
INSERT INTO public.routing (id, tour_id, date) VALUES ('${R1}','${T1}','2026-12-01'),('${R2}','${T2}','2026-12-02');
INSERT INTO public.rider_packs (id, workspace_id, tour_id, name) VALUES ('${PK1}','${WS}','${T1}','Tour 1 rider'),('${PKA}','${WS}',NULL,'Artist rider');
INSERT INTO public.budget_line_items (id, workspace_id, tour_id, name) VALUES ('${L1}','${WS}','${T1}','Bus');
INSERT INTO public.settlement (id, workspace_id, routing_id) VALUES ('${S1}','${WS}','${R1}');
INSERT INTO public.personnel (id, workspace_id, name) VALUES ('${P_CREW}','${WS}','Dil'),('${P_OTHER}','${WS}','Sam');
`);
  const as = async (uid, sql, role = 'authenticated') => {
    await db.exec(`RESET ROLE; SELECT set_config('request.jwt.claim.sub', '${uid ?? ''}', false); SET ROLE ${role};`);
    try { return (await db.query(sql)).rows; } catch (e) { return { error: e.message }; } finally { await db.exec('RESET ROLE'); }
  };
  return { db, as };
}

let fails = 0;
export function check(name, got, want) {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) console.log('  ok  ', name);
  else { fails++; console.log('  FAIL', name, '\n       got ', g, '\n       want', w); }
}
export function done() { console.log(fails ? `\n${fails} FAILED` : '\nall passed'); process.exit(fails ? 1 : 0); }
