// Works out the SMTP settings from the environment. Kept free of imports so it
// can be unit tested without loading the app config.
//
// Brevo (transactional email) is used when BREVO_SMTP_LOGIN and BREVO_SMTP_KEY
// are both set. Otherwise the older Gmail-style EMAIL / APP_PASS setup is used,
// so nothing breaks before the Brevo credentials are in place.

export type TEmailProvider = 'brevo' | 'smtp'

export type TEmailConfig = {
  provider: TEmailProvider
  smtp_host: string
  smtp_port: number
  smtp_secure: boolean
  smtp_user: string
  smtp_pass: string
  // The address users see and reply to. Also used as the support address.
  email: string
  from_name: string
  // Ready-made `From` header: "Consultz" <info@consultz.com>
  from: string
  // Kept for older code that reads these names
  app_pass: string
  // Setup problems worth logging at startup. Never contains a secret.
  warnings: string[]
}

type TEnv = Record<string, string | undefined>

export const BREVO_SMTP_HOST = 'smtp-relay.brevo.com'
export const BREVO_SMTP_PORT = 587

const clean = (value: string | undefined) => {
  const trimmed = (value ?? '').trim()
  // Tolerate a value pasted with surrounding quotes
  const unquoted = trimmed.replace(/^(['"])(.*)\1$/, '$2').trim()
  return unquoted
}

const EMAIL_PATTERN = /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/

export const formatFrom = (name: string, address: string) => {
  const safeName = name.replace(/["\r\n]/g, '').trim()
  return safeName ? `"${safeName}" <${address}>` : address
}

// Pulls the address out of `Name <a@b.c>` or a bare `a@b.c`.
const addressFromHeader = (header: string) => {
  const match = header.match(/<([^<>]+)>/)
  return (match ? match[1] : header).trim()
}

export const resolveEmailConfig = (env: TEnv): TEmailConfig => {
  const warnings: string[] = []

  const brevoLogin = clean(env.BREVO_SMTP_LOGIN)
  const brevoKey = clean(env.BREVO_SMTP_KEY)
  const useBrevo = Boolean(brevoLogin && brevoKey)

  if (!useBrevo && (brevoLogin || brevoKey)) {
    warnings.push(
      'Brevo is half configured: set both BREVO_SMTP_LOGIN and BREVO_SMTP_KEY. Falling back to EMAIL / APP_PASS.',
    )
  }

  const legacyEmail = clean(env.EMAIL)
  const legacyFromHeader = clean(env.EMAIL_FROM)

  const provider: TEmailProvider = useBrevo ? 'brevo' : 'smtp'
  const defaultHost = useBrevo ? BREVO_SMTP_HOST : 'smtp.gmail.com'
  const defaultPort = useBrevo ? BREVO_SMTP_PORT : 465

  const smtp_host = clean(env.SMTP_HOST) || defaultHost
  const parsedPort = Number(clean(env.SMTP_PORT))
  const smtp_port =
    Number.isInteger(parsedPort) && parsedPort > 0 ? parsedPort : defaultPort
  // Port 465 uses implicit TLS; 587 and 2525 use STARTTLS (secure = false)
  const secureRaw = clean(env.SMTP_SECURE).toLowerCase()
  const smtp_secure = secureRaw ? secureRaw === 'true' : smtp_port === 465

  const smtp_user = useBrevo ? brevoLogin : clean(env.SMTP_USER) || legacyEmail
  const smtp_pass = useBrevo
    ? brevoKey
    : clean(env.SMTP_PASS) || clean(env.APP_PASS)

  const email =
    clean(env.EMAIL_FROM_ADDRESS) ||
    (legacyFromHeader ? addressFromHeader(legacyFromHeader) : '') ||
    legacyEmail
  const from_name = clean(env.EMAIL_FROM_NAME) || 'Consultz'

  // EMAIL_FROM (a full header) still wins when no separate address is given
  const from =
    !clean(env.EMAIL_FROM_ADDRESS) && legacyFromHeader
      ? legacyFromHeader
      : formatFrom(from_name, email)

  if (useBrevo) {
    // Brevo has two kinds of key. Only the SMTP key works for SMTP login.
    if (brevoKey.startsWith('xkeysib-')) {
      warnings.push(
        'BREVO_SMTP_KEY looks like a Brevo API key (xkeysib-…). Use the SMTP key (xsmtpsib-…) from Settings > SMTP & API > SMTP.',
      )
    }
    if (smtp_host !== BREVO_SMTP_HOST) {
      warnings.push(
        `Brevo credentials are set but SMTP_HOST is "${smtp_host}". Remove SMTP_HOST or set it to ${BREVO_SMTP_HOST}.`,
      )
    }
    if (email && email.toLowerCase() === brevoLogin.toLowerCase()) {
      warnings.push(
        'The From address is the Brevo SMTP login. Set EMAIL_FROM_ADDRESS to a verified sender (e.g. info@consultz.com).',
      )
    }
  }

  if (!smtp_user || !smtp_pass) {
    warnings.push(
      'SMTP credentials are missing. Set BREVO_SMTP_LOGIN and BREVO_SMTP_KEY.',
    )
  }
  if (!email) {
    warnings.push('No From address. Set EMAIL_FROM_ADDRESS.')
  } else if (!EMAIL_PATTERN.test(email)) {
    warnings.push(`The From address "${email}" is not a valid email address.`)
  }

  return {
    provider,
    smtp_host,
    smtp_port,
    smtp_secure,
    smtp_user,
    smtp_pass,
    email,
    from_name,
    from,
    app_pass: smtp_pass,
    warnings,
  }
}
