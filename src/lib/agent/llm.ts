import { env } from "@/lib/env";

type ChatMessage = {
  role: "system" | "user";
  content: string;
};

type ChatCompletionResponse = {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
};

export async function callStrategyModel(messages: ChatMessage[]) {
  if (!env.LLM_API_KEY) {
    throw new Error("LLM_API_KEY is not configured.");
  }

  const response = await fetch(`${env.LLM_BASE_URL.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${env.LLM_API_KEY}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      model: env.LLM_MODEL,
      messages,
      temperature: 0.2,
      extra_body: {
        trust_mode: env.LLM_TRUST_MODE
      }
    })
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`LLM request failed: ${response.status} ${detail}`);
  }

  const payload = (await response.json()) as ChatCompletionResponse;
  const content = payload.choices?.[0]?.message?.content?.trim();

  if (!content) {
    throw new Error("LLM response did not include message content.");
  }

  return content;
}
