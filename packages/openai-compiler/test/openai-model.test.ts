import { describe, expect, it, vi } from "vitest";

import {
  createOpenAiCompilerModel,
  createOpenAiCompilerModelFromEnv,
} from "../src/index.js";

describe("createOpenAiCompilerModel", () => {
  it("calls OpenAI chat completions with JSON schema and propagates abort", async () => {
    const fetchImpl = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      expect(init?.signal).toBeInstanceOf(AbortSignal);
      void input;
      return Promise.resolve(
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({ requirements: [] }),
                },
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      );
    });

    const model = createOpenAiCompilerModel({
      apiKey: "test-key",
      model: "gpt-test",
      baseUrl: "https://example.test/v1",
      timeoutMs: 5_000,
      fetchImpl,
    });

    const controller = new AbortController();
    const output = await model.generate({
      systemPrompt: "system",
      brief: "Build pricing.",
      maxRequirements: 8,
      allowedIntents: ["SECTION_PRESENT"],
      responseSchema: { type: "object" },
      isRepair: false,
      signal: controller.signal,
    });

    expect(output).toEqual({ requirements: [] });
    expect(fetchImpl).toHaveBeenCalledOnce();
    const firstCall = fetchImpl.mock.calls[0];
    expect(firstCall).toBeDefined();
    const init = firstCall?.[1];
    expect(init?.headers).toMatchObject({
      Authorization: "Bearer test-key",
    });
    const rawBody = init?.body;
    expect(typeof rawBody).toBe("string");
    const body = JSON.parse(rawBody as string) as {
      model: string;
      response_format: { type: string };
    };
    expect(body.model).toBe("gpt-test");
    expect(body.response_format.type).toBe("json_schema");
  });

  it("aborts in-flight requests when the caller signal aborts", async () => {
    let observedSignal: AbortSignal | undefined;
    const fetchImpl = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
      observedSignal = init?.signal ?? undefined;
      return new Promise<Response>((resolve) => {
        setTimeout(() => {
          resolve(new Response("{}", { status: 200 }));
        }, 50);
      });
    });

    const model = createOpenAiCompilerModel({
      apiKey: "test-key",
      model: "gpt-test",
      fetchImpl,
      timeoutMs: 5_000,
    });
    const controller = new AbortController();
    const pending = model.generate({
      systemPrompt: "system",
      brief: "Build pricing.",
      maxRequirements: 8,
      allowedIntents: ["SECTION_PRESENT"],
      responseSchema: { type: "object" },
      isRepair: false,
      signal: controller.signal,
    });
    controller.abort();
    await expect(pending).rejects.toThrow();
    expect(observedSignal?.aborted).toBe(true);
  });
});

describe("createOpenAiCompilerModelFromEnv", () => {
  it("reads model credentials from env", () => {
    const model = createOpenAiCompilerModelFromEnv(
      {
        OPENAI_API_KEY: "env-key",
        REQUIREMENT_COMPILER_MODEL: "gpt-env",
        OPENAI_BASE_URL: "https://example.test/v1",
      },
      {
        fetchImpl: vi.fn(() =>
          Promise.resolve(
            Response.json({
              choices: [{ message: { content: "{}" } }],
            }),
          ),
        ),
      },
    );
    expect(typeof model.generate).toBe("function");
  });
});
