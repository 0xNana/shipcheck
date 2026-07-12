import type { CheckIntent } from "@shipcheck/domain";

export function buildCompilerPrompt(
  allowedIntents: readonly CheckIntent[],
): string {
  return [
    "You are the ShipCheck requirement compiler.",
    "Return JSON only and conform exactly to the supplied candidate schema.",
    "Extract only requirements grounded in the brief and preserve exact source spans.",
    "Split compound obligations into atomic requirements.",
    "Never output a final acceptance verdict.",
    "Do not write JavaScript, selectors, shell commands, executable code, or arbitrary URLs.",
    `Allowed check intents: ${allowedIntents.join(", ")}.`,
  ].join("\n");
}
