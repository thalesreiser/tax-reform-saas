<script setup lang="ts">
import type { FormSubmitEvent } from "@nuxt/ui"
import type { InviteInput, Member, OfficeRole, PendingInvitation } from "~/utils/office"

// Members of the office; owners also change roles, remove members, invite and manage pending
// invitations. Accountants see the members list only (they cannot invite or see invitations).
const props = defineProps<{
  officeId: string
  canManage: boolean
  currentUserId: string | null
  initialMembers: Member[]
  initialInvitations: PendingInvitation[]
}>()
const { t } = useI18n()
const api = useOfficeSettings()

const members = ref<Member[]>([...props.initialMembers])
const invitations = ref<PendingInvitation[]>([...props.initialInvitations])
const status = ref("")
const error = ref<string | null>(null)
const busyId = ref<string | null>(null)

const removing = ref<Member | null>(null)
const removeOpen = ref(false)
const roleItems = computed(() => OFFICE_ROLES.map((r) => ({ label: t(`roles.${r}`), value: r })))

function startRemove(member: Member) {
  removing.value = member
  removeOpen.value = true
}

function onRemoved(member: Member) {
  members.value = members.value.filter((m) => m.id !== member.id)
  status.value = t("office.team.remove.done", { name: member.name })
}

async function changeRole(member: Member, role: OfficeRole) {
  if (role === member.role) return
  busyId.value = member.id
  error.value = null
  status.value = ""
  try {
    await api.changeRole(member.id, role)
    members.value = members.value.map((m) => (m.id === member.id ? { ...m, role } : m))
    status.value = t("office.team.roleChanged", { name: member.name, role: t(`roles.${role}`) })
  } catch (e) {
    // Re-render the select with the role the member still has.
    members.value = [...members.value]
    error.value = t(officeErrorKey(e, "role"))
  } finally {
    busyId.value = null
  }
}

const inviteState = reactive<{ email: string; role: OfficeRole }>({ email: "", role: "accountant" })
const inviting = ref(false)

async function reloadInvitations() {
  invitations.value = (await api.invitations().catch(() => ({ items: invitations.value }))).items
}

async function onInvite(event: FormSubmitEvent<InviteInput>) {
  inviting.value = true
  error.value = null
  status.value = ""
  try {
    await api.invite({ ...event.data, organizationId: props.officeId })
    status.value = t("office.team.invite.sent", { email: event.data.email })
    inviteState.email = ""
    await reloadInvitations()
  } catch (e) {
    error.value = t(officeErrorKey(e, "invite"))
  } finally {
    inviting.value = false
  }
}

async function cancelInvitation(invitation: PendingInvitation) {
  busyId.value = invitation.id
  error.value = null
  status.value = ""
  try {
    await api.cancelInvitation(invitation.id)
    invitations.value = invitations.value.filter((i) => i.id !== invitation.id)
    status.value = t("office.team.invitations.cancelled", { email: invitation.email })
  } catch (e) {
    error.value = t(officeErrorKey(e, "cancelInvite"))
  } finally {
    busyId.value = null
  }
}

async function resendInvitation(invitation: PendingInvitation) {
  busyId.value = invitation.id
  error.value = null
  status.value = ""
  try {
    await api.resendInvitation(invitation.id)
    status.value = t("office.team.invitations.resent", { email: invitation.email })
    await reloadInvitations()
  } catch (e) {
    error.value = t(officeErrorKey(e, "resend"))
  } finally {
    busyId.value = null
  }
}
</script>

<template>
  <div class="space-y-6">
    <p aria-live="polite" class="min-h-5 text-sm text-muted" data-team-status>{{ status }}</p>
    <UAlert v-if="error" role="alert" color="error" variant="subtle" :description="error" />

    <ul :aria-label="t('office.team.membersLabel')" class="divide-y divide-default" data-members>
      <li
        v-for="member in members"
        :key="member.id"
        class="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between"
      >
        <div class="min-w-0">
          <p class="font-medium break-words text-highlighted">
            {{ member.name }}
            <span v-if="member.userId === currentUserId" class="text-sm font-normal text-muted">
              {{ t("office.team.you") }}
            </span>
          </p>
          <p class="text-sm break-all text-muted">{{ member.email }}</p>
          <p class="text-sm text-muted">
            {{ t("office.team.joined", { date: formatDate(member.joinedAt) }) }}
          </p>
        </div>
        <div v-if="canManage" class="flex flex-wrap items-center gap-2">
          <USelect
            :model-value="member.role"
            :items="roleItems"
            :aria-label="t('office.team.roleOf', { name: member.name })"
            :disabled="busyId === member.id"
            class="w-40"
            @update:model-value="changeRole(member, $event as OfficeRole)"
          />
          <UButton
            color="error"
            variant="ghost"
            icon="i-lucide-user-minus"
            :aria-label="t('office.team.removeMember', { name: member.name })"
            data-action="remove-member"
            @click="startRemove(member)"
          />
        </div>
        <UBadge v-else color="neutral" variant="subtle">{{ t(`roles.${member.role}`) }}</UBadge>
      </li>
    </ul>

    <template v-if="canManage">
      <div class="space-y-3">
        <h3 class="font-semibold text-highlighted">{{ t("office.team.invite.title") }}</h3>
        <UForm
          :schema="inviteSchema(t)"
          :state="inviteState"
          class="flex flex-col gap-3 sm:flex-row sm:items-end"
          @submit="onInvite"
        >
          <UFormField :label="t('office.team.invite.email')" name="email" class="flex-1">
            <UInput
              v-model="inviteState.email"
              name="email"
              type="email"
              autocomplete="off"
              class="w-full"
            />
          </UFormField>
          <UFormField :label="t('office.team.invite.role')" name="role">
            <USelect v-model="inviteState.role" :items="roleItems" class="w-40" />
          </UFormField>
          <UButton type="submit" icon="i-lucide-send" :loading="inviting">
            {{ t("office.team.invite.submit") }}
          </UButton>
        </UForm>
      </div>

      <div class="space-y-3">
        <h3 class="font-semibold text-highlighted">{{ t("office.team.invitations.title") }}</h3>
        <p v-if="invitations.length === 0" class="text-sm text-muted">
          {{ t("office.team.invitations.empty") }}
        </p>
        <ul v-else class="divide-y divide-default" data-invitations>
          <li
            v-for="invitation in invitations"
            :key="invitation.id"
            class="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between"
          >
            <div class="min-w-0">
              <p class="font-medium break-all text-highlighted">{{ invitation.email }}</p>
              <p class="text-sm text-muted">
                {{ t(`roles.${invitation.role}`) }} ·
                {{
                  t("office.team.invitations.expires", { date: formatDate(invitation.expiresAt) })
                }}
              </p>
            </div>
            <div class="flex gap-2">
              <UButton
                variant="ghost"
                icon="i-lucide-refresh-cw"
                :disabled="busyId === invitation.id"
                @click="resendInvitation(invitation)"
              >
                {{ t("office.team.invitations.resend") }}
              </UButton>
              <UButton
                color="error"
                variant="ghost"
                icon="i-lucide-x"
                :disabled="busyId === invitation.id"
                @click="cancelInvitation(invitation)"
              >
                {{ t("office.team.invitations.cancel") }}
              </UButton>
            </div>
          </li>
        </ul>
      </div>
    </template>

    <OfficeRemoveMemberDialog v-model:open="removeOpen" :member="removing" @removed="onRemoved" />
  </div>
</template>
