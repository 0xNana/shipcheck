import { describe, expect, it } from "vitest";

import { resolveTigrisStorageEnv } from "../src/env.js";

describe("resolveTigrisStorageEnv", () => {
  it("reads TIGRIS_STORAGE_* names and defaults the bucket to shipcheck", () => {
    expect(
      resolveTigrisStorageEnv({
        TIGRIS_STORAGE_ENDPOINT: "https://t3.storage.dev",
        TIGRIS_STORAGE_ACCESS_KEY_ID: "tid_test",
        TIGRIS_STORAGE_SECRET_ACCESS_KEY: "tsec_test",
      }),
    ).toEqual({
      endpoint: "https://t3.storage.dev",
      accessKeyId: "tid_test",
      secretAccessKey: "tsec_test",
      bucket: "shipcheck",
      region: "auto",
    });
  });

  it("falls back to AWS_* and BUCKET_NAME secrets", () => {
    expect(
      resolveTigrisStorageEnv({
        AWS_ENDPOINT_URL_S3: "https://t3.storage.dev",
        AWS_ACCESS_KEY_ID: "tid_aws",
        AWS_SECRET_ACCESS_KEY: "tsec_aws",
        AWS_REGION: "auto",
        BUCKET_NAME: "shipcheck",
      }),
    ).toEqual({
      endpoint: "https://t3.storage.dev",
      accessKeyId: "tid_aws",
      secretAccessKey: "tsec_aws",
      bucket: "shipcheck",
      region: "auto",
    });
  });
});
