import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/components/ui/**"],
    rules: {
      "@next/next/no-img-element": "off",
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["./*", "./**", "../*", "../**"],
              message: 'Use the "@/" path alias instead of a relative import.',
            },
          ],
        },
      ],
    },
  },
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts", ".context/**"]),
]);

export default eslintConfig;
