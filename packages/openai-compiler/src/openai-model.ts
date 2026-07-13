import type { RequirementCompilerModel } from "@shipcheck/requirement-compiler";

export interface OpenAiCompilerModelOptions {
  readonly apiKey: string;
  readonly model: string;
  readonly baseUrl?: string;
  readonly timeoutMs?: number;
  readonly fetchImpl?: typeof fetch;
}

interface ChatCompletionResponse {
  readonly choices?: ReadonlyArray<{
    readonly message?: {
      readonly content?: string | null;
    };
  }>;
}

function requireNonEmpty(name: string, value: string): void {
  if (value.trim().length === 0) {
    throw new TypeError(`${name} must not be empty`);
  }
}

function buildUserPrompt(
  request: Parameters<RequirementCompilerModel["generate"]>[0],
): string {
  const lines = [
    `Delivery brief:\n${request.brief}`,
    `Max requirements: ${String(request.maxRequirements)}`,
    `Allowed intents: ${request.allowedIntents.join(", ")}`,
  ];
  if (request.isRepair) {
    lines.push("Repair the previous invalid output.");
    if (request.issues !== undefined) {
      lines.push(`Issues:\n${request.issues.join("\n")}`);
    }
  }
  return lines.join("\n\n");
}

export function createOpenAiCompilerModel(
  options: OpenAiCompilerModelOptions,
): RequirementCompilerModel {
  requireNonEmpty("OPENAI_API_KEY", options.apiKey);
  requireNonEmpty("REQUIREMENT_COMPILER_MODEL", options.model);
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? 30_000;
  const endpoint = `${options.baseUrl ?? "https://api.openai.com/v1"}/chat/completions`;

  return {
    async generate(request) {
      const controller = new AbortController();
      const timeout = setTimeout(() => {
        controller.abort();
      }, timeoutMs);
      const signal = request.signal;
      const abortFromCaller = (): void => {
        controller.abort();
      };
      signal?.addEventListener("abort", abortFromCaller, { once: true });
      try {
        signal?.throwIfAborted();
        const response = await fetchImpl(endpoint, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${options.apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: options.model,
            temperature: 0,
            response_format: {
              type: "json_schema",
              json_schema: {
                name: "requirement_compiler_output",
                strict: true,
                schema: request.responseSchema,
              },
            },
            messages: [
              { role: "system", content: request.systemPrompt },
              { role: "user", content: buildUserPrompt(request) },
            ],
          }),
          signal: controller.signal,
        });
        if (!response.ok) {
          throw new Error(
            `OpenAI chat completion failed with status ${String(response.status)}`,
          );
        }
        const payload = (await response.json()) as ChatCompletionResponse;
        const content = payload.choices?.[0]?.message?.content;
        if (typeof content !== "string" || content.length === 0) {
          throw new Error("OpenAI chat completion returned empty content");
        }
        return JSON.parse(content) as unknown;
      } finally {
        clearTimeout(timeout);
        signal?.removeEventListener("abort", abortFromCaller);
      }
    },
  };
}

export function createOpenAiCompilerModelFromEnv(
  env: NodeJS.ProcessEnv = process.env,
  overrides: Partial<OpenAiCompilerModelOptions> = {},
): RequirementCompilerModel {
  const apiKey = overrides.apiKey ?? env["OPENAI_API_KEY"];
  const model =
    overrides.model ?? env["REQUIREMENT_COMPILER_MODEL"];
  if (apiKey === undefined || model === undefined) {
    throw new TypeError(
      "OPENAI_API_KEY and REQUIREMENT_COMPILER_MODEL are required",
    );
  }
  return createOpenAiCompilerModel({
    apiKey,
    model,
    ...(overrides.baseUrl === undefined
      ? env["OPENAI_BASE_URL"] === undefined
        ? {}
        : { baseUrl: env["OPENAI_BASE_URL"] }
      : { baseUrl: overrides.baseUrl }),
    ...(overrides.timeoutMs === undefined ? {} : { timeoutMs: overrides.timeoutMs }),
    ...(overrides.fetchImpl === undefined ? {} : { fetchImpl: overrides.fetchImpl }),
  });
}
