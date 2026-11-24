/**
 * The signed-in user's office (`GET /office`), shared by the dashboard and the header under one
 * key, so a page renders it with a single request. `null`: signed in but without an office yet (403).
 */
export function useOffice() {
  const { getOffice } = useAuth()
  return useAsyncData("office", async () => {
    try {
      return await getOffice()
    } catch (e) {
      if (errorStatus(e) === 403) return null
      throw e
    }
  })
}
