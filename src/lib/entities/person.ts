import { getPersonById, searchPersons } from '@/lib/api/persons';
import { registerEntity } from './registry';

registerEntity({
  kind: 'person',
  fetchById: getPersonById,
  search: searchPersons,
  getLabel: (p) => p.preferredName ?? p.fullName,
  getSecondary: (p) => p.tourPersonnel?.[0]?.role ?? p.email ?? '',
  SlideOverContent: () => import('@/components/entity/person/PersonSlideOver'),
});
