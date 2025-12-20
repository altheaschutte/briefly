import nextPlugin from "@next/eslint-plugin-next";

export default [
  {
    ignores: ["node_modules/**", ".next/**"]
  },
  {
    plugins: {
      "@next/next": nextPlugin
    },
    rules: {
      ...nextPlugin.configs.recommended.rules
    }
  }
];
