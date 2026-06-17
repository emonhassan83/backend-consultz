// src/app/utils/formatDuration.ts
export const formatDuration = (minutes: number): string => {
  if (!minutes || minutes <= 0) return '0 min';

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = Math.floor(minutes % 60);

  if (hours > 0) {
    if (remainingMinutes > 0) {
      return `${hours}h ${remainingMinutes} min`;
    }
    return `${hours}h`;
  }

  return `${remainingMinutes} min`;
};