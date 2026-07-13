import type { AcceptanceReceipt } from "@shipcheck/domain";

import type {
  EvidenceLinkProvider,
  EvidenceReadLink,
  IdempotencyClaim,
  IdempotencyLookup,
  IdempotencyStore,
  ReceiptStore,
  ReportBundle,
  ReportStore,
  RequestStore,
  StoredVerificationRequest,
  VerificationJob,
  VerificationQueue,
  VerificationRequestUpdate,
} from "./contracts.js";

function clone<T>(value: T): T {
  return structuredClone(value);
}

export class LocalRequestStore<TResponse = unknown>
  implements RequestStore<TResponse>
{
  private readonly records = new Map<
    string,
    StoredVerificationRequest<TResponse>
  >();

  put(record: StoredVerificationRequest<TResponse>): Promise<void> {
    this.records.set(record.requestId, clone(record));
    return Promise.resolve();
  }

  get(
    requestId: string,
  ): Promise<StoredVerificationRequest<TResponse> | undefined> {
    const record = this.records.get(requestId);
    return Promise.resolve(record === undefined ? undefined : clone(record));
  }

  update(
    requestId: string,
    update: VerificationRequestUpdate<TResponse>,
  ): Promise<StoredVerificationRequest<TResponse>> {
    const current = this.records.get(requestId);
    if (current === undefined) {
      return Promise.reject(
        new TypeError(`Unknown verification request: ${requestId}`),
      );
    }
    const updated = clone({ ...current, ...update });
    this.records.set(requestId, updated);
    return Promise.resolve(clone(updated));
  }
}

export class LocalReceiptStore implements ReceiptStore {
  private readonly receipts = new Map<string, AcceptanceReceipt>();

  put(receipt: AcceptanceReceipt): Promise<void> {
    this.receipts.set(receipt.receiptId, clone(receipt));
    return Promise.resolve();
  }

  get(receiptId: string): Promise<AcceptanceReceipt | undefined> {
    const receipt = this.receipts.get(receiptId);
    return Promise.resolve(receipt === undefined ? undefined : clone(receipt));
  }

  delete(receiptId: string): Promise<void> {
    this.receipts.delete(receiptId);
    return Promise.resolve();
  }
}

export class LocalReportStore implements ReportStore {
  private readonly bundles = new Map<string, ReportBundle>();

  put(bundle: ReportBundle): Promise<void> {
    this.bundles.set(bundle.receiptId, clone(bundle));
    return Promise.resolve();
  }

  get(receiptId: string): Promise<ReportBundle | undefined> {
    const bundle = this.bundles.get(receiptId);
    return Promise.resolve(bundle === undefined ? undefined : clone(bundle));
  }

  delete(receiptId: string): Promise<void> {
    this.bundles.delete(receiptId);
    return Promise.resolve();
  }
}

export class LocalEvidenceLinkProvider implements EvidenceLinkProvider {
  constructor(private readonly bundles: ReportStore) {}

  createReadLink(
    receiptId: string,
    evidenceId: string,
    expiresAt: string,
  ): Promise<EvidenceReadLink | undefined> {
    return this.bundles.get(receiptId).then((bundle) => {
      if (bundle === undefined) return undefined;
      const artifact = bundle.evidenceManifest.artifacts.find(
        (entry) => entry.id === evidenceId,
      );
      if (artifact?.storageUrl === undefined) return undefined;
      return {
        url: artifact.storageUrl,
        expiresAt,
      };
    });
  }
}

export class LocalVerificationQueue implements VerificationQueue {
  private readonly jobs: VerificationJob[] = [];

  enqueue(job: VerificationJob): Promise<void> {
    this.jobs.push(clone(job));
    return Promise.resolve();
  }

  dequeue(): Promise<VerificationJob | undefined> {
    const job = this.jobs.shift();
    return Promise.resolve(job === undefined ? undefined : clone(job));
  }
}

interface PendingIdempotencyEntry {
  readonly state: "PENDING";
  readonly fingerprint: string;
}

interface CompletedIdempotencyEntry<T> {
  readonly state: "COMPLETED";
  readonly fingerprint: string;
  readonly value: T;
}

type IdempotencyEntry<T> =
  | PendingIdempotencyEntry
  | CompletedIdempotencyEntry<T>;

export class LocalIdempotencyStore<T> implements IdempotencyStore<T> {
  private readonly entries = new Map<string, IdempotencyEntry<T>>();

  inspect(
    namespace: string,
    key: string,
    fingerprint: string,
  ): Promise<IdempotencyLookup<T>> {
    return Promise.resolve(this.lookup(namespace, key, fingerprint));
  }

  claim(
    namespace: string,
    key: string,
    fingerprint: string,
  ): Promise<IdempotencyClaim<T>> {
    const existing = this.lookup(namespace, key, fingerprint);
    if (existing.outcome !== "MISS") return Promise.resolve(existing);
    this.entries.set(this.storageKey(namespace, key), {
      state: "PENDING",
      fingerprint,
    });
    return Promise.resolve({ outcome: "CLAIMED" });
  }

  private lookup(
    namespace: string,
    key: string,
    fingerprint: string,
  ): IdempotencyLookup<T> {
    const entry = this.entries.get(this.storageKey(namespace, key));
    if (entry === undefined) return { outcome: "MISS" };
    if (entry.fingerprint !== fingerprint) {
      return { outcome: "CONFLICT" };
    }
    return entry.state === "PENDING"
      ? { outcome: "IN_PROGRESS" }
      : { outcome: "REPLAY", value: clone(entry.value) };
  }

  complete(
    namespace: string,
    key: string,
    fingerprint: string,
    value: T,
  ): Promise<void> {
    const storageKey = this.storageKey(namespace, key);
    const existing = this.entries.get(storageKey);
    if (
      existing === undefined ||
      existing.state !== "PENDING" ||
      existing.fingerprint !== fingerprint
    ) {
      return Promise.reject(new TypeError("Idempotency claim is not active"));
    }
    this.entries.set(storageKey, {
      state: "COMPLETED",
      fingerprint,
      value: clone(value),
    });
    return Promise.resolve();
  }

  release(
    namespace: string,
    key: string,
    fingerprint: string,
  ): Promise<void> {
    const storageKey = this.storageKey(namespace, key);
    const existing = this.entries.get(storageKey);
    if (existing?.fingerprint === fingerprint) {
      this.entries.delete(storageKey);
    }
    return Promise.resolve();
  }

  private storageKey(namespace: string, key: string): string {
    return `${namespace}\u0000${key}`;
  }
}
