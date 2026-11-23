import { auroraColors } from "./theme/aurora"

export default defineAppConfig({
  // Placeholder product name, shown in the header, footer and page titles (Q-01).
  appName: "tax-reform-saas",

  ui: {
    colors: auroraColors,
    button: {
      // Nuxt UI darkens solid buttons on hover with transparency (`bg-primary/75`), which drops
      // white text below 4.5:1. Hover and active use the next opaque shade instead.
      compoundVariants: [
        {
          color: "primary",
          variant: "solid",
          class:
            "hover:bg-primary-600 active:bg-primary-600 dark:hover:bg-primary-300 dark:active:bg-primary-300",
        },
        {
          color: "secondary",
          variant: "solid",
          class:
            "hover:bg-secondary-800 active:bg-secondary-800 dark:hover:bg-secondary-300 dark:active:bg-secondary-300",
        },
        {
          color: "success",
          variant: "solid",
          class:
            "hover:bg-success-800 active:bg-success-800 dark:hover:bg-success-300 dark:active:bg-success-300",
        },
        {
          color: "info",
          variant: "solid",
          class:
            "hover:bg-info-800 active:bg-info-800 dark:hover:bg-info-300 dark:active:bg-info-300",
        },
        {
          color: "warning",
          variant: "solid",
          class:
            "hover:bg-warning-800 active:bg-warning-800 dark:hover:bg-warning-300 dark:active:bg-warning-300",
        },
        {
          color: "error",
          variant: "solid",
          class:
            "hover:bg-error-800 active:bg-error-800 dark:hover:bg-error-300 dark:active:bg-error-300",
        },
      ],
    },
  },
})
