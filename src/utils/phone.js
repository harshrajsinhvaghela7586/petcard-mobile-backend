import { COUNTRIES, COUNTRY_BY_ISO, DEFAULT_COUNTRY, DIAL_PREFIXES } from "../config/countries.js";

/*
 * Mobile numbers are stored as:
 *   country          ISO code ("IN")
 *   phoneCountryCode dial code ("+91")
 *   phoneNational    digits only, no trunk zero ("9876543210")
 *   phone            E.164 ("+919876543210")  (old clients + search)
 * Allowed length depends on the country (India: exactly 10 digits, UAE: 9 ...).
 */
const ALLOWED_CHARS = /^\+?[0-9 ()-]{4,25}$/;

const countryFromDial = (dial, preferIso) => {
  const matches = COUNTRIES.filter((c) => c.dial === dial);
  return matches.find((c) => c.iso === preferIso) ?? matches[0] ?? null;
};

const lengthMessage = (country) =>
  country.min === country.max
    ? `Enter a ${country.min}-digit ${country.name} mobile number.`
    : `Enter a ${country.min}-${country.max} digit ${country.name} mobile number.`;

export function parsePhone({ phone, country, dialCode, fallbackCountry } = {}) {
  if (phone === undefined || phone === null || (typeof phone === "string" && phone.trim() === "")) {
    return { ok: true, empty: true };
  }
  if (typeof phone !== "string" || phone.length > 40) return { ok: false, message: "Enter a valid phone number." };

  const text = phone.trim();
  if (!ALLOWED_CHARS.test(text)) return { ok: false, message: "Enter a valid phone number." };

  let digits = text.replace(/\D/g, "");
  const hasPlus = text.startsWith("+");
  const hasIdd = !hasPlus && text.replace(/[ ()-]/g, "").startsWith("00");

  let chosen = null;
  if (typeof country === "string" && country.trim()) {
    chosen = COUNTRY_BY_ISO.get(country.trim().toUpperCase()) ?? null;
    if (!chosen) return { ok: false, message: "Unknown country." };
  } else if (typeof dialCode === "string" && dialCode.trim()) {
    const dial = dialCode.trim().startsWith("+") ? dialCode.trim() : `+${dialCode.trim()}`;
    chosen = countryFromDial(dial, fallbackCountry);
    if (!chosen) return { ok: false, message: "Unknown country code." };
  }

  if (hasPlus || hasIdd) {
    const international = hasIdd ? digits.slice(2) : digits;
    const prefix = DIAL_PREFIXES.find((p) => international.startsWith(p.slice(1)));
    if (!prefix) return { ok: false, message: "Unknown country code." };
    if (chosen && chosen.dial !== prefix) {
      return { ok: false, message: `This number does not belong to ${chosen.name} (${chosen.dial}).` };
    }
    chosen ??= countryFromDial(prefix, fallbackCountry);
    digits = international.slice(prefix.length - 1);
  } else {
    chosen ??= COUNTRY_BY_ISO.get(fallbackCountry) ?? COUNTRY_BY_ISO.get(DEFAULT_COUNTRY);
    const dialDigits = chosen.dial.slice(1);
    if (digits.length > chosen.max && digits.startsWith(dialDigits) && digits.length - dialDigits.length >= chosen.min) {
      digits = digits.slice(dialDigits.length);
    }
  }

  if (digits.length > chosen.max && digits.startsWith("0")) digits = digits.slice(1);

  if (digits.length < chosen.min || digits.length > chosen.max) return { ok: false, message: lengthMessage(chosen) };
  if (chosen.pattern && !chosen.pattern.test(digits)) return { ok: false, message: `Enter a valid ${chosen.name} mobile number.` };

  return { ok: true, empty: false, country: chosen.iso, dialCode: chosen.dial, national: digits, e164: `${chosen.dial}${digits}` };
}

/** Fields to $set on a MobileUser for a parsed number. */
export const phoneFields = (parsed) =>
  parsed.empty
    ? { phone: "", phoneCountryCode: "", phoneNational: "" }
    : { phone: parsed.e164, phoneCountryCode: parsed.dialCode, phoneNational: parsed.national, country: parsed.country };

/** Shape the app/admin receive for a stored user. Works for legacy rows too. */
export function phoneView(user) {
  const phone = user?.phone || "";
  if (user?.phoneCountryCode && user?.phoneNational) {
    return { phone, phoneCountryCode: user.phoneCountryCode, phoneNational: user.phoneNational };
  }
  if (!phone) return { phone: "", phoneCountryCode: "", phoneNational: "" };
  const parsed = parsePhone({ phone, fallbackCountry: user?.country });
  return parsed.ok && !parsed.empty
    ? { phone, phoneCountryCode: parsed.dialCode, phoneNational: parsed.national }
    : { phone, phoneCountryCode: "", phoneNational: phone.replace(/\D/g, "") };
}
