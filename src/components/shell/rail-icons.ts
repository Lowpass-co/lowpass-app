/**
 * String-keyed icon registry for LeftRail items.
 *
 * Why: rail data is built in server components (e.g. `getDashboardLeftRail`)
 * and passed across the server→client boundary into <LeftRail>. lucide-react
 * icon components are forwardRef components (objects with a `render` function)
 * and can't be serialized across that boundary — passing them throws
 * "Functions cannot be passed directly to Client Components".
 *
 * Solution: rail entries reference icons by string key. The LeftRail client
 * component looks up the actual component here.
 *
 * Adding a new key: add a string literal to RailIconKey, then a corresponding
 * entry in railIcons, and import the lucide component above.
 */
import {
  BedDouble,
  BookOpen,
  Building2,
  Calendar,
  ChevronRight,
  ClipboardList,
  Filter,
  Folder,
  LayoutGrid,
  LineChart,
  ListMusic,
  Map,
  Package,
  Plane,
  Speaker,
  Users,
  type LucideIcon,
} from 'lucide-react';

export type RailIconKey =
  | 'layout-grid'
  | 'list-music'
  | 'clipboard-list'
  | 'line-chart'
  | 'map'
  | 'calendar'
  | 'building'
  | 'users'
  | 'folder'
  | 'speaker'
  | 'book-open'
  | 'package'
  | 'bed-double'
  | 'plane'
  | 'filter'
  | 'chevron-right';

export const railIcons: Record<RailIconKey, LucideIcon> = {
  'layout-grid': LayoutGrid,
  'list-music': ListMusic,
  'clipboard-list': ClipboardList,
  'line-chart': LineChart,
  map: Map,
  calendar: Calendar,
  building: Building2,
  users: Users,
  folder: Folder,
  speaker: Speaker,
  'book-open': BookOpen,
  package: Package,
  'bed-double': BedDouble,
  plane: Plane,
  filter: Filter,
  'chevron-right': ChevronRight,
};
