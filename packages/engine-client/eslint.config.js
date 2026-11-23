import base from "@trs/eslint-config"

// src/generated is written by scripts/generate.mjs from the engines' OpenAPI documents.
export default [{ ignores: ["src/generated/**"] }, ...base]
