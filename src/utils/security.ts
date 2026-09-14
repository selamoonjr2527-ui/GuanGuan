import { Player } from '../types';

/**
 * Returns the expected 4-digit verification code for a player.
 * Priority:
 * 1. Custom 4-digit PIN (`player.pin`)
 * 2. Last 4 digits of phone number (`player.phone`)
 * Returns null if neither is available.
 */
export function getPlayerVerificationCode(player: Player): string | null {
  if (player.pin && player.pin.trim().length === 4) {
    return player.pin.trim();
  }
  if (player.phone) {
    const digits = player.phone.replace(/\D/g, '');
    if (digits.length >= 4) {
      return digits.slice(-4);
    }
  }
  return null;
}

/**
 * Validates entered code against:
 * 1. Player's verification code
 * 2. Master Organizer PIN (allows organizer to bypass if member forgot their code)
 */
export function verifyPlayerCode(
  player: Player,
  enteredCode: string,
  organizerPin: string = '1234'
): { isValid: boolean; reason?: string } {
  const cleanEntered = enteredCode.trim();
  const expected = getPlayerVerificationCode(player);

  // If entered matches organizer master PIN, always allow
  if (organizerPin && cleanEntered === organizerPin.trim()) {
    return { isValid: true, reason: 'organizer_override' };
  }

  // If player has an expected code
  if (expected) {
    if (cleanEntered === expected) {
      return { isValid: true };
    }
    return {
      isValid: false,
      reason: `รหัส 4 หลักไม่ถูกต้อง (ระบบตรวจสอบกับ 4 ตัวท้ายเบอร์โทร หรือ PIN)`,
    };
  }

  // Player has no code set - anything non-empty or empty handled by caller
  return { isValid: true, reason: 'no_code_set' };
}

/**
 * Returns human-readable hint for the verification code
 */
export function getMaskedCodeHint(player: Player): string {
  if (player.pin && player.pin.trim().length === 4) {
    return `PIN ส่วนตัว 4 หลักที่ตั้งไว้`;
  }
  if (player.phone) {
    const digits = player.phone.replace(/\D/g, '');
    if (digits.length >= 4) {
      return `เลข 4 ตัวท้ายของเบอร์โทร (••••${digits.slice(-4)})`;
    }
  }
  return 'ยังไม่ได้ตั้งรหัส (สามารถยืนยันตัวตนได้ทันที)';
}
