// Sends one real email through the configured SMTP (Brevo), to check the setup.
//   npm run email:test -- you@example.com
import config from '../config'
import emailSender, { verifyEmailTransport } from '../utils/emailSender'

const main = async () => {
  const to = (process.argv[2] || '').trim()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
    console.error('Usage: npm run email:test -- you@example.com')
    process.exit(1)
  }

  const { provider, smtp_host, smtp_port, smtp_secure, from } =
    config.emailSender
  console.log(
    `Provider: ${provider} | ${smtp_host}:${smtp_port} (secure=${smtp_secure}) | From: ${from}`,
  )

  // Prints any config warnings, then checks the login
  const ready = await verifyEmailTransport()
  if (!ready) {
    console.error('SMTP login failed. Nothing was sent.')
    process.exit(1)
  }

  await emailSender(
    to,
    'Consultz email test',
    `<p>This is a test email from the Consultz backend.</p>
     <p>Provider: <b>${provider}</b> (${smtp_host}:${smtp_port})</p>
     <p>Sent at ${new Date().toISOString()}</p>`,
  )
  console.log(`Sent to ${to}. Check the inbox (and spam).`)
}

main().catch((error) => {
  console.error(error?.message || error)
  process.exit(1)
})
