import emailSender from "../../utils/emailSender"

export const sendWaitlistInviteEmail = async (email: string, name: string) => {
  const subject = '🎉 Your SaveKey Spot is Now Available!'
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 10px;">
      <h2>Hello ${name},</h2>
      <p>Good news! A spot has opened up and you can now join as a member of SaveKey.</p>
      <p>Click the button below to complete your registration and start enjoying exclusive local deals:</p>
      <a href="https://yourapp.com/join" style="display:inline-block;padding:10px 20px;background:#007BFF;color:#fff;border-radius:5px;text-decoration:none;">Activate Your Spot</a>
      <p>Hurry, spots are limited!</p>
      <p>— The SaveKey Team</p>
    </div>
  `
  await emailSender(email, subject, html)
}
