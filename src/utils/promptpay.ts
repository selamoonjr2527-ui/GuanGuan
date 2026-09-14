/**
 * PromptPay EMVCo QR Code Payload Generator
 * Conforms to Bank of Thailand PromptPay QR specification
 */

function crc16(data: string): string {
  let crc = 0xffff;
  for (let i = 0; i < data.length; i++) {
    const byte = data.charCodeAt(i);
    crc ^= byte << 8;
    for (let j = 0; j < 8; j++) {
      if ((crc & 0x8000) !== 0) {
        crc = ((crc << 1) ^ 0x1021) & 0xffff;
      } else {
        crc = (crc << 1) & 0xffff;
      }
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

function formatTag(tag: string, value: string): string {
  const len = value.length.toString().padStart(2, '0');
  return `${tag}${len}${value}`;
}

export function generatePromptPayPayload(target: string, amount?: number): string {
  // Sanitize target (strip dashes, spaces)
  const cleaned = target.replace(/[^0-9]/g, '');

  let merchantSubTag = '';
  if (cleaned.length === 10 && cleaned.startsWith('0')) {
    // Thai Mobile phone: 08x-xxx-xxxx -> 00668xxxxxxxx
    const formattedPhone = `0066${cleaned.slice(1)}`;
    merchantSubTag = formatTag('01', formattedPhone);
  } else if (cleaned.length === 13) {
    // Citizen ID or Tax ID
    merchantSubTag = formatTag('02', cleaned);
  } else if (cleaned.length === 15) {
    // E-Wallet ID
    merchantSubTag = formatTag('03', cleaned);
  } else {
    // Fallback: treat as mobile phone if formatted
    const formatted = cleaned.startsWith('0') ? `0066${cleaned.slice(1)}` : cleaned;
    merchantSubTag = formatTag('01', formatted);
  }

  const aid = formatTag('00', 'A000000677010111');
  const merchantInfo = formatTag('29', aid + merchantSubTag);

  // 00: Format Indicator '01'
  // 01: Initiation Method '12' (dynamic with amount) or '11' (static)
  const formatIndicator = formatTag('00', '01');
  const pointOfInitiation = formatTag('01', amount && amount > 0 ? '12' : '11');
  const countryCode = formatTag('58', 'TH');
  const currencyCode = formatTag('53', '764'); // THB

  let payloadWithoutCrc = formatIndicator + pointOfInitiation + merchantInfo + countryCode + currencyCode;

  if (amount !== undefined && amount > 0) {
    const formattedAmount = amount.toFixed(2);
    payloadWithoutCrc += formatTag('54', formattedAmount);
  }

  // Tag 63 is CRC
  const payloadToHash = payloadWithoutCrc + '6304';
  const checksum = crc16(payloadToHash);

  return payloadToHash + checksum;
}

export function formatPromptPayDisplay(target: string): string {
  const digits = target.replace(/[^0-9]/g, '');
  if (digits.length === 10) {
    // 08x-xxx-xxxx
    return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  if (digits.length === 13) {
    // x-xxxx-xxxxx-xx-x
    return `${digits.slice(0, 1)}-${digits.slice(1, 5)}-${digits.slice(5, 10)}-${digits.slice(10, 12)}-${digits.slice(12)}`;
  }
  return target;
}
