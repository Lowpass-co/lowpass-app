/* ============================================
   LOWPASS — <WorkspaceTopBar> (Sprint 10 §1.6 — null no-op)

   Was: minimal workspace-landing header on /artists with a
   Lowpass wordmark + workspace name + search trigger + user
   avatar.

   Sprint 10 §1.2 — replaced by the unified <UnifiedTopBar>
   mounted at (app)/layout.tsx. The /artists page still imports
   this; returning null keeps the export so the import compiles
   while ensuring no chrome doubles up.
   ============================================ */

interface WorkspaceTopBarProps {
  workspaceName: string;
}

export function WorkspaceTopBar({ workspaceName }: WorkspaceTopBarProps) {
  void workspaceName;
  return null;
}
