import "server-only";

const BANK_TIME_ZONE = "Asia/Jerusalem";

const zonedFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: BANK_TIME_ZONE,
  hourCycle: "h23",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

interface ZonedParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

function zonedParts(instant: Date): ZonedParts {
  const parts = zonedFormatter.formatToParts(instant);
  const values: Record<string, number> = {};
  for (const part of parts) {
    if (part.type !== "literal") values[part.type] = Number(part.value);
  }
  return {
    year: values.year,
    month: values.month,
    day: values.day,
    hour: values.hour,
    minute: values.minute,
    second: values.second,
  };
}

function zoneOffsetMs(instant: Date): number {
  const { year, month, day, hour, minute, second } = zonedParts(instant);
  const asUtc = Date.UTC(year, month - 1, day, hour, minute, second);
  return asUtc - instant.getTime();
}

export function toBankDayStartUtc(isoDate: string): string {
  const instant = new Date(isoDate);
  if (Number.isNaN(instant.getTime())) return isoDate;
  const { year, month, day } = zonedParts(instant);
  const localMidnightAsUtc = Date.UTC(year, month - 1, day);
  const offset = zoneOffsetMs(new Date(localMidnightAsUtc));
  return new Date(localMidnightAsUtc - offset).toISOString();
}
