export type CaldavIssueStatus = 'NEEDS-ACTION' | 'COMPLETED' | 'IN-PROCESS' | 'CANCELLED';

export type CaldavIssueReduced = Readonly<{
  id: string;
  completed: boolean;
  item_url: string;
  summary: string;
  start?: number;
  labels: string[];
  etag_hash: number;
  related_to?: string;
}>;

export type CaldavIssue = CaldavIssueReduced &
  Readonly<{
    due?: number;
    note?: string;
    status?: CaldavIssueStatus;
    priority?: number;
    percent_complete?: number;
    location?: string;
    duration?: number;
  }>;

// VEVENT model for calendar event sync
// Note: 'completed' and 'labels' are included for compatibility with CaldavIssue
// Events don't have completion status, so 'completed' is always false
export type CaldavEventReduced = Readonly<{
  id: string;
  item_url: string;
  summary: string;
  start: number;
  etag_hash: number;
  isAllDay: boolean;
  completed: boolean; // Always false for events (for type compatibility)
  labels: string[]; // Same as categories (for type compatibility)
}>;

export type CaldavEvent = CaldavEventReduced &
  Readonly<{
    end?: number;
    duration: number;
    description?: string;
    location?: string;
    categories: string[];
  }>;

// Union type for both VTODO and VEVENT
export type CaldavIssueOrEvent = CaldavIssue | CaldavEvent;

// Type guard to check if an issue is an event
export const isCaldavEvent = (issue: CaldavIssueOrEvent): issue is CaldavEvent => {
  return 'isAllDay' in issue;
};
