import base from "@trs/eslint-config"
import prettier from "eslint-config-prettier"
import pluginVue from "eslint-plugin-vue"
import globals from "globals"
import tseslint from "typescript-eslint"

export default tseslint.config(
  ...base,
  ...pluginVue.configs["flat/recommended"],
  {
    // One project service serves .ts and .vue files, so it must know about .vue from the start.
    languageOptions: { parserOptions: { extraFileExtensions: [".vue"] } },
  },
  {
    files: ["**/*.vue"],
    languageOptions: {
      globals: { ...globals.browser },
      parserOptions: { parser: tseslint.parser, projectService: true },
    },
    rules: {
      ...tseslint.configs.eslintRecommended.rules,
      // Nuxt auto-imports are declared to TypeScript, which already reports undefined names.
      "no-undef": "off",
    },
  },
  {
    // File names fixed by Nuxt conventions (routes, layouts, app entry points).
    files: ["app/app.vue", "app/error.vue", "app/layouts/**/*.vue", "app/pages/**/*.vue"],
    rules: { "vue/multi-word-component-names": "off" },
  },
  prettier,
)
