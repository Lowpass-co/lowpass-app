/** Serializable data for the UX02 TopBar (server-fetched, passed to ShellTopBarClient). */
export type ShellTopBarTour = {
  id: string;
  name: string;
  status: 'active' | 'archived';
};

export type ShellData = {
  user: { name: string; email: string; avatarUrl?: string | null } | null;
  tours: ShellTopBarTour[];
};
