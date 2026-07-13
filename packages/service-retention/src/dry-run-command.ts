import type { RetentionService } from "./retention-service.js";

export interface RetentionDryRunCommand {
  readonly name: "retention:dry-run";
  run(): Promise<string>;
}

export function createRetentionDryRunCommand(
  service: RetentionService,
): RetentionDryRunCommand {
  return {
    name: "retention:dry-run",
    async run(): Promise<string> {
      const result = await service.run({ dryRun: true });
      return JSON.stringify(
        {
          command: "retention:dry-run",
          skippedBecauseLocked: result.skippedBecauseLocked,
          candidates: {
            evidenceIds: result.evidenceIds,
            reportReceiptIds: result.reportReceiptIds,
            receiptIds: result.receiptIds,
            requestIds: result.requestIds,
          },
        },
        null,
        2,
      );
    },
  };
}
