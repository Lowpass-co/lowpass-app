/** Serializable data for the UX02 TopBar (server-fetched, passed to ShellTopBarClient). */
export type ShellTopBarTour = {
  id: string;
  name: string;
  status: 'active' | 'archived';
  /** Artist this tour belongs to. Used to group the dropdown + auto-scope
   *  ArtistTourContext on selection so downstream pages re-filter cleanly. */
  artistId: string | null;
  artistName: string | null;
};

export type ShellData = {
  user: { name: string; email: string; avatarUrl?: string | null } | null;
  tours: ShellTopBarTour[];
};
