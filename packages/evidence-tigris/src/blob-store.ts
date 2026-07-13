import {
  DeleteObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
  type S3ClientConfig,
} from "@aws-sdk/client-s3";
import type { EvidenceBlobStore, EvidenceBlobWrite } from "@shipcheck/evidence-store";

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
  const bucket = env["OBJECT_STORE_BUCKET"];
  const endpoint = env["OBJECT_STORE_ENDPOINT"];
  const accessKeyId = env["OBJECT_STORE_ACCESS_KEY"];
  const secretAccessKey = env["OBJECT_STORE_SECRET_KEY"];
  if (
    bucket === undefined ||
    endpoint === undefined ||
    accessKeyId === undefined ||
    secretAccessKey === undefined
  ) {
    throw new TypeError(
      "OBJECT_STORE_BUCKET, OBJECT_STORE_ENDPOINT, OBJECT_STORE_ACCESS_KEY, and OBJECT_STORE_SECRET_KEY are required",
    );
  }
  return new TigrisEvidenceBlobStore({
    bucket,
    clientConfig: {
      endpoint,
      region: env["OBJECT_STORE_REGION"] ?? "auto",
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
      forcePathStyle: true,
    },
  });
}
