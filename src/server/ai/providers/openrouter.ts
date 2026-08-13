import "server-only";

import { createOpenRouter, type LanguageModelV3 } from "@openrouter/ai-sdk-provider";
import { generateText } from "ai";
import { parseCategorizationResponse } from "@/server/ai/lib/parse-response";
import { buildCategorizationPrompt, SYSTEM_PROMPT } from "@/server/ai/prompts";
import type {
  AIProvider,
  CategoryForCategorization,
  CategoryMapping,
  PastCorrection,
  TransactionForCategorization,
} from "@/server/ai/types";

export class OpenRouterProvider implements AIProvider {
  private model: LanguageModelV3;

  constructor(apiKey: string, modelId: string) {
    this.model = createOpenRouter({ apiKey }).chat(modelId);
  }

  async categorize(
    transactions: TransactionForCategorization[],
    categories: CategoryForCategorization[],
    options?: { allowProposals?: boolean; pastCorrections?: PastCorrection[] },
  ): Promise<CategoryMapping[]> {
    const allowProposals = options?.allowProposals ?? false;
    const prompt = buildCategorizationPrompt(
      transactions,
      categories,
      allowProposals,
      options?.pastCorrections ?? [],
    );

    const { text } = await generateText({
      model: this.model,
      system: SYSTEM_PROMPT,
      prompt,
    });

    return parseCategorizationResponse(
      text,
      categories.map((c) => c.name),
      allowProposals,
    );
  }
}
