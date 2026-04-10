'use client';

/** Artist preview card: 128x128 image, name, optional "Via Spotify", and "Change artist" button. Shared by Existing Artist and New Artist (Spotify) tabs. */
export function ArtistPreviewCard({
  imageUrl,
  name,
  viaLabel,
  onChangeArtist,
}: {
  imageUrl?: string | null;
  name: string;
  viaLabel?: string;
  onChangeArtist: () => void;
}) {
  const initial = name.trim().charAt(0).toUpperCase() || '?';

  return (
    <div className="rounded-xl bg-lp-bg-secondary overflow-hidden max-w-xs mx-auto">
      {imageUrl ? (
        <img
          src={imageUrl}
          alt={name}
          className="w-full aspect-square object-cover"
        />
      ) : (
        <div className="flex aspect-square w-full items-center justify-center bg-gradient-to-br from-lp-bg-secondary to-lp-bg-tertiary">
          <span className="text-4xl font-bold text-lp-text-secondary">{initial}</span>
        </div>
      )}
      <div className="p-4 flex flex-col gap-1">
        <span className="text-xl font-bold text-lp-text">{name}</span>
        {viaLabel && <span className="text-xs text-lp-text-muted">{viaLabel}</span>}
        <button
          type="button"
          onClick={onChangeArtist}
          className="text-sm text-lp-accent hover:underline text-left mt-1 w-fit"
        >
          Change artist
        </button>
      </div>
    </div>
  );
}
