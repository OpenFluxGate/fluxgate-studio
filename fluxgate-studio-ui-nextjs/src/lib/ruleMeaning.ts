import { type Locale, translate } from './i18n';

interface BandLike {
  windowSeconds: number;
  capacity: number;
}

export function formatPeriod(seconds: number, locale: Locale): string {
  if (Number.isInteger(seconds)) {
    if (seconds >= 3600 && seconds % 3600 === 0) {
      return translate(locale, 'unit.hour', { n: seconds / 3600 });
    }
    if (seconds >= 60 && seconds % 60 === 0) {
      return translate(locale, 'unit.minute', { n: seconds / 60 });
    }
    return translate(locale, 'unit.second', { n: seconds });
  }
  return translate(locale, 'meaning.about', {
    value: translate(locale, 'unit.second', { n: seconds.toFixed(1) }),
  });
}

export function describeBand(band: BandLike, locale: Locale): string {
  if (!(band.capacity > 0) || !(band.windowSeconds > 0)) {
    return '';
  }
  return translate(locale, 'meaning.burst', {
    capacity: band.capacity,
    period: formatPeriod(band.windowSeconds / band.capacity, locale),
  });
}

export function formatLimit(band: BandLike): string {
  return `${band.windowSeconds}s·${band.capacity}`;
}
