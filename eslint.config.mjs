import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["**/dist/**", "**/.next/**", "**/node_modules/**", "**/coverage/**"] },
  {
    files: ["**/*.{ts,tsx,mts,cts,js,mjs,cjs}"],
    extends: [tseslint.configs.base],
    rules: {}
  }
);
