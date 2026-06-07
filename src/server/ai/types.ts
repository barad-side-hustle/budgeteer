import "server-only";

export type AIConfidence = number;

export interface CategoryMapping {
  index: number;
  categoryName: string;
  isNew?: boolean;
  confidence?: AIConfidence;
}

export interface TransactionForCategorization {
  description: string;
  amount: number;
  currency: string;
  memo?: string | null;
}

export interface CategoryForCategorization {
  name: string;
  description: string | null;
  parentName?: string | null;
}

export interface PastCorrection {
  description: string;
  wrongCategory: string;
  correctCategory: string;
}

export interface AIProvider {
  categorize(
    transactions: TransactionForCategorization[],
    categories: CategoryForCategorization[],
    options?: { allowProposals?: boolean; pastCorrections?: PastCorrection[] },
  ): Promise<CategoryMapping[]>;
}
