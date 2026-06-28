/**
 * Get VAT rate for a specific country using jsonvat.com
 * No caching — fetches live rates each time
 */
export const getVatRateForCountry = async (countryCode: string): Promise<number | null> => {
  try {
    const response = await fetch('https://jsonvat.com/vat-rates.json', {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Consultz/1.0',
      },
    })

    if (!response.ok) {
      console.warn(`jsonvat.com returned status ${response.status}`)
      return null
    }

    const data = await response.json()
    const country = data?.rates?.find(
      (r: any) => r.code === countryCode.toUpperCase(),
    )

    if (!country?.standard_rate) {
      console.warn(`No VAT rate found for country: ${countryCode}`)
      return null
    }

    return country.standard_rate
  } catch (error) {
    console.error('Failed to fetch VAT rates from jsonvat.com:', error)
    return null
  }
}