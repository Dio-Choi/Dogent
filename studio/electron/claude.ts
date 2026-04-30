import Anthropic from "@anthropic-ai/sdk";

export interface AnthropicMessage {
  role: "user" | "assistant";
  content: string;
}

export interface RunOptions {
  apiKey: string;
  messages: AnthropicMessage[];
  system: string;
  model: string;
  cwd: string;
}

export async function runClaude(
  opts: RunOptions,
  onChunk: (chunk: string) => void
): Promise<{ text: string }> {
  const client = new Anthropic({ apiKey: opts.apiKey });

  const stream = client.messages.stream({
    model: opts.model || "claude-sonnet-4-6",
    max_tokens: 8192,
    system: opts.system,
    messages: opts.messages,
  });

  let text = "";
  for await (const event of stream) {
    if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
      text += event.delta.text;
      onChunk(event.delta.text);
    }
  }

  return { text };
}
