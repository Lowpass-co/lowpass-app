/* ============================================
   LOWPASS — File / folder share link (Nov 2026)

   /f/[token] — what someone sees when a TM shares a tour file or folder.
   Outside the (app) shell on purpose: no account, no app nav. Public via
   publicRoutes.ts '/f/'; every read and write goes through
   /api/public/file-link/[token]/*, which owns the token, password, expiry
   and scope checks.
   ============================================ */

import { PublicFileLinkView } from '@/components/files/PublicFileLinkView';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Shared files', description: 'Files shared with you through Lowpass.', robots: { index: false, follow: false } };

export default async function FileLinkPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <PublicFileLinkView token={token} />;
}
