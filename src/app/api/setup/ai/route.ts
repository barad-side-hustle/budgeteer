import { NextResponse } from "next/server";
import { setSetting } from "@/server/db/queries/settings";
import { encrypt } from "@/server/lib/encryption";

export async function POST(request: Request) {
  const body = (await request.json()) as {
    provider: "claude" | "gemini" | "ollama" | "openrouter" | "none";
    claudeApiKey?: string;
    geminiApiKey?: string;
    geminiModel?: string;
    openRouterApiKey?: string;
    openRouterModel?: string;
    ollamaUrl?: string;
    ollamaModel?: string;
  };

  if (body.provider === "claude" && !body.claudeApiKey) {
    return NextResponse.json({ error: "Enter a Claude API key." }, { status: 400 });
  }
  if (body.provider === "gemini" && !body.geminiApiKey) {
    return NextResponse.json({ error: "Enter a Gemini API key." }, { status: 400 });
  }
  if (body.provider === "openrouter" && !body.openRouterApiKey) {
    return NextResponse.json({ error: "Enter an OpenRouter API key." }, { status: 400 });
  }

  setSetting("ai_provider", body.provider);

  if (body.claudeApiKey) {
    const { encrypted, iv, authTag } = encrypt(body.claudeApiKey);
    setSetting("ai_api_key_encrypted", encrypted.toString("hex"));
    setSetting("ai_api_key_iv", iv.toString("hex"));
    setSetting("ai_api_key_auth_tag", authTag.toString("hex"));
  }

  if (body.geminiApiKey) {
    const { encrypted, iv, authTag } = encrypt(body.geminiApiKey);
    setSetting("ai_gemini_key_encrypted", encrypted.toString("hex"));
    setSetting("ai_gemini_key_iv", iv.toString("hex"));
    setSetting("ai_gemini_key_auth_tag", authTag.toString("hex"));
  }

  if (body.openRouterApiKey) {
    const { encrypted, iv, authTag } = encrypt(body.openRouterApiKey);
    setSetting("ai_openrouter_key_encrypted", encrypted.toString("hex"));
    setSetting("ai_openrouter_key_iv", iv.toString("hex"));
    setSetting("ai_openrouter_key_auth_tag", authTag.toString("hex"));
  }

  if (body.geminiModel) setSetting("ai_gemini_model", body.geminiModel);
  if (body.openRouterModel) setSetting("ai_openrouter_model", body.openRouterModel);
  if (body.ollamaUrl) setSetting("ai_ollama_url", body.ollamaUrl);
  if (body.ollamaModel) setSetting("ai_ollama_model", body.ollamaModel);

  return NextResponse.json({ success: true });
}
