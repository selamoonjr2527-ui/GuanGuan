import { SessionConfig, SessionCourt } from '../types';

/**
 * DYNAMIC_SESSION_COURTS_V63A
 *
 * sessionCourts is the source of truth once configured.
 * Old sessions remain compatible by falling back to:
 * courtNames + startTime/endTime + courtHourlyRate.
 *
 * Internal court IDs intentionally stay sequential (court-1, court-2, ...)
 * because the existing match engine uses those IDs.
 * The real venue court number belongs in `name`, e.g. "Court 2", "Court 4".
 */

const safeText = (value: unknown, fallback: string): string => {
  const text = String(value ?? '').trim();
  return text || fallback;
};

const safeMoney = (value: unknown, fallback = 0): number => {
  const num = Number(value);
  return Number.isFinite(num) && num >= 0 ? num : fallback;
};

export const timeToMinutes = (value?: string): number | null => {
  if (!value || !/^\d{1,2}:\d{2}$/.test(value)) return null;
  const [h, m] = value.split(':').map(Number);
  if (
    !Number.isFinite(h) ||
    !Number.isFinite(m) ||
    h < 0 ||
    h > 23 ||
    m < 0 ||
    m > 59
  ) {
    return null;
  }
  return h * 60 + m;
};

export const calculateCourtHours = (
  startTime?: string,
  endTime?: string
): number => {
  const start = timeToMinutes(startTime);
  const end = timeToMinutes(endTime);

  if (start === null || end === null) return 0;

  let minutes = end - start;
  if (minutes < 0) minutes += 24 * 60;

  return Math.max(0, minutes / 60);
};

export const normalizeSessionCourts = (
  courts: SessionCourt[],
  config?: SessionConfig
): SessionCourt[] => {
  const fallbackStart = config?.startTime || '19:00';
  const fallbackEnd = config?.endTime || '22:00';
  const fallbackRate = Number(config?.courtHourlyRate || 0);

  return (Array.isArray(courts) ? courts : []).map((court, index) => ({
    id: `court-${index + 1}`,
    name: safeText(court?.name, `Court ${index + 1}`),
    startTime: safeText(court?.startTime, fallbackStart),
    endTime: safeText(court?.endTime, fallbackEnd),
    hourlyRate: safeMoney(court?.hourlyRate, fallbackRate),
    active: court?.active !== false,
  }));
};

export const getSessionCourts = (
  config: SessionConfig
): SessionCourt[] => {
  const dynamic = Array.isArray(config.sessionCourts)
    ? config.sessionCourts.filter((court) => court?.active !== false)
    : [];

  if (dynamic.length > 0) {
    return normalizeSessionCourts(dynamic, config);
  }

  const names =
    Array.isArray(config.courtNames) && config.courtNames.length > 0
      ? config.courtNames
      : Array.from(
          { length: Math.max(1, Number(config.courtCount || 1)) },
          (_, i) => `Court ${i + 1}`
        );

  return normalizeSessionCourts(
    names.map((name, index) => ({
      id: `court-${index + 1}`,
      name,
      startTime: config.startTime || '19:00',
      endTime: config.endTime || '22:00',
      hourlyRate: Number(config.courtHourlyRate || 0),
      active: true,
    })),
    config
  );
};

export const getSessionCourtCost = (
  config: SessionConfig
): number => {
  return getSessionCourts(config).reduce((sum, court) => {
    const hours = calculateCourtHours(court.startTime, court.endTime);
    return sum + hours * Number(court.hourlyRate || 0);
  }, 0);
};

export const getSessionCourtCostBreakdown = (
  config: SessionConfig
) => {
  return getSessionCourts(config).map((court) => {
    const hours = calculateCourtHours(court.startTime, court.endTime);
    const cost = hours * Number(court.hourlyRate || 0);

    return {
      ...court,
      hours,
      cost,
    };
  });
};

export const withSessionCourts = (
  config: SessionConfig,
  courts: SessionCourt[]
): SessionConfig => {
  const normalized = normalizeSessionCourts(courts, config);

  return {
    ...config,
    sessionCourts: normalized,
    // Keep legacy fields synchronized so existing Queue/Courts UI
    // automatically displays the REAL venue court names.
    courtCount: normalized.length,
    courtNames: normalized.map((court) => court.name),
  };
};
