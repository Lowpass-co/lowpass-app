import { describe, expect, it } from 'vitest';
import { itemsFor } from '@/lib/nav/ia';
import {
  STEPS,
  WELCOME_CARDS,
  checklistFor,
  parseLocal,
  progress,
  shouldAutoWelcome,
  shouldShowChecklist,
  type OnboardingStatus,
} from './checklist';

const none = { artist: false, tour: false, show: false, advance: false, receipt: false, team: false };
const fresh: OnboardingStatus = { canSetUp: true, newMember: true, artistId: null, tourId: null, done: none };
const going: OnboardingStatus = {
  canSetUp: true, newMember: false, artistId: 'a1', tourId: 't1',
  done: { ...none, artist: true, tour: true, show: true },
};

describe('checklist', () => {
  it('is the six steps, in order', () => {
    expect(STEPS.map((s) => s.id)).toEqual(['artist', 'tour', 'show', 'advance', 'receipt', 'team']);
  });

  it('ticks from the facts and points the next step at the latest tour', () => {
    const items = checklistFor(going);
    expect(items.map((i) => i.done)).toEqual([true, true, true, false, false, false]);
    expect(progress(items)).toMatchObject({ done: 3, total: 6 });
    expect(progress(items).next?.id).toBe('advance');
    expect(items.find((i) => i.id === 'advance')?.action).toEqual({ kind: 'link', href: '/advance/t1' });
    expect(items.find((i) => i.id === 'receipt')?.action).toEqual({ kind: 'link', href: '/budget/t1?tab=receipts' });
    expect(items.find((i) => i.id === 'show')?.action).toEqual({ kind: 'link', href: '/operations/t1/routing' });
    expect(items.find((i) => i.id === 'tour')?.action).toEqual({ kind: 'create-tour', artistId: 'a1' });
  });

  it('with no tour yet, tour-bound steps offer to make the tour instead of a dead link', () => {
    const items = checklistFor(fresh);
    for (const id of ['show', 'advance', 'receipt'] as const) {
      const it = items.find((i) => i.id === id)!;
      expect(it.action).toEqual({ kind: 'create-tour', artistId: null });
      expect(it.cta).toBe('New tour');
    }
    expect(items.find((i) => i.id === 'team')?.action).toEqual({ kind: 'link', href: '/settings/members' });
  });

  it('every link it can produce is a page the rail actually has', () => {
    const tourHrefs = itemsFor('tour', null).map((i) => i.href({ scope: 'tour', tourId: 't1', artistId: 'a1', mode: null }));
    const youHrefs = itemsFor('you', null).map((i) => i.href({ scope: 'you', tourId: null, artistId: null, mode: null }));
    for (const item of checklistFor(going)) {
      if (item.action.kind !== 'link') continue;
      expect([...tourHrefs, ...youHrefs], item.id).toContain(item.action.href);
    }
  });
});

describe('welcome', () => {
  it('is four short cards that never mention retired features', () => {
    expect(WELCOME_CARDS).toHaveLength(4);
    const text = WELCOME_CARDS.map((c) => `${c.title} ${c.body}`).join(' ').toLowerCase();
    for (const gone of ['day sheet', 'slider', 'expenses tab', 'money mode', 'production mode']) expect(text).not.toContain(gone);
    for (const c of WELCOME_CARDS) expect(c.body.length).toBeLessThan(170);
  });

  it('opens by itself only for someone new, once', () => {
    expect(shouldAutoWelcome(fresh, { welcomed: false, checklistHidden: false, collapsed: false }, false)).toBe(true);
    // An established workspace on a new laptop: no.
    expect(shouldAutoWelcome(going, { welcomed: false, checklistHidden: false, collapsed: false }, false)).toBe(false);
    // A crew member who just joined an established workspace: yes.
    expect(shouldAutoWelcome({ ...going, canSetUp: false, newMember: true }, { welcomed: false, checklistHidden: false, collapsed: false }, false)).toBe(true);
    // Seen it here, or saw the old panel: no.
    expect(shouldAutoWelcome(fresh, { welcomed: true, checklistHidden: false, collapsed: false }, false)).toBe(false);
    expect(shouldAutoWelcome(fresh, { welcomed: false, checklistHidden: false, collapsed: false }, true)).toBe(false);
  });

  it('the checklist is for people who can set up, after the welcome, until hidden', () => {
    expect(shouldShowChecklist(fresh, { welcomed: true, checklistHidden: false, collapsed: false })).toBe(true);
    expect(shouldShowChecklist(fresh, { welcomed: false, checklistHidden: false, collapsed: false })).toBe(false);
    expect(shouldShowChecklist(fresh, { welcomed: true, checklistHidden: true, collapsed: false })).toBe(false);
    expect(shouldShowChecklist({ ...fresh, canSetUp: false }, { welcomed: true, checklistHidden: false, collapsed: false })).toBe(false);
  });

  it('reads stored state defensively', () => {
    expect(parseLocal(null)).toEqual({ welcomed: false, checklistHidden: false, collapsed: false });
    expect(parseLocal('not json')).toEqual({ welcomed: false, checklistHidden: false, collapsed: false });
    expect(parseLocal('"x"')).toEqual({ welcomed: false, checklistHidden: false, collapsed: false });
    expect(parseLocal('{"welcomed":true,"checklistHidden":"yes","collapsed":true}')).toEqual({ welcomed: true, checklistHidden: false, collapsed: true });
  });
});
