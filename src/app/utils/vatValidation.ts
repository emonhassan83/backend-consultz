import config from "../config";

// Supported countries for VAT validation
const SUPPORTED_COUNTRIES = [
  // EU Countries (VIES validation)
  'AT', 'BE', 'BG', 'CY', 'CZ', 'DE', 'DK', 'EE', 'EL', 'ES',
  'FI', 'FR', 'HR', 'HU', 'IE', 'IT', 'LT', 'LU', 'LV', 'MT',
  'NL', 'PL', 'PT', 'RO', 'SE', 'SI', 'SK',

  // UK (HMRC validation)
  'GB',

  // North America
  'US', 'CA',

  // Asia Pacific
  'AU', 'NZ', 'SG', 'JP', 'KR', 'IN', 'CN', 'HK', 'MY', 'TH',

  // Middle East
  'AE', 'SA', 'IL', 'TR',

  // South America
  'BR', 'AR', 'CL', 'CO',

  // Africa
  'ZA', 'EG', 'NG',

  // Other
  'CH', 'NO', 'IS', 'LI', 'MC'
]

// Basic structure validation for countries without official API
const basicRegexCheck = (countryCode: string, vatNumber: string): boolean => {
  const patterns: Record<string, RegExp> = {
    // EU Countries
    'AT': /^ATU\d{8}$/,
    'BE': /^BE0\d{9}$/,
    'BG': /^BG\d{9,10}$/,
    'CY': /^CY\d{8}[A-Z]$/,
    'CZ': /^CZ\d{8,10}$/,
    'DE': /^DE\d{9}$/,
    'DK': /^DK\d{8}$/,
    'EE': /^EE\d{9}$/,
    'EL': /^EL\d{9}$/,
    'ES': /^ES[A-Z0-9]\d{7}[A-Z0-9]$/,
    'FI': /^FI\d{8}$/,
    'FR': /^FR[A-Z0-9]{2}\d{9}$/,
    'GB': /^GB(\d{9}|\d{12}|GD\d{3}|HA\d{3})$/,
    'HR': /^HR\d{11}$/,
    'HU': /^HU\d{8}$/,
    'IE': /^IE\d{7}[A-Z]{1,2}$/,
    'IT': /^IT\d{11}$/,
    'LT': /^LT(\d{9}|\d{12})$/,
    'LU': /^LU\d{8}$/,
    'LV': /^LV\d{11}$/,
    'MT': /^MT\d{8}$/,
    'NL': /^NL\d{9}B\d{2}$/,
    'PL': /^PL\d{10}$/,
    'PT': /^PT\d{9}$/,
    'RO': /^RO\d{2,10}$/,
    'SE': /^SE\d{10}\d{2}$/,
    'SI': /^SI\d{8}$/,
    'SK': /^SK\d{10}$/,

    // North America
    'US': /^\d{2}-?\d{7}$/, // EIN format (simplified)
    'CA': /^\d{9}RT\d{4}$/, // Business Number format

    // Asia Pacific
    'AU': /^\d{11}$/, // ABN
    'NZ': /^\d{8,9}$/, // NZBN
    'SG': /^[A-Z]{2,3}\d{4}$/, // UEN format (simplified)
    'JP': /^[A-Z0-9]{10,13}$/, // Corporate number
    'KR': /^\d{10}$/, // Business registration number
    'IN': /^[A-Z]{5}\d{4}[A-Z]{1}$/, // GSTIN
    'CN': /^[A-Z0-9]{15,20}$/, // Unified Social Credit Code
    'HK': /^\d{8}$/, // Business Registration Number
    'MY': /^[A-Z0-9]{12}$/, // Tax Identification Number
    'TH': /^\d{13}$/, // Taxpayer Identification Number

    // Middle East
    'AE': /^\d{15}$/, // Trade License Number
    'SA': /^\d{15}$/, // Commercial Registration
    'IL': /^\d{9}$/, // VAT Number
    'TR': /^\d{10}$/, // Vergi No

    // South America
    'BR': /^\d{14}$/, // CNPJ
    'AR': /^\d{11}$/, // CUIT
    'CL': /^\d{9,10}$/, // RUT
    'CO': /^\d{9,10}$/, // NIT

    // Africa
    'ZA': /^\d{10}$/, // VAT Number
    'EG': /^\d{9}$/, // Tax Identification Number
    'NG': /^\d{10,14}$/, // TIN

    // Other
    'CH': /^[A-Z]{3}-\d{3}\.[A-Z]{3}$/, // VAT ID
    'NO': /^\d{9}MVA$/, // Orgnr
    'IS': /^\d{6}$/, //Kennitala (companies)
    'LI': /^\d{6}$/, // VAT ID
    'MC': /^[A-Z]{1,2}\d{6}$/, // NIF
  }

  const pattern = patterns[countryCode]
  return pattern ? pattern.test(vatNumber) : false
}

/**
 * Validate UK VAT number using HMRC API
 */
const validateUkVat = async (vatNumber: string): Promise<{ valid: boolean; name: string; address: string }> => {
  try {
    // Clean VAT number - remove GB prefix if present
    const cleanVat = vatNumber.replace(/^GB/i, '')

    const response = await fetch(
      `https://api.service.hmrc.gov.uk/organisations/vat/check-vat-number/lookup/${cleanVat}`,
      {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'Consultz/1.0',
        },
      },
    )

    if (!response.ok) {
      console.warn(`HMRC API returned status ${response.status} for VAT: ${vatNumber}`)
      return { valid: false, name: '', address: '' }
    }

    const data = await response.json()

    return {
      valid: data?.target?.vatNumber === cleanVat,
      name: data?.target?.organisationName || '',
      address: data?.target?.address?.line1 || '',
    }
  } catch (error) {
    console.error('HMRC API error:', error)
    // Fallback to regex validation
    return { valid: basicRegexCheck('GB', vatNumber), name: '', address: '' }
  }
}

/**
 * Validate EU VAT number using VIES API
 */
const validateEuVat = async (
  countryCode: string,
  vatNumber: string,
): Promise<{ valid: boolean; name: string; address: string }> => {
  try {
    // Clean VAT number - remove country prefix if present
    const cleanVat = vatNumber.replace(new RegExp(`^${countryCode}`, 'i'), '')

    const response = await fetch(
      `https://ec.europa.eu/taxation_customs/vies/rest-api/checkVat`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify({
          countryCode,
          vatNumber: cleanVat,
        }),
      },
    )

    if (!response.ok) {
      console.warn(`VIES API returned status ${response.status} for ${countryCode}: ${vatNumber}`)
      return { valid: false, name: '', address: '' }
    }

    const data = await response.json()

    return {
      valid: data?.valid === true,
      name: data?.name || '',
      address: data?.address || '',
    }
  } catch (error) {
    console.error('VIES API error:', error)
    // Fallback to regex validation
    return { valid: basicRegexCheck(countryCode, vatNumber), name: '', address: '' }
  }
}

/**
 * Main VAT validation function
 * Uses VIES for EU countries, HMRC for UK, regex fallback for others
 */
export const validateVatNumber = async (
  countryCode: string,
  vatNumber: string,
): Promise<{
  valid: boolean
  name: string
  address: string
}> => {
  const country = countryCode.toUpperCase()

  // Remove any spaces and dashes from VAT number
  const cleanVatNumber = vatNumber.replace(/[\s-]/g, '')

  if (!cleanVatNumber) {
    return { valid: false, name: '', address: '' }
  }

  // ── APIFreaks Validation (if key is configured and country is EU or UK) ───
  const apiKey = config.apifreaks_key;
  const isEuOrUk = ['AT', 'BE', 'BG', 'CY', 'CZ', 'DE', 'DK', 'EE', 'EL', 'ES', 'FI', 'FR', 'HR', 'HU', 'IE', 'IT', 'LT', 'LU', 'LV', 'MT', 'NL', 'PL', 'PT', 'RO', 'SE', 'SI', 'SK', 'GB'].includes(country);
  
  if (apiKey && isEuOrUk) {
    try {
      // Ensure the VAT number starts with the country code for APIFreaks (if not already present)
      let prefixedVat = cleanVatNumber;
      if (!cleanVatNumber.startsWith(country)) {
        prefixedVat = `${country}${cleanVatNumber}`;
      }

      const response = await fetch(`https://api.apifreaks.com/v1.0/vat/validation?vatNumber=${prefixedVat}`, {
        method: 'GET',
        headers: {
          'X-apiKey': apiKey,
          'Accept': 'application/json',
        },
      });

      if (response.ok) {
        const data = await response.json();
        return {
          valid: data?.validation?.is_valid === true,
          name: data?.company?.company_name || '',
          address: data?.company?.company_address || '',
        };
      } else {
        console.warn(`APIFreaks validation returned status ${response.status}. Falling back to local/VIES/HMRC check.`);
      }
    } catch (error) {
      console.error('Failed to validate VAT via APIFreaks, falling back to local checks:', error);
    }
  }

  // ── Existing Fallback Logic ────────────────────────────────────────────────
  // EU countries - use VIES API
  if (['AT', 'BE', 'BG', 'CY', 'CZ', 'DE', 'DK', 'EE', 'EL', 'ES', 'FI', 'FR', 'HR', 'HU', 'IE', 'IT', 'LT', 'LU', 'LV', 'MT', 'NL', 'PL', 'PT', 'RO', 'SE', 'SI', 'SK'].includes(country)) {
    return validateEuVat(country, cleanVatNumber)
  }

  // UK - use HMRC API
  if (country === 'GB') {
    return validateUkVat(cleanVatNumber)
  }

  // Specific regex checks for defined countries
  if (basicRegexCheck(country, cleanVatNumber)) {
    return { valid: true, name: '', address: '' }
  }

  // Check if country has a specific regex check but failed it
  const definedCountries = ['US', 'CA', 'AU', 'NZ', 'SG', 'JP', 'KR', 'IN', 'CN', 'HK', 'MY', 'TH', 'AE', 'SA', 'IL', 'TR', 'BR', 'AR', 'CL', 'CO', 'ZA', 'EG', 'NG', 'CH', 'NO', 'IS', 'LI', 'MC']
  if (definedCountries.includes(country)) {
    return { valid: false, name: '', address: '' }
  }

  // General fallback validation for any other country (alphanumeric, 4-20 characters)
  const isAlphanumeric = /^[A-Z0-9]{4,20}$/i.test(cleanVatNumber)
  return { valid: isAlphanumeric, name: '', address: '' }
}

/**
 * Get supported countries list (returns a wildcard indicator since all 2-letter codes are accepted now)
 */
export const getSupportedCountries = (): string[] => {
  return [...SUPPORTED_COUNTRIES]
}

/**
 * Check if a country supports VAT validation (allows any 2-letter country code)
 */
export const isCountrySupported = (countryCode: string): boolean => {
  return /^[A-Z]{2}$/.test(countryCode.toUpperCase())
}