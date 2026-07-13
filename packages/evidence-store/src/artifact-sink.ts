import { createHash } from "node:crypto";

import {
  EvidenceArtifactSchema,
  type EvidenceArtifact,
} from "@shipcheck/domain";

export interface EvidenceBlobWrite {
  readonly id: string;
  readonly contentType: string;
  readonly bytes: Uint8Array;
  readonly signal?: AbortSignal;
}

export interface EvidenceBlobStore {
  put(input: EvidenceBlobWrite): Promise<{ readonly storageUrl?: string }>;
}

export interface ArtifactWrite {
  readonly type: EvidenceArtifact["type"];
  readonly contentType: string;
  readonly bytes: Uint8Array;
  readonly createdAt: string;
  readonly redactionApplied: boolean;
  readonly signal?: AbortSignal;
}

export interface ArtifactSink {
  write(input: ArtifactWrite): Promise<EvidenceArtifact>;
}

export function createArtifactSink(blobStore: EvidenceBlobStore): ArtifactSink {
  return {
    async write(input): Promise<EvidenceArtifact> {
      input.signal?.throwIfAborted();
      const bytes = Buffer.from(input.bytes);
      const sha256 = createHash("sha256").update(bytes).digest("hex");
      const id = `ev_${sha256.slice(0, 24)}`;
      const stored = await blobStore.put({
        id,
        contentType: input.contentType,
        bytes,
        ...(input.signal === undefined ? {} : { signal: input.signal }),
      });
      input.signal?.throwIfAborted();
      return EvidenceArtifactSchema.parse({
        id,
        type: input.type,
        sha256,
        contentType: input.contentType,
        sizeBytes: bytes.byteLength,
        ...(stored.storageUrl === undefined
          ? {}
          : { storageUrl: stored.storageUrl }),
        createdAt: input.createdAt,
        redaction: { applied: input.redactionApplied },
      });
    },
  };
}
