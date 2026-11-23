// better-auth declares optional peers for every framework and tool it integrates with. pnpm links any
// that the workspace happens to have, and `pnpm deploy --prod` then ships them in the API image:
// drizzle-kit (and its esbuild binaries), vitest and vue. The API uses none of them at runtime.
const UNUSED_BETTER_AUTH_PEERS = ["drizzle-kit", "vitest", "vue"]

function readPackage(pkg) {
  if (pkg.name === "better-auth") {
    for (const name of UNUSED_BETTER_AUTH_PEERS) {
      if (pkg.peerDependencies) delete pkg.peerDependencies[name]
      if (pkg.peerDependenciesMeta) delete pkg.peerDependenciesMeta[name]
    }
  }
  return pkg
}

module.exports = { hooks: { readPackage } }
