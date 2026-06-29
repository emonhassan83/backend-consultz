import { isCountrySupported } from "./vatValidation";


export const getVatRateForCountry = async (countryCode: string): Promise<number | null> => {
  try {
    const country = countryCode.toUpperCase();

    if (!isCountrySupported(country)) {
      console.warn(`VAT rate not supported for country: ${country}`);
      return null;
    }

    // jsonvat.com থেকে live rate fetch
    const response = await fetch('https://jsonvat.com/vat-rates.json', {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Consultz/1.0',
      },
    });

    if (!response.ok) {
      console.warn(`jsonvat.com returned status ${response.status}`);
      return null;
    }

    const data = await response.json();
    const countryData = data?.rates?.find((r: any) => r.code === country);

    if (!countryData?.standard_rate) {
      console.warn(`No VAT rate found for country: ${country}`);
      return null;
    }

    return countryData.standard_rate;
  } catch (error) {
    console.error('Failed to fetch VAT rates from jsonvat.com:', error);
    return null;
  }
};