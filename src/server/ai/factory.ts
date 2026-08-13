import "server-only";

import { RECOMMENDED_GEMINI_MODELS, RECOMMENDED_OPENROUTER_MODELS } from "@/lib/types";
import { ClaudeProvider } from "@/server/ai/providers/claude";
import { GeminiProvider } from "@/server/ai/providers/gemini";
import { OllamaProvider } from "@/server/ai/providers/ollama";
import { OpenRouterProvider } from "@/server/ai/providers/openrouter";
import type { AIProvider } from "@/server/ai/types";
import { getSetting } from "@/server/db/queries/settings";
import { decrypt } from "@/server/lib/encryption";

export function createAIProvider(): AIProvider | null {
  const provider = getSetting("ai_provider");

  if (provider === "claude") {
    const encryptedKey = getSetting("ai_api_key_encrypted");
    const iv = getSetting("ai_api_key_iv");
    const authTag = getSetting("ai_api_key_auth_tag");

    if (!encryptedKey || !iv || !authTag) return null;

    const apiKey = decrypt({
      encrypted: Buffer.from(encryptedKey, "hex"),
      iv: Buffer.from(iv, "hex"),
      authTag: Buffer.from(authTag, "hex"),
    });

    return new ClaudeProvider(apiKey);
  }

  if (provider === "gemini") {
    const encryptedKey = getSetting("ai_gemini_key_encrypted");
    const iv = getSetting("ai_gemini_key_iv");
    const authTag = getSetting("ai_gemini_key_auth_tag");

    if (!encryptedKey || !iv || !authTag) return null;

    const apiKey = decrypt({
      encrypted: Buffer.from(encryptedKey, "hex"),
      iv: Buffer.from(iv, "hex"),
      authTag: Buffer.from(authTag, "hex"),
    });

    const model = getSetting("ai_gemini_model") ?? RECOMMENDED_GEMINI_MODELS[0].name;
    return new GeminiProvider(apiKey, model);
  }

  if (provider === "openrouter") {
    const encryptedKey = getSetting("ai_openrouter_key_encrypted");
    const iv = getSetting("ai_openrouter_key_iv");
    const authTag = getSetting("ai_openrouter_key_auth_tag");

    if (!encryptedKey || !iv || !authTag) return null;

    const apiKey = decrypt({
      encrypted: Buffer.from(encryptedKey, "hex"),
      iv: Buffer.from(iv, "hex"),
      authTag: Buffer.from(authTag, "hex"),
    });

    const model = getSetting("ai_openrouter_model") ?? RECOMMENDED_OPENROUTER_MODELS[0].name;
    return new OpenRouterProvider(apiKey, model);
  }

  if (provider === "ollama") {
    const url = getSetting("ai_ollama_url") ?? "http://localhost:11434";
    const model = getSetting("ai_ollama_model") ?? "llama3.1";
    return new OllamaProvider(url, model);
  }

  return null;
}
