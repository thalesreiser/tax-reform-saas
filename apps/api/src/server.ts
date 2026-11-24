import { buildApp } from "./app.js"
import { loadConfig } from "./config.js"
import { flushSentry, initSentry } from "./sentry.js"

const config = loadConfig()
initSentry(config)
const app = await buildApp(config)

const shutdown = (signal: NodeJS.Signals) => {
  app.log.info({ signal }, "shutting down")
  app
    .close()
    .then(() => flushSentry())
    .then(
      () => process.exit(0),
      (err: unknown) => {
        app.log.error({ err }, "error while shutting down")
        process.exit(1)
      },
    )
}
process.once("SIGTERM", shutdown)
process.once("SIGINT", shutdown)

await app.listen({ host: config.HOST, port: config.PORT })
