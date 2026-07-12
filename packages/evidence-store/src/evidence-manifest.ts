import {
  EVIDENCE_MANIFEST_SCHEMA_VERSION,
  EvidenceArtifactSchema,
  EvidenceManifestSchema,
  hashEvidenceManifest,
  type EvidenceArtifact,
  type EvidenceManifest,
} from "@shipcheck/domain";

export function buildEvidenceManifest(
  artifacts: readonly EvidenceArtifact[],
): EvidenceManifest {
  const validatedArtifacts = artifacts.map((artifact) =>
    EvidenceArtifactSchema.parse(artifact),
  );
  const ids = new Set<string>();
  for (const artifact of validatedArtifacts) {
    if (ids.has(artifact.id)) {
      throw new TypeError(`Duplicate evidence ID: ${artifact.id}`);
    }
    ids.add(artifact.id);
  }

  const orderedArtifacts = validatedArtifacts.sort((left, right) =>
    left.id.localeCompare(right.id),
  );

  return EvidenceManifestSchema.parse({
    schemaVersion: EVIDENCE_MANIFEST_SCHEMA_VERSION,
    artifacts: orderedArtifacts,
    evidenceManifestHash: hashEvidenceManifest(orderedArtifacts),
  });
}
