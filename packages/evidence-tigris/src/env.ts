export interface TigrisStorageEnv {
  readonly endpoint: string;
  readonly bucket: string;
  readonly accessKeyId: string;
  readonly secretAccessKey: string;
  readonly region: string;
}

function firstNonEmpty(
  env: NodeJS.ProcessEnv,
  keys: readonly string[],
): string | undefined {
  for (const key of keys) {
    const value = env[key];
    if (value !== undefined && value.trim().length > 0) {
      return value.trim();
    }
  }
  return undefined;
}

/**
 * Resolve S3-compatible evidence credentials.
 * Prefers `TIGRIS_STORAGE_*`, then standard `AWS_*` / `BUCKET_NAME`.
 * Defaults bucket to `shipcheck` when unset.
 */
export function resolveTigrisStorageEnv(
  env: NodeJS.ProcessEnv = process.env,
): TigrisStorageEnv {
  const endpoint = firstNonEmpty(env, [
    "TIGRIS_STORAGE_ENDPOINT",
    "AWS_ENDPOINT_URL_S3",
  ]);
  const accessKeyId = firstNonEmpty(env, [
    "TIGRIS_STORAGE_ACCESS_KEY_ID",
    "AWS_ACCESS_KEY_ID",
  ]);
  const secretAccessKey = firstNonEmpty(env, [
    "TIGRIS_STORAGE_SECRET_ACCESS_KEY",
    "AWS_SECRET_ACCESS_KEY",
  ]);
  const bucket =
    firstNonEmpty(env, ["TIGRIS_STORAGE_BUCKET", "BUCKET_NAME"]) ?? "shipcheck";
  const region =
    firstNonEmpty(env, ["TIGRIS_STORAGE_REGION", "AWS_REGION"]) ?? "auto";

  if (
    endpoint === undefined ||
    accessKeyId === undefined ||
    secretAccessKey === undefined
  ) {
    throw new TypeError(
      "Object storage requires TIGRIS_STORAGE_ENDPOINT/ACCESS_KEY_ID/SECRET_ACCESS_KEY (or AWS_ENDPOINT_URL_S3/AWS_ACCESS_KEY_ID/AWS_SECRET_ACCESS_KEY)",
    );
  }

  return {
    endpoint,
    bucket,
    accessKeyId,
    secretAccessKey,
    region,
  };
}
