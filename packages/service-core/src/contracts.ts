import type {
  AcceptanceContract,
  AcceptanceReceipt,
  EvidenceManifest,
  RequirementResult,
  VerifyRequest,
} from "@shipcheck/domain";

export type VerificationRequestStatus =
  | "QUEUED"
  | "RUNNING"
  | "COMPLETED"
  | "FAILED";

export interface StoredServiceError {
  readonly code: string;
  readonly message: string;
  readonly details?: unknown;
}

export interface StoredVerificationRequest<TResponse = unknown> {
  readonly requestId: string;
  readonly input: VerifyRequest;
  readonly requestHash: string;
  readonly status: VerificationRequestStatus;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly response?: TResponse;
  readonly error?: StoredServiceError;
}

export interface VerificationRequestUpdate<TResponse = unknown> {
  readonly status: VerificationRequestStatus;
  readonly updatedAt: string;
  readonly response?: TResponse;
  readonly error?: StoredServiceError;
}

export interface RequestStore<TResponse = unknown> {
  put(record: StoredVerificationRequest<TResponse>): Promise<void>;
  get(
    requestId: string,
  ): Promise<StoredVerificationRequest<TResponse> | undefined>;
  update(
    requestId: string,
    update: VerificationRequestUpdate<TResponse>,
  ): Promise<StoredVerificationRequest<TResponse>>;
}

export interface ReceiptStore {
  put(receipt: AcceptanceReceipt): Promise<void>;
  get(receiptId: string): Promise<AcceptanceReceipt | undefined>;
  delete(receiptId: string): Promise<void>;
}

export interface ReportBundle {
  readonly receiptId: string;
  readonly contract: AcceptanceContract;
  readonly results: readonly RequirementResult[];
  readonly receipt: AcceptanceReceipt;
  readonly evidenceManifest: EvidenceManifest;
  readonly createdAt: string;
}

export interface ReportStore {
  put(bundle: ReportBundle): Promise<void>;
  get(receiptId: string): Promise<ReportBundle | undefined>;
  delete(receiptId: string): Promise<void>;
}

export interface EvidenceReadLink {
  readonly url: string;
  readonly expiresAt: string;
}

export interface EvidenceLinkProvider {
  createReadLink(
    receiptId: string,
    evidenceId: string,
    expiresAt: string,
  ): Promise<EvidenceReadLink | undefined>;
}

export interface VerificationJob {
  readonly requestId: string;
}

export interface VerificationQueue {
  enqueue(job: VerificationJob): Promise<void>;
  dequeue(): Promise<VerificationJob | undefined>;
}

export type IdempotencyLookup<T> =
  | { readonly outcome: "MISS" }
  | { readonly outcome: "IN_PROGRESS" }
  | { readonly outcome: "CONFLICT" }
  | { readonly outcome: "REPLAY"; readonly value: T };

export type IdempotencyClaim<T> =
  | { readonly outcome: "CLAIMED" }
  | Exclude<IdempotencyLookup<T>, { readonly outcome: "MISS" }>;

export interface IdempotencyStore<T> {
  inspect(
    namespace: string,
    key: string,
    fingerprint: string,
  ): Promise<IdempotencyLookup<T>>;
  claim(
    namespace: string,
    key: string,
    fingerprint: string,
  ): Promise<IdempotencyClaim<T>>;
  complete(
    namespace: string,
    key: string,
    fingerprint: string,
    value: T,
  ): Promise<void>;
  release(
    namespace: string,
    key: string,
    fingerprint: string,
  ): Promise<void>;
}
