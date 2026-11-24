// Worker (SSR) error tracking on Cloudflare (EST-03.3), only when NUXT_PUBLIC_SENTRY_DSN is set.
// @sentry/nuxt's Cloudflare Nitro plugin wraps each request with @sentry/cloudflare; the Nuxt module
// itself is not used (it targets Node servers and source-map upload). With nodejs_compat, the
// Worker's vars and secrets are on process.env.
import { sentryCloudflareNitroPlugin } from "@sentry/nuxt/module/plugins"

const dsn = process.env.NUXT_PUBLIC_SENTRY_DSN

export default defineNitroPlugin(
  dsn
    ? sentryCloudflareNitroPlugin({
        dsn,
        environment: process.env.NUXT_PUBLIC_SENTRY_ENVIRONMENT ?? "development",
        release: process.env.NUXT_PUBLIC_APP_VERSION ?? "dev",
        sendDefaultPii: false,
        tracesSampleRate: 0,
        maxBreadcrumbs: 0,
        beforeSend: (event) => scrubSentryEvent(event),
      })
    : () => {},
)
