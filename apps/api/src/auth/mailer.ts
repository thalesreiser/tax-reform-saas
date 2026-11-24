import type { FastifyBaseLogger } from "fastify"

/** One transactional e-mail. `text` may carry a secret link (invitation, verification). */
export interface MailMessage {
  to: string
  subject: string
  text: string
}

/** E-mail transport. A real provider is pending (see README "Auth"); until then, LogMailer. */
export interface Mailer {
  send(message: MailMessage): Promise<void>
}

/**
 * Writes e-mails to the log instead of sending them. Outside production the whole message is logged
 * so links can be followed by hand; in production only the subject, because the body holds the
 * invitation or verification token and the address is personal data.
 */
export class LogMailer implements Mailer {
  constructor(
    private readonly log: FastifyBaseLogger,
    private readonly production: boolean,
  ) {}

  send(message: MailMessage): Promise<void> {
    if (this.production) {
      this.log.warn({ subject: message.subject }, "e-mail not sent: no e-mail provider configured")
    } else {
      this.log.info({ mail: message }, "e-mail (log transport)")
    }
    return Promise.resolve()
  }
}

/** Test transport: keeps every message in memory. */
export class MemoryMailer implements Mailer {
  readonly sent: MailMessage[] = []

  send(message: MailMessage): Promise<void> {
    this.sent.push(message)
    return Promise.resolve()
  }

  /** Last message sent to `to` (case-insensitive). */
  last(to: string): MailMessage | undefined {
    return this.sent.findLast((m) => m.to.toLowerCase() === to.toLowerCase())
  }
}

// User-facing text: Brazilian Portuguese. Final copy is a UX decision (FE-01.3).
export function invitationMail(input: {
  to: string
  officeName: string
  role: string
  url: string
}): MailMessage {
  const role = input.role === "owner" ? "proprietário" : "contador"
  return {
    to: input.to,
    subject: `Convite para o escritório ${input.officeName}`,
    text: [
      `Você foi convidado para o escritório ${input.officeName} como ${role}.`,
      `Para aceitar, acesse: ${input.url}`,
      "O convite vale por 48 horas e só pode ser usado uma vez.",
    ].join("\n\n"),
  }
}

export function verificationMail(input: { to: string; url: string }): MailMessage {
  return {
    to: input.to,
    subject: "Confirme seu e-mail",
    text: [
      "Para confirmar seu e-mail e ativar sua conta, acesse:",
      input.url,
      "Se você não criou uma conta, ignore esta mensagem.",
    ].join("\n\n"),
  }
}

export function resetPasswordMail(input: { to: string; url: string }): MailMessage {
  return {
    to: input.to,
    subject: "Redefinição de senha",
    text: [
      "Recebemos um pedido para redefinir a senha da sua conta. Para escolher uma nova senha, acesse:",
      input.url,
      "O link vale por 1 hora e só pode ser usado uma vez. Ao redefinir, as outras sessões abertas são encerradas.",
      "Se você não fez esse pedido, ignore esta mensagem: sua senha continua a mesma.",
    ].join("

"),
  }
}
