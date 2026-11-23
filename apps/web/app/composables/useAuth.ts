import type { AuthMessage, Invitation, Office, Session } from "~/utils/auth"
import { officeSlug } from "~/utils/auth"

/**
 * better-auth endpoints of the API (`/api/auth/*`) and `GET /office`. The session cookie is
 * HttpOnly and set by the API: the browser sends it with `credentials: "include"`, and during
 * server rendering the incoming cookie header is forwarded.
 */
export function useAuth() {
  const { apiUrl } = useRuntimeConfig().public
  const api = $fetch.create({
    baseURL: apiUrl,
    credentials: "include",
    retry: 0,
    headers: import.meta.server ? useRequestHeaders(["cookie"]) : {},
  })
  const origin = useRequestURL().origin
  const session = useState<Session | null>("auth:session", () => null)

  async function refreshSession(): Promise<Session | null> {
    session.value = await api<Session | null>("/api/auth/get-session").catch(() => null)
    return session.value
  }

  const post = <T = unknown>(path: string, body: Record<string, unknown>) =>
    api<T>(path, { method: "POST", body })

  return {
    session,
    refreshSession,
    async signIn(body: { email: string; password: string }) {
      await post("/api/auth/sign-in/email", body)
      return refreshSession()
    },
    async signOut() {
      await post("/api/auth/sign-out", {})
      session.value = null
    },
    /** `callbackPath` is where the verification link lands (validated by the API's origin check). */
    signUp: (body: { name: string; email: string; password: string }, callbackPath: string) =>
      post("/api/auth/sign-up/email", { ...body, callbackURL: `${origin}${callbackPath}` }),
    resendVerification: (email: string, callbackPath: string) =>
      post("/api/auth/send-verification-email", { email, callbackURL: `${origin}${callbackPath}` }),
    requestPasswordReset: (email: string) =>
      post("/api/auth/request-password-reset", { email, redirectTo: `${origin}/redefinir-senha` }),
    resetPassword: (token: string, newPassword: string) =>
      post("/api/auth/reset-password", { token, newPassword }),
    getInvitation: (id: string) =>
      api<Invitation>("/api/auth/organization/get-invitation", { query: { id } }),
    acceptInvitation: (invitationId: string) =>
      post("/api/auth/organization/accept-invitation", { invitationId }),
    createOffice(name: string) {
      const suffix = Array.from(crypto.getRandomValues(new Uint8Array(3)), (b) =>
        b.toString(16).padStart(2, "0"),
      ).join("")
      return post("/api/auth/organization/create", { name, slug: officeSlug(name, suffix) })
    },
    getOffice: () => api<Office>("/office"),
  }
}

/** Translates an `authErrorMessage()` result; the minutes also pick the plural form. */
export function useAuthMessage() {
  const { t } = useI18n()
  return (message: AuthMessage) =>
    t(message.key, message.params ?? {}, message.params?.minutes ?? 1)
}
