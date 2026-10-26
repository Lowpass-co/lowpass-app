/* Where uploaded import files live (Oct 2026 AI schedule import). Route files
   may only export handlers, so these shared facts live here. */

export const IMPORT_BUCKET = 'tour-files';

/** Storage folder an import's files live in for this workspace. */
export function importPrefix(workspaceId: string): string {
  return `imports/${workspaceId}/`;
}

/** True when `path` is a file inside this workspace's import folder (and
 *  can't climb out of it). The read route refuses anything else. */
export function isOwnImportPath(path: string, workspaceId: string): boolean {
  return (
    typeof path === 'string' &&
    path.startsWith(importPrefix(workspaceId)) &&
    !path.includes('..') &&
    !path.includes('\\') &&
    path.length < 400
  );
}
