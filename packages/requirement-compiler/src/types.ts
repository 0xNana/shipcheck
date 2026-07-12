import type {
  AcceptanceContract,
  CheckIntent,
} from "@shipcheck/domain";

export interface CompilerModelRequest {
  readonly systemPrompt: string;
  readonly brief: string;
  readonly maxRequirements: number;
  readonly allowedIntents: readonly CheckIntent[];
  readonly responseSchema: Readonly<Record<string, unknown>>;
  readonly isRepair: boolean;
  readonly issues?: readonly string[];
}

export interface RequirementCompilerModel {
  generate(request: CompilerModelRequest): Promise<unknown>;
}

export interface RequirementCompilerOptions {
  readonly model: RequirementCompilerModel;
  readonly compilerVersion: string;
  readonly policyVersion: string;
  readonly executionPolicyVersion: string;
  readonly createContractId: () => string;
  readonly now: () => string;
}

export type CompiledAcceptanceContract = AcceptanceContract;
