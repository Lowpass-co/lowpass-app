'use client';

import { useState } from 'react';
import { NewPackForm } from '@/components/rider-pack/PackEditor';
import { ImportRiderPackDialog } from '@/components/rider-pack/ImportRiderPackDialog';

export function RiderPacksIndexToolbar({
  artists,
  contextArtist,
  sectionLabel,
}: {
  artists: { id: string; name: string }[];
  contextArtist: { id: string; name: string } | null;
  sectionLabel: string;
}) {
  const [importOpen, setImportOpen] = useState(false);
  const otherArtists = artists.filter((a) => a.id !== contextArtist?.id);
  const showImport = contextArtist && otherArtists.length > 0;

  return (
    <>
      <div
        className="flex flex-col gap-2 border-b sm:flex-row sm:items-center sm:justify-between"
        style={{ borderColor: 'var(--lp-border)' }}
      >
        <div className="px-4 py-2 text-[10px] font-semibold uppercase tracking-widest text-lp-text-tertiary">
          {sectionLabel}
        </div>
        {showImport && (
          <div className="shrink-0 px-4 pb-2 sm:py-2">
            <button
              type="button"
              onClick={() => setImportOpen(true)}
              className="text-xs font-medium text-[var(--lp-orange)] hover:underline"
            >
              Import from another band…
            </button>
          </div>
        )}
      </div>
      <NewPackForm artists={artists} lockArtist={contextArtist} />
      {contextArtist && (
        <ImportRiderPackDialog
          open={importOpen}
          onOpenChange={setImportOpen}
          targetArtist={contextArtist}
          otherArtists={otherArtists}
        />
      )}
    </>
  );
}
