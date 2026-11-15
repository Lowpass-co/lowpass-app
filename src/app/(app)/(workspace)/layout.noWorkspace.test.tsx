/* The workspace layout never sends a SIGNED-IN user to /login: the middleware
   bounces a signed-in user on /login back to /artists, so that redirect looped
   (a new sign-up with no workspace membership — migration 290). */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { isValidElement } from 'react';

const ctx = vi.hoisted(() => ({ user: null as null | { id: string; email?: string }, workspaceName: null as string | null }));
const redirect = vi.hoisted(() => vi.fn((to: string) => { throw new Error(`REDIRECT ${to}`); }));

vi.mock('next/navigation', () => ({ redirect }));
vi.mock('next/headers', () => ({ headers: async () => new Map([['x-pathname', '/artists']]) }));
vi.mock('@/lib/server/requestContext', () => ({
  getRequestSupabase: async () => ({}),
  getRequestUser: async () => ctx.user,
  getRequestWorkspaceName: async () => ctx.workspaceName,
}));
vi.mock('@/server/workspace/landingPreference', () => ({ getLandingSuggestion: async () => null }));
vi.mock('@/components/shell-v3/ShellV3Mount', () => ({ ShellV3Mount: ({ children }: { children: unknown }) => children }));
vi.mock('@/components/shell-v2/EmptyWorkspacePrompt', () => ({ EmptyWorkspacePrompt: () => null }));

import WorkspaceLayout from './layout';
import { NoWorkspace } from '@/components/onboarding/NoWorkspace';

beforeEach(() => {
  redirect.mockClear();
  ctx.user = null;
  ctx.workspaceName = null;
});

describe('(workspace) layout', () => {
  it('signed out → /login', async () => {
    await expect(WorkspaceLayout({ children: null })).rejects.toThrow('REDIRECT /login');
  });

  it('signed in with no workspace it can open → the NoWorkspace page, never /login (that looped)', async () => {
    ctx.user = { id: 'u1', email: 'new@x.com' };
    const out = await WorkspaceLayout({ children: null });
    expect(redirect).not.toHaveBeenCalled();
    expect(isValidElement(out) && out.type).toBe(NoWorkspace);
    expect(isValidElement(out) && (out.props as { email: string }).email).toBe('new@x.com');
  });

  it('signed in with a workspace → the page, inside the shell', async () => {
    ctx.user = { id: 'u1' };
    ctx.workspaceName = "Dave's Workspace";
    const out = await WorkspaceLayout({ children: 'PAGE' });
    expect(redirect).not.toHaveBeenCalled();
    expect(isValidElement(out) && out.type).not.toBe(NoWorkspace);
  });
});
