export type BugSeverity = 'low' | 'medium' | 'high' | 'critical';
export type BugStatus = 'open' | 'in_progress' | 'resolved' | 'wont_fix' | 'duplicate';

export type BugReportReporter = {
  id: string;
  name: string | null;
  email: string | null;
  avatar_url?: string | null;
};

export type BugReport = {
  id: string;
  title: string | null;
  description: string;
  steps_to_reproduce: string | null;
  severity: BugSeverity;
  status: BugStatus;
  page_url: string | null;
  page_path: string | null;
  user_agent: string | null;
  browser: string | null;
  os: string | null;
  viewport_width: number | null;
  viewport_height: number | null;
  device_pixel_ratio: number | null;
  screenshot_path: string | null;
  screenshot_url: string | null;
  resolution_notes: string | null;
  assigned_to: string | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
  reporter: BugReportReporter | null;
  assignee: BugReportReporter | null;
};

export const SEVERITY_META: Record<BugSeverity, { label: string; color: string }> = {
  low: { label: 'Low', color: '#22c55e' },
  medium: { label: 'Medium', color: '#eab308' },
  high: { label: 'High', color: '#f97316' },
  critical: { label: 'Critical', color: '#ef4444' },
};

export const STATUS_META: Record<BugStatus, { label: string; color: string }> = {
  open: { label: 'Open', color: '#3b82f6' },
  in_progress: { label: 'In progress', color: '#a855f7' },
  resolved: { label: 'Resolved', color: '#22c55e' },
  wont_fix: { label: "Won't fix", color: '#6b7280' },
  duplicate: { label: 'Duplicate', color: '#64748b' },
};

export const SEVERITY_ORDER: BugSeverity[] = ['critical', 'high', 'medium', 'low'];
export const STATUS_ORDER: BugStatus[] = ['open', 'in_progress', 'resolved', 'wont_fix', 'duplicate'];
