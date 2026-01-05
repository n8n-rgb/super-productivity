import { BaseIssueProviderCfg } from '../../issue.model';

export type CaldavComponentType = 'VTODO' | 'VEVENT';
export type CaldavAuthType = 'basic' | 'bearer';

export interface CaldavCfg extends BaseIssueProviderCfg {
  caldavUrl: string | null;
  resourceName: string | null;
  username: string | null;
  password: string | null;
  isTransitionIssuesEnabled: boolean;
  categoryFilter: string | null;
  // New fields for VEVENT and Google Calendar support
  componentType: CaldavComponentType;
  authType: CaldavAuthType;
  bearerToken: string | null;
  enableWriteBack: boolean;
}
