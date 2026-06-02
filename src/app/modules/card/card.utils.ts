export const getCardStatus = (expiryDate: string) => {
  const [month, year] = expiryDate.split('/').map(Number)

  if (!month || !year) return 'expired'

  const expiry = new Date(2000 + year, month)
  const now = new Date()

  return expiry <= now ? 'expired' : 'active'
}
