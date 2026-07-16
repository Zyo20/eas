import type {
  BulkCreateAccountsResponse,
  BulkDeleteResponse,
  CleanupOrphanResult,
} from '@/lib/api';

export type SingleAccountResult = {
  attendeeId: string;
  userId: string;
  email: string;
  setupUrl: string;
  note: string;
};

export type ModalState =
  | { kind: 'none' }
  | { kind: 'single'; result: SingleAccountResult }
  | { kind: 'bulk'; result: BulkCreateAccountsResponse; orgId: string; ids: string[]; cleanup?: CleanupOrphanResult }
  | { kind: 'bulk-delete-confirm'; ids: string[] }
  | { kind: 'bulk-delete-result'; result: BulkDeleteResponse };

export interface AttendeesViewProps {}
