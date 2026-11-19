import { describe, expect, it } from 'vitest';
import { betaCodeProblem, generateBetaCode, normaliseBetaCode } from './betaCodes';

describe('beta codes', () => {
  it('look like XXXX-XXXX-XXXX from an unambiguous alphabet', () => {
    for (let i = 0; i < 50; i++) expect(generateBetaCode()).toMatch(/^[A-HJ-KM-NP-Z2-9]{4}-[A-HJ-KM-NP-Z2-9]{4}-[A-HJ-KM-NP-Z2-9]{4}$/);
  });
  it('typed codes normalise (case, spaces, missing dashes)', () => {
    expect(normaliseBetaCode(' abcd efgh-jkmn ')).toBe('ABCD-EFGH-JKMN');
  });
  const ok = { id: '1', email: 'sam@x.com', expires_at: '2099-01-01T00:00:00Z', revoked_at: null, redeemed_at: null };
  it('a code works once, for its email, until it expires or is turned off', () => {
    expect(betaCodeProblem(ok, 'Sam@X.com ')).toBeNull();
    expect(betaCodeProblem(null, 'sam@x.com')).toMatch(/isn’t right/);
    expect(betaCodeProblem(ok, 'other@x.com')).toMatch(/different email/);
    expect(betaCodeProblem({ ...ok, redeemed_at: '2026-01-01' }, 'sam@x.com')).toMatch(/already been used/);
    expect(betaCodeProblem({ ...ok, revoked_at: '2026-01-01' }, 'sam@x.com')).toMatch(/turned off/);
    expect(betaCodeProblem({ ...ok, expires_at: '2020-01-01T00:00:00Z' }, 'sam@x.com')).toMatch(/expired/);
  });
});
