import { isCountrySupported } from "./vatValidation";
import AppError from "../errors/AppError";
import httpStatus from "http-status";
import config from "../config";

// Global Standard VAT/GST Rates for Supported Countries (Fallback)
const LOCAL_FALLBACK_RATES: Record<string, number> = {
  // EU Countries (Standard VAT Rates)
  'AT': 20, 'BE': 21, 'BG': 20, 'CY': 19, 'CZ': 21, 'DE': 19, 
  'DK': 25, 'EE': 22, 'EL': 24, 'ES': 21, 'FI': 24, 'FR': 20, 
  'HR': 25, 'HU': 27, 'IE': 23, 'IT': 22, 'LT': 21, 'LU': 17, 
  'LV': 21, 'MT': 18, 'NL': 21, 'PL': 23, 'PT': 23, 'RO': 19, 
  'SE': 25, 'SI': 22, 'SK': 20,

  // UK
  'GB': 20,

  // North America
  'US': 0,  // US uses state-wise sales tax, federal VAT is 0%
  'CA': 5,  // GST

  // Asia Pacific
  'AU': 10, // GST
  'NZ': 15, // GST
  'SG': 9,  // GST
  'JP': 10, // Consumption Tax
  'KR': 10,
  'IN': 18, // GST average
  'CN': 13,
  'HK': 0,  // No VAT
  'MY': 6,  // SST
  'TH': 7,

  // Middle East
  'AE': 5,
  'SA': 15,
  'IL': 17,
  'TR': 20,

  // South America
  'BR': 17, // Average ICMS
  'AR': 21,
  'CL': 19,
  'CO': 19,

  // Africa
  'ZA': 15,
  'EG': 14,
  'NG': 7.5,

  // Other European Countries
  'CH': 8.1,
  'NO': 25,
  'IS': 24,
  'LI': 8.1,
  'MC': 20
};

export const getVatRateForCountry = async (countryCode: string): Promise<number> => {
  const country = countryCode.toUpperCase();

  if (!isCountrySupported(country)) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      `VAT rate not supported for country: ${country}`
    );
  }

  const apiKey = config.apifreaks_key;

  if (apiKey) {
    try {
      const response = await fetch(`https://api.apifreaks.com/v1/vat/rates?country=${country}`, {
        method: 'GET',
        headers: {
          'X-apiKey': apiKey,
          'Accept': 'application/json',
        },
      });

      if (response.ok) {
        const data = await response.json();
        const standardRate = data?.standard_rate;

        if (standardRate !== undefined && standardRate !== null) {
          return Number(standardRate);
        }
      } else {
        console.warn(`APIFreaks returned status ${response.status}. Falling back to local VAT mapping.`);
      }
    } catch (error) {
      console.error('Failed to fetch VAT rates from APIFreaks, using local fallback:', error);
    }
  } else {
    console.warn('APIFreaks API key is missing. Using local fallback.');
  }

  // Fallback to static local mapping
  const rate = LOCAL_FALLBACK_RATES[country];
  if (rate !== undefined) {
    return rate;
  }

  // Default fallback if country is unknown/unmapped in fallback list
  return 0;
};