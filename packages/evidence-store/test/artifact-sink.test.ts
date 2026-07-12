import { createHash } from "node:crypto";

import { EvidenceArtifactSchema } from "@shipcheck/domain";
import { describe, expect, it } from "vitest";

import {
  createArtifactSink,
  type EvidenceBlobStore,
} from "../src/index.js";

describe("artifact sink", () => {
  it("hashes immutable bytes and returns schema-valid stored metadata", async () => {
    const writes: Array<{ id: string; bytes: Uint8Array }> = [];
    const blobs: EvidenceBlobStore = {
      put(input) {
        writes.push({ id: input.id, bytes: input.bytes });
        return Promise.resolve({
          storageUrl: `https://objects.example/${input.id}`,
        });
      },
    };
    const sink = createArtifactSink(blobs);
    const bytes = Buffer.from("screenshot bytes");

    const artifact = await sink.write({
      type: "SCREENSHOT",
      contentType: "image/png",
      bytes,
      createdAt: "2026-07-12T21:30:00Z",
      redactionApplied: false,
    });

    expect(EvidenceArtifactSchema.safeParse(artifact).success).toBe(true);
    expect(artifact.sha256).toBe(
      createHash("sha256").update(bytes).digest("hex"),
    );
    expect(artifact.sizeBytes).toBe(bytes.byteLength);
    expect(writes).toHaveLength(1);
    expect(writes[0]?.id).toBe(artifact.id);
  });

  it("omits storageUrl when the blob store does not expose one", async () => {
    const blobs: EvidenceBlobStore = {
      put: () => Promise.resolve({}),
    };

    const artifact = await createArtifactSink(blobs).write({
      type: "TRACE",
      contentType: "application/zip",
      bytes: Buffer.from("trace"),
      createdAt: "2026-07-12T21:30:00Z",
      redactionApplied: false,
    });

    expect(artifact.storageUrl).toBeUndefined();
  });
});
