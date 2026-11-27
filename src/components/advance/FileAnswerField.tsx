'use client';

/* An upload question's answer (Nov 2026): the files, each opening in a new
   tab, and "Upload" — straight to Storage (the server picks the path; the
   finish step checks the bytes). Used by the show page (the tour's route) and
   the venue form (the link's route); `endpoint` is which. Removing a file
   takes it off the answer; the stored copy stays (a sent PDF may show it). */

import { useRef, useState } from 'react';
import { Paperclip, Upload, X } from 'lucide-react';
import { uploadDirect } from '@/lib/uploads/directUpload';
import './advance.css';
import {
  ADVANCE_FILE_ACCEPT,
  ADVANCE_FILE_MAX_BYTES,
  ADVANCE_FILES_PER_QUESTION,
  fileSizeLabel,
  isAdvanceFileType,
  type FileAnswer,
} from '@/lib/advance/fileAnswers';

/** A stored answer → its files, without the show check (the server already
 *  cleaned it; this only reads the shape for display). */
function filesOf(value: unknown): FileAnswer[] {
  const list = Array.isArray(value) ? value : [];
  return list.filter(
    (f): f is FileAnswer => !!f && typeof f === 'object' && typeof (f as FileAnswer).path === 'string' && typeof (f as FileAnswer).name === 'string',
  );
}

async function post<T>(endpoint: string, body: Record<string, unknown>): Promise<T> {
  const res = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const json = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(json.error || 'Upload failed');
  return json;
}

export function FileAnswerField({
  value,
  endpoint,
  onChange,
  disabled,
  id,
}: {
  value: unknown;
  /** POST endpoint taking { action: 'upload-url' | 'complete' | 'urls' }. */
  endpoint: string;
  onChange: (files: FileAnswer[]) => void;
  disabled?: boolean;
  id?: string;
}) {
  const files = filesOf(value);
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const open = async (f: FileAnswer) => {
    // A new tab opened now (inside the click) can't be blocked; filled in when the link arrives.
    const tab = window.open('', '_blank');
    if (tab) tab.opener = null;
    try {
      const { urls } = await post<{ urls: Record<string, string> }>(endpoint, { action: 'urls', paths: [f.path] });
      const url = urls[f.path];
      if (url && tab) tab.location.href = url;
      else {
        tab?.close();
        setError('That file isn’t available right now.');
      }
    } catch (e) {
      tab?.close();
      setError(e instanceof Error ? e.message : 'Couldn’t open that file.');
    }
  };

  const add = async (list: FileList | null) => {
    if (!list?.length) return;
    setError(null);
    const room = ADVANCE_FILES_PER_QUESTION - files.length;
    const picked = Array.from(list).slice(0, Math.max(0, room));
    if (!picked.length) {
      setError(`${ADVANCE_FILES_PER_QUESTION} files at most.`);
      return;
    }
    const next = [...files];
    for (const file of picked) {
      if (!isAdvanceFileType(file.type)) {
        setError(`${file.name}: a PDF or an image, please.`);
        continue;
      }
      if (file.size > ADVANCE_FILE_MAX_BYTES) {
        setError(`${file.name} is too big (25 MB at most).`);
        continue;
      }
      try {
        setBusy(`Uploading ${file.name}…`);
        const grant = await post<{ bucket: string; path: string; token: string }>(endpoint, { action: 'upload-url', type: file.type, size: file.size });
        await uploadDirect({ bucket: grant.bucket, path: grant.path, token: grant.token }, file, {
          onProgress: (f) => setBusy(`Uploading ${file.name} ${Math.round(f * 100)}%`),
        });
        const done = await post<{ file: FileAnswer }>(endpoint, { action: 'complete', path: grant.path, name: file.name });
        next.push(done.file);
        onChange([...next]);
      } catch (e) {
        setError(e instanceof Error ? `${file.name}: ${e.message}` : `Couldn’t upload ${file.name}.`);
      }
    }
    setBusy(null);
    if (input.current) input.current.value = '';
  };

  return (
    <div className="adv-files">
      {files.map((f) => (
        <span key={f.path} className="adv-file">
          <button type="button" className="adv-file-open" onClick={() => void open(f)} title="Open in a new tab">
            <Paperclip size={13} aria-hidden />
            <span className="adv-file-name">{f.name}</span>
            {f.size ? <span className="adv-muted">{fileSizeLabel(f.size)}</span> : null}
          </button>
          {disabled ? null : (
            <button type="button" className="adv-file-x" aria-label={`Remove ${f.name}`} onClick={() => onChange(files.filter((x) => x.path !== f.path))}>
              <X size={12} aria-hidden />
            </button>
          )}
        </span>
      ))}
      {disabled || files.length >= ADVANCE_FILES_PER_QUESTION ? null : (
        <>
          <button type="button" className="adv-btn adv-btn-sm adv-btn-light" disabled={!!busy} onClick={() => input.current?.click()}>
            <Upload size={13} aria-hidden /> {busy ?? (files.length ? 'Add another' : 'Upload')}
          </button>
          <input
            ref={input}
            id={id}
            type="file"
            accept={ADVANCE_FILE_ACCEPT}
            multiple
            hidden
            onChange={(e) => void add(e.target.files)}
          />
        </>
      )}
      {error ? <span className="adv-file-err" role="alert">{error}</span> : null}
    </div>
  );
}
