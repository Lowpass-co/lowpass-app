import type { LeftRailVariant } from '@/components/shell/LeftRail';

type DocSectionsRail = Extract<LeftRailVariant, { kind: 'docSections' }>;

export function getSettingsLeftRail(activeId: string, opts?: { isSiteAdmin?: boolean }): DocSectionsRail {
  const sections: DocSectionsRail['sections'] = [
    { id: 'account', label: 'Account', href: '/settings#account' },
    { id: 'workspace', label: 'Workspace', href: '/settings#workspace' },
    { id: 'billing', label: 'Billing', href: '/settings#billing' },
    { id: 'integrations', label: 'Integrations', href: '/settings#integrations' },
  ];
  if (opts?.isSiteAdmin) {
    sections.push({ id: 'bugs', label: 'Bug Reports', href: '/bugs' });
  }
  return {
    kind: 'docSections',
    activeId,
    sections,
  };
}
