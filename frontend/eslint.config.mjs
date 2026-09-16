// frontend/eslint.config.mjs
import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    // 关闭一些过于严格的规则（都是我们故意"违规"的地方）
    rules: {
      "@typescript-eslint/no-explicit-any": "off",       // 允许使用 any
      "@typescript-eslint/no-unused-vars": "off",        // 允许声明但未使用的变量
      "@next/next/no-img-element": "off",                // 允许使用 <img> 展示图表
    },
  },
];

export default eslintConfig;