import type { LeftRailVariant } from '@/components/shell/LeftRail';

type DocSectionsRail = Extract<LeftRailVariant, { kind: 'docSections' }>;

export function getSettingsLeftRail(activeId: string): DocSectionsRail {
  return {
    kind: 'docSections',
    activeId,
    sections: [
      { id: 'account', label: 'Account', href: '/settings#account' },
      { id: 'workspace', label: 'Workspace', href: '/settings#workspace' },
      { id: 'billing', label: 'Billing', href: '/settings#billing' },
      { id: 'integrations', label: 'Integrations', href: '/settings#integrations' },
    ],
  };
}
