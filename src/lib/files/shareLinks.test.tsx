import { describe, expect, it } from 'vitest';
import {
  can,
  cleanActorName,
  cleanFileName,
  inFolder,
  isScopePath,
  linkState,
  parseCreate,
  relativeFolder,
  repointFolder,
  sanitizeFolder,
  storagePath,
  uploadFolder,
  versionCount,
  withPreviousVersion,
} from './shareLinks';

const NOW = new Date('2026-11-08T12:00:00Z');

describe('folders', () => {
  it('a folder link covers the folder and everything under it, nothing beside it', () => {
    expect(inFolder('Contracts', 'Contracts')).toBe(true);
    expect(inFolder('Contracts', 'Contracts/2026')).toBe(true);
    expect(inFolder('Contracts', 'Contracts 2')).toBe(false);
    expect(inFolder('Contracts', 'Contractsx/a')).toBe(false);
    expect(inFolder('Contracts/2026', 'Contracts')).toBe(false);
    expect(inFolder('Contracts', null)).toBe(false);
    expect(inFolder('Contracts', '')).toBe(false);
  });

  it('shows paths relative to the shared folder', () => {
    expect(relativeFolder('Contracts', 'Contracts')).toBe('');
    expect(relativeFolder('Contracts', 'Contracts/2026/Signed')).toBe('2026/Signed');
  });

  it('uploads always land inside the shared folder', () => {
    expect(uploadFolder('Contracts', '')).toBe('Contracts');
    expect(uploadFolder('Contracts', ' 2026 / Signed ')).toBe('Contracts/2026/Signed');
    expect(uploadFolder('Contracts', '/')).toBe('Contracts');
    expect(uploadFolder('Contracts', 42)).toBe('Contracts');
    // ".." is a folder name here, not a way out.
    expect(uploadFolder('Contracts', '../Payroll')).toBe('Contracts/../Payroll');
    expect(inFolder('Contracts', uploadFolder('Contracts', '../Payroll'))).toBe(true);
  });

  it('follows a folder rename, including links to subfolders', () => {
    expect(repointFolder('Contracts', 'Contracts', 'Deals')).toBe('Deals');
    expect(repointFolder('Contracts/2026', 'Contracts', 'Deals')).toBe('Deals/2026');
    expect(repointFolder('Contracts 2', 'Contracts', 'Deals')).toBeNull();
  });

  it('sanitizes folder paths the same way /api/files does', () => {
    expect(sanitizeFolder(' a / b ')).toBe('a/b');
    expect(sanitizeFolder('///')).toBeNull();
    expect(sanitizeFolder('x'.repeat(513))).toBeNull();
  });
});

describe('link state and permissions', () => {
  const live = { access: 'view' as const, revoked_at: null, expires_at: null };
  it('revoked beats everything, then expiry', () => {
    expect(linkState({ revoked_at: '2026-01-01', expires_at: '2099-01-01' }, NOW)).toBe('revoked');
    expect(linkState({ revoked_at: null, expires_at: '2026-11-08T11:59:59Z' }, NOW)).toBe('expired');
    expect(linkState({ revoked_at: null, expires_at: '2026-11-08T12:00:01Z' }, NOW)).toBe('ok');
    expect(linkState({ revoked_at: null, expires_at: null }, NOW)).toBe('ok');
  });

  it('view links read; only live edit links write; nothing ever deletes', () => {
    expect(can(live, 'download', NOW)).toBe(true);
    expect(can(live, 'upload', NOW)).toBe(false);
    expect(can(live, 'new_version', NOW)).toBe(false);
    expect(can({ ...live, access: 'edit' }, 'upload', NOW)).toBe(true);
    expect(can({ ...live, access: 'edit', revoked_at: '2026-01-01' }, 'download', NOW)).toBe(false);
  });
});

describe('input', () => {
  it('names: trimmed, no control characters, capped', () => {
    expect(cleanActorName('  Sam\n Smith ')).toBe('Sam Smith');
    expect(cleanActorName('   ')).toBeNull();
    expect(cleanActorName(7)).toBeNull();
    expect(cleanActorName('x'.repeat(100))).toHaveLength(60);
    expect(cleanFileName('../../etc/passwd')).toBe('....etcpasswd');
    expect(cleanFileName('')).toBe('file');
  });

  it('storage names stay inside the workspace/scope prefix and never collide', () => {
    expect(storagePath('ws', 't1', '../../Rider v3.pdf', 1)).toMatch(/^ws\/tour\/t1\/\.\._\.\._Rider_v3-1-[a-z0-9]{1,6}\.pdf$/);
    expect(storagePath('ws', 'a1', 'x.pdf', 1, 'artist')).toMatch(/^ws\/artist\/a1\/x-1-/);
    expect(storagePath('ws', 't1', 'x.pdf', 1)).not.toBe(storagePath('ws', 't1', 'x.pdf', 1));
    const p = storagePath('ws', 't1', 'x.pdf');
    expect(isScopePath(p, 'ws', 'tour', 't1')).toBe(true);
    expect(isScopePath(p, 'ws', 'tour', 't2')).toBe(false);
    expect(isScopePath(p, 'other', 'tour', 't1')).toBe(false);
    expect(isScopePath('ws/tour/t1/../t2/x.pdf', 'ws', 'tour', 't1')).toBe(false);
    expect(isScopePath('ws/tour/t1/sub/x.pdf', 'ws', 'tour', 't1')).toBe(false);
    expect(isScopePath('ws/tour/t1/', 'ws', 'tour', 't1')).toBe(false);
    expect(isScopePath(42, 'ws', 'tour', 't1')).toBe(false);
  });

  it('create: one target, valid access, sane expiry and password', () => {
    const base = { tourId: 't1', access: 'view' };
    expect(parseCreate({ ...base, fileId: 'f1' }, NOW)).toEqual({
      ok: true, value: { tourId: 't1', fileId: 'f1', folder: null, access: 'view', expiresAt: null, password: null, label: null },
    });
    expect(parseCreate({ ...base, folder: ' Contracts / 2026 ' }, NOW)).toMatchObject({ ok: true, value: { folder: 'Contracts/2026' } });
    expect(parseCreate({ ...base, fileId: 'f1', folder: 'X' }, NOW).ok).toBe(false);
    expect(parseCreate({ ...base }, NOW).ok).toBe(false);
    expect(parseCreate({ ...base, folder: '///' }, NOW).ok).toBe(false);
    expect(parseCreate({ tourId: 't1', folder: 'X', access: 'admin' }, NOW).ok).toBe(false);
    expect(parseCreate({ ...base, folder: 'X', expiresAt: '2026-11-07T00:00:00Z' }, NOW)).toEqual({ ok: false, error: 'The expiry date is in the past' });
    expect(parseCreate({ ...base, folder: 'X', expiresAt: '2030-01-01T00:00:00Z' }, NOW).ok).toBe(false);
    expect(parseCreate({ ...base, folder: 'X', expiresAt: 'soon' }, NOW).ok).toBe(false);
    expect(parseCreate({ ...base, folder: 'X', password: 'abc' }, NOW).ok).toBe(false);
    expect(parseCreate({ ...base, folder: 'X', password: '', expiresAt: '' }, NOW)).toMatchObject({ ok: true, value: { password: null, expiresAt: null } });
  });
});

describe('versions', () => {
  it('puts the replaced object first, keeps the folder, caps the history', () => {
    const v = (n: number) => ({ path: `p${n}`, name: `v${n}`, size: n, type: 'x', replaced_at: 't', replaced_by: 'Sam' });
    const m = withPreviousVersion({ folder: 'Contracts', versions: [v(1)] }, v(2));
    expect(m.folder).toBe('Contracts');
    expect((m.versions as { path: string }[]).map((x) => x.path)).toEqual(['p2', 'p1']);
    expect(versionCount(m)).toBe(2);
    let many: Record<string, unknown> = {};
    for (let i = 0; i < 25; i++) many = withPreviousVersion(many, v(i));
    expect(versionCount(many)).toBe(20);
    expect(versionCount(null)).toBe(0);
  });
});
