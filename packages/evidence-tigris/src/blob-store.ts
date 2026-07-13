import {
  DeleteObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
  type S3ClientConfig,
} from "@aws-sdk/client-s3";
import type { EvidenceBlobStore, EvidenceBlobWrite } from "@shipcheck/evidence-store";

import { resolveTigrisStorageEnv } from "./env.js";
import { evidenceObjectKey } from "./keys.js";

export interface TigrisEvidenceBlobStoreOptions {
  readonly bucket: string;
  readonly keyPrefix?: string;
  readonly client?: S3Client;
  readonly clientConfig?: S3ClientConfig;
}

export class TigrisEvidenceBlobStore implements EvidenceBlobStore {
  private readonly bucket: string;
  private readonly keyPrefix: string;
  private readonly client: S3Client;

  constructor(options: TigrisEvidenceBlobStoreOptions) {
    this.bucket = options.bucket;
    this.keyPrefix = options.keyPrefix ?? "evidence";
    this.client =
      options.client ??
      new S3Client({
        forcePathStyle: true,
        ...options.clientConfig,
      });
  }

  async put(input: EvidenceBlobWrite): Promise<{ readonly storageUrl?: string }> {
    input.signal?.throwIfAborted();
    const key = evidenceObjectKey(input.id, this.keyPrefix);
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: input.bytes,
        ContentType: input.contentType,
      }),
    );
    input.signal?.throwIfAborted();
    return {};
  }

  async delete(evidenceId: string, signal?: AbortSignal): Promise<void> {
    signal?.throwIfAborted();
    await this.client.send(
      new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: evidenceObjectKey(evidenceId, this.keyPrefix),
      }),
    );
  }

  async exists(evidenceId: string): Promise<boolean> {
    try {
      await this.client.send(
        new HeadObjectCommand({
          Bucket: this.bucket,
          Key: evidenceObjectKey(evidenceId, this.keyPrefix),
        }),
      );
      return true;
    } catch {
      return false;
    }
  }
}

export function createTigrisEvidenceBlobStoreFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): TigrisEvidenceBlobStore {
  const storage = resolveTigrisStorageEnv(env);
  return new TigrisEvidenceBlobStore({
    bucket: storage.bucket,
    clientConfig: {
      endpoint: storage.endpoint,
      region: storage.region,
      credentials: {
        accessKeyId: storage.accessKeyId,
        secretAccessKey: storage.secretAccessKey,
      },
      forcePathStyle: true,
    },
  });
}
