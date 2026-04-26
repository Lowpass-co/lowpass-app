# SlideOver Contract

> The slide-over is for **context, not editing**. Read this before adding a slide-over to any page.

## When to use SlideOver

- Showing supplementary detail about a list item without leaving the list
- Holding notes, files, receipts, comments, math, activity for a record
- Quick lookup of a referenced entity (Person, Flight, Room, Gear) via EntityChip click (UX08)

## When NOT to use SlideOver

- As the primary edit surface for the record's main fields
- For pages designed to be printed (Routing, Channel List)
- For form-heavy creation flows (use a full page or a Modal)
- For confirmation dialogs (use a Modal)

## Allowed exceptions

- **Admin tools whose record exists nowhere else (Bug Reports).** The slide-over is the only admin view for a bug. Document the exception in code with a comment pointing to this file. Do not use this as a blanket excuse to ship primary forms in a slide-over.

## Standard body sections

Inside `children`, prefer this order (see `src/components/shell/SlideOver.tsx` for header/footer slots only):

1. **Notes** — rich text or plain markdown editor
2. **Attachments** — file list + upload
3. **Receipts** (where applicable) — linked Expense entities
4. **Comments** — threaded discussion
5. **Activity** — system-generated audit log
6. **Math** (where applicable) — running calculator / scratchpad

## API

```ts
type SlideOverProps = {
  open: boolean;
  onClose: () => void;
  onExitComplete?: () => void;
  title: string;
  headerStart?: React.ReactNode;
  subtitle?: React.ReactNode;
  headerActions?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  width?: 'default' | 'wide';
  backdrop?: boolean; // default false
  ariaLabel?: string;
};
```

- **`headerStart`:** Optional row above the title (e.g. status / severity chips).
- **`onExitComplete`:** Fires after the exit animation, after focus is restored; use to clear cached row data.
- **Default** is **no backdrop**; the page behind stays visible. Use `backdrop: true` for high-stakes flows.
- **Mobile** (viewports under 640px): the panel becomes a bottom sheet; the API is unchanged.

## Anti-patterns

- Don’t put save actions for fields that are edited on the main page in the slide-over; keep editing on-page.
- Don’t mount two `SlideOver` instances at once.
- Don’t use `SlideOver` for left-side panels (it is right-side on desktop, bottom sheet on small screens).
- Don’t reimplement a slide-over inline; use `src/components/shell/SlideOver.tsx`.
