// MineGrid Trust Layer — types partagés.

export type VerificationKind =
  | 'identity'
  | 'company_registration'
  | 'tax_id'
  | 'bank_account'
  | 'address'
  | 'machine_document';

export type VerificationStatus = 'pending' | 'approved' | 'rejected';

export type TrustTier = 'unverified' | 'basic' | 'verified' | 'trusted' | 'elite';

export interface Verification {
  id: string;
  trust_profile_id: string;
  kind: VerificationKind;
  status: VerificationStatus;
  evidence_url: string | null;
  created_at: string;
}

export interface TrustProfile {
  id: string;
  user_id: string;
  entity_type: 'seller' | 'buyer' | 'company' | 'inspector';
  legal_name: string | null;
  country: string | null;
  trust_score: number;
  trust_tier: TrustTier;
  verified_at: string | null;
}

/** Signaux bruts (issus du serveur) à partir desquels le score est recalculé. */
export interface TrustSignals {
  approvedVerifications: VerificationKind[];
  inspectionsPassed: number;
  inspectionsTotal: number;
  completedTransactions: number;
  disputes: number;
  accountAgeDays: number;
}

export interface TrustScoreResult {
  score: number; // 0-100
  tier: TrustTier;
  breakdown: Record<string, number>;
}
