import { AnthropicProvider } from "./anthropic.ts";
import { ClaudeCodeProvider } from "./claudecode.ts";
import { MockProvider } from "./mock.ts";
import type { Provider } from "./provider.ts";

export type ProviderName = "api" | "claude-code" | "mock";

export interface ProviderAvailability {
  api: boolean;
  claudeCode: boolean;
  claudeCodeDetail: string;
  default: ProviderName;
}

let cached: ProviderAvailability | null = null;

/** Which providers can run on this machine. Claude Code login is checked once and cached. */
export function providerAvailability(refresh = false): ProviderAvailability {
  if (cached && !refresh) return cached;
  const api = !!(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
  const cc = ClaudeCodeProvider.available();
  const preferred = (process.env.PROVIDER as ProviderName | undefined) ?? undefined;
  const def: ProviderName =
    preferred && (preferred === "mock" || (preferred === "api" && api) || (preferred === "claude-code" && cc.ok)) ? preferred : cc.ok ? "claude-code" : api ? "api" : "mock";
  cached = { api, claudeCode: cc.ok, claudeCodeDetail: cc.detail, default: def };
  return cached;
}

export function makeProvider(name: ProviderName): Provider {
  switch (name) {
    case "api":
      return new AnthropicProvider();
    case "claude-code":
      return new ClaudeCodeProvider();
    case "mock":
      return new MockProvider();
  }
}
