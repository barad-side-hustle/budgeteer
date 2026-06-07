import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "sqlite",
  schema: "./src/server/db/schema.ts",
  out: "./.context/drizzle-introspect",
  dbCredentials: { url: ".context/introspect.db" },
});
