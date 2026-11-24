// Browser error tracking (EST-03.3), only when NUXT_PUBLIC_SENTRY_DSN is set. The SDK is a separate
// chunk loaded from this app's own host on demand: without a DSN nothing is downloaded or sent.
// With a DSN, events go only to the Sentry ingest host of that DSN. No session replay, no tracing.
export default defineNuxtPlugin({
  name: "sentry",
  parallel: true,
  async setup(nuxtApp) {
    const { sentryDsn, sentryEnvironment, appVersion } = useRuntimeConfig().public
    if (!sentryDsn) return
    const Sentry = await import("@sentry/vue")
    Sentry.init({
      app: nuxtApp.vueApp,
      dsn: sentryDsn,
      environment: sentryEnvironment,
      release: appVersion,
      tracesSampleRate: 0,
      maxBreadcrumbs: 0,
      beforeSend: (event) => scrubSentryEvent(event),
    })
  },
})
