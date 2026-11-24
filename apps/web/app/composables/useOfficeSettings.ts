import type { Member, OfficeRole, OfficeSettings, PendingInvitation } from "~/utils/office"

/** `/v1/office*` of the API and the better-auth invitation call, with the session cookie. */
export function useOfficeSettings() {
  const { apiUrl } = useRuntimeConfig().public
  const api = $fetch.create({
    baseURL: apiUrl,
    credentials: "include",
    retry: 0,
    headers: import.meta.server ? useRequestHeaders(["cookie"]) : {},
  })
  const id = (value: string) => encodeURIComponent(value)
  return {
    /** Absolute URL of the logo; the ETag in the query busts the browser cache after a change. */
    logoSrc: (logo: { url: string; etag: string }) =>
      `${apiUrl}${logo.url}?v=${encodeURIComponent(logo.etag)}`,
    get: () => api<OfficeSettings>("/v1/office"),
    update: (body: Partial<Record<string, string | null>>) =>
      api<OfficeSettings>("/v1/office", { method: "PATCH", body }),
    uploadLogo: (file: Blob) =>
      api<OfficeSettings>("/v1/office/logo", {
        method: "POST",
        body: file,
        headers: { "content-type": file.type },
      }),
    removeLogo: () => api<null>("/v1/office/logo", { method: "DELETE" }),
    members: () => api<{ items: Member[] }>("/v1/office/members"),
    changeRole: (memberId: string, role: OfficeRole) =>
      api<null>(`/v1/office/members/${id(memberId)}`, { method: "PATCH", body: { role } }),
    removeMember: (memberId: string) =>
      api<null>(`/v1/office/members/${id(memberId)}`, { method: "DELETE" }),
    invitations: () => api<{ items: PendingInvitation[] }>("/v1/office/invitations"),
    invite: (body: { email: string; role: OfficeRole; organizationId: string }) =>
      api("/api/auth/organization/invite-member", { method: "POST", body }),
    cancelInvitation: (invitationId: string) =>
      api<null>(`/v1/office/invitations/${id(invitationId)}`, { method: "DELETE" }),
    resendInvitation: (invitationId: string) =>
      api<null>(`/v1/office/invitations/${id(invitationId)}/resend`, { method: "POST" }),
  }
}
