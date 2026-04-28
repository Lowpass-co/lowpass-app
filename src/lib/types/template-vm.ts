/** Virtual row for unified /templates list (multiple underlying tables). */

export type TemplateKind = 'rider-pack' | 'advance-layout' | 'advance-schedule' | 'budget' | 'other';

export type TemplateVm = {
  id: string;
  kind: TemplateKind;
  name: string;
  description: string | null;
  usedCount: number;
  lastUsedAt: string | null;
  updatedAt: string;
  createdBy: string | null;
  /** Stable link to edit this template */
  editorHref: string;
};
