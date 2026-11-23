import base from "@trs/eslint-config"

// Root-level files only (tool configs); each package lints itself with its own config.
export default [{ ignores: ["apps/**", "packages/**"] }, ...base]
