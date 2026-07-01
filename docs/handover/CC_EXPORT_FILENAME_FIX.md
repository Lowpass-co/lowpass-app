# CC — Export 500 ROOT CAUSE FOUND: em-dash in the Content-Disposition filename. One fix. Branch off `fix/export-500-loader`.

The total guard surfaced the real exception (Claude read it live off the guarded deploy):

```
TypeError: Cannot convert argument to a ByteString because the character at index 38
has a value of 8212 which is greater than 255.
   at new Response (undici … ResponseInit … HeadersInit … ByteString)
```

**Char 8212 = the em dash (—).** The crash is at `new Response`, constructing the **`Content-Disposition`**
header. The download filename is `<Artist> — <Tour> — Budget.pdf` (and `… — Rooming.pdf`) — the **`" — "`
separator is an em dash**, and HTTP header values must be Latin-1 (≤255), so `new Response` throws.

**The PDF renders fine** (the failing run took 5.5 s — a full successful render; income is present after the
routing fix). This is purely the **download filename header**. Don't touch the render.

## The fix (shared → budget + rooming + future Payroll/Routing inherit it)
Build a **header-safe Content-Disposition** in one shared helper. The artist/tour name can contain an em
dash AND accented characters (José, Beyoncé…) — both break a raw `filename="…"`. Use **RFC 5987**:

```
const safeAscii = rawName.normalize('NFKD').replace(/[^\x20-\x7E]/g, '-').replace(/"/g, '');
const headerVal = `attachment; filename="${safeAscii}"; filename*=UTF-8''${encodeURIComponent(rawName)}`;
```

- `filename="…"` = the ASCII fallback (em dash / accents → `-`, quotes stripped) — Latin-1 safe, never throws.
- `filename*=UTF-8''…` = the real Unicode name for modern browsers.
- Put this in the **shared render/response path** (`render.ts` / wherever the `NextResponse` with the PDF
  buffer is built) so every surface uses it. Replace the em-dash separators in the filename construction
  with a hyphen too (or just let the sanitizer handle it).

## Hard rules
- **Branch off `fix/export-500-loader`. Commit + PUSH. Confirm `git log origin/<branch>`.**
- Don't touch the render, the loaders (the routing fix stays), or the data — this is **only** the
  `Content-Disposition` header construction.
- Keep the total guard (it just proved its worth).
- Tokens; `next build --webpack`; `tsc` 0; `eslint` 0.
- **Verify by actually returning a PDF:** export a budget whose tour/artist name has an em dash or accent →
  `200`, `application/pdf`, a real multi-page PDF, and a sensible download filename. Confirm the route no
  longer 500s. (This should be the green light — the render was always fine.)
