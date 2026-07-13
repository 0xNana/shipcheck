import { GetObjectCommand, S3Client, type S3ClientConfig } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type {
  EvidenceLinkProvider,
  EvidenceReadLink,
} from "@shipcheck/service-core";

import {
  createTigrisEvidenceBlobStoreFromEnv,
  TigrisEvidenceBlobStore,
} from "./blob-store.js";
import { resolveTigrisStorageEnv } from "./env.js";
import { evidenceObjectKey } from "./keys.js";

export interface TigrisEvidenceLinkProviderOptions {
  readonly bucket: string;
  readonly keyPrefix?: string;
  readonly client?: S3Client;
  readonly clientConfig?: S3ClientConfig;
  readonly blobStore?: TigrisEvidenceBlobStore;
}

export class TigrisEvidenceLinkProvider implements EvidenceLinkProvider {
  private readonly bucket: string;
  private readonly keyPrefix: string;
  private readonly client: S3Client;
  private readonly blobStore: TigrisEvidenceBlobStore;

  constructor(options: TigrisEvidenceLinkProviderOptions) {
    this.bucket = options.bucket;
    this.keyPrefix = options.keyPrefix ?? "evidence";
    this.client =
      options.client ??
      new S3Client({
        forcePathStyle: true,
        ...options.clientConfig,
      });
    this.blobStore =
      options.blobStore ??
      new TigrisEvidenceBlobStore({
        bucket: this.bucket,
        keyPrefix: this.keyPrefix,
        client: this.client,
      });
  }

  async createReadLink(
    _receiptId: string,
    evidenceId: string,
    expiresAt: string,
  ): Promise<EvidenceReadLink | undefined> {
    const exists = await this.blobStore.exists(evidenceId);
    if (!exists) {
      return undefined;
    }
    const expiresInSeconds = Math.max(
      1,
      Math.floor((Date.parse(expiresAt) - Date.now()) / 1000),
    );
    const url = await getSignedUrl(
      this.client,
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: evidenceObjectKey(evidenceId, this.keyPrefix),
      }),
      { expiresIn: expiresInSeconds },
    );
    return { url, expiresAt };
  }
}

export function createTigrisEvidenceLinkProviderFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): TigrisEvidenceLinkProvider {
  const storage = resolveTigrisStorageEnv(env);
  const blobStore = createTigrisEvidenceBlobStoreFromEnv(env);
  return new TigrisEvidenceLinkProvider({
    bucket: storage.bucket,
    blobStore,
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
