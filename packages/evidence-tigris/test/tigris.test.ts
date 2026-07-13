import "./setup.js";

import type { S3Client } from "@aws-sdk/client-s3";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { describe, expect, it, vi } from "vitest";

import {
  evidenceObjectKey,
  TigrisEvidenceBlobStore,
  TigrisEvidenceLinkProvider,
} from "../src/index.js";

function createMockClient(): { client: S3Client; send: ReturnType<typeof vi.fn> } {
  const send = vi.fn();
  const client = { send } as unknown as S3Client;
  return { client, send };
}

describe("evidence object keys", () => {
  it("builds deterministic keys from evidence IDs", () => {
    expect(evidenceObjectKey("ev_0123456789abcdef01234567")).toBe(
      "evidence/ev_0123456789abcdef01234567",
    );
    expect(evidenceObjectKey("ev_0123456789abcdef01234567", "artifacts")).toBe(
      "artifacts/ev_0123456789abcdef01234567",
    );
  });

  it("rejects invalid evidence IDs", () => {
    expect(() => evidenceObjectKey("screenshot.png")).toThrow(
      "Invalid evidence ID",
    );
  });
});

describe("TigrisEvidenceBlobStore", () => {
  it("writes private objects with deterministic keys", async () => {
    const { client, send } = createMockClient();
    send.mockResolvedValue({});
    const store = new TigrisEvidenceBlobStore({
      bucket: "shipcheck-evidence",
      client,
    });

    await store.put({
      id: "ev_0123456789abcdef01234567",
      contentType: "image/png",
      bytes: Uint8Array.from([1, 2, 3]),
    });

    expect(send).toHaveBeenCalledWith(expect.any(PutObjectCommand));
    const command = send.mock.calls[0]?.[0] as PutObjectCommand;
    expect(command.input.Bucket).toBe("shipcheck-evidence");
    expect(command.input.Key).toBe("evidence/ev_0123456789abcdef01234567");
    expect(command.input.ContentType).toBe("image/png");
  });

  it("deletes objects by evidence ID", async () => {
    const { client, send } = createMockClient();
    send.mockResolvedValue({});
    const store = new TigrisEvidenceBlobStore({
      bucket: "shipcheck-evidence",
      client,
    });

    await store.delete("ev_0123456789abcdef01234567");

    expect(send).toHaveBeenCalledWith(expect.any(DeleteObjectCommand));
    const command = send.mock.calls[0]?.[0] as DeleteObjectCommand;
    expect(command.input.Key).toBe("evidence/ev_0123456789abcdef01234567");
  });

  it("checks object existence with HeadObject", async () => {
    const { client, send } = createMockClient();
    send.mockResolvedValueOnce({}).mockRejectedValueOnce(new Error("missing"));
    const store = new TigrisEvidenceBlobStore({
      bucket: "shipcheck-evidence",
      client,
    });

    await expect(store.exists("ev_0123456789abcdef01234567")).resolves.toBe(true);
    await expect(store.exists("ev_0123456789abcdef01234567")).resolves.toBe(false);
    expect(send).toHaveBeenCalledWith(expect.any(HeadObjectCommand));
  });
});

describe("TigrisEvidenceLinkProvider", () => {
  it("returns undefined when the evidence object is missing", async () => {
    const { client, send } = createMockClient();
    send.mockRejectedValue(new Error("not found"));
    const provider = new TigrisEvidenceLinkProvider({
      bucket: "shipcheck-evidence",
      client,
    });

    await expect(
      provider.createReadLink(
        "sc_receipt_1",
        "ev_0123456789abcdef01234567",
        "2026-07-12T21:00:00.000Z",
      ),
    ).resolves.toBeUndefined();
  });

  it("creates presigned read URLs for existing objects", async () => {
    const { client, send } = createMockClient();
    send.mockResolvedValue({});

    const provider = new TigrisEvidenceLinkProvider({
      bucket: "shipcheck-evidence",
      client,
    });
    const expiresAt = new Date(Date.now() + 60_000).toISOString();

    const link = await provider.createReadLink(
      "sc_receipt_1",
      "ev_0123456789abcdef01234567",
      expiresAt,
    );

    expect(link).toEqual({
      url: "https://objects.example/presigned",
      expiresAt,
    });
    expect(send).toHaveBeenCalledWith(expect.any(HeadObjectCommand));
    expect(getSignedUrl).toHaveBeenCalledWith(
      client,
      expect.any(GetObjectCommand),
      expect.objectContaining({ expiresIn: expect.any(Number) as number }),
    );
  });
});
