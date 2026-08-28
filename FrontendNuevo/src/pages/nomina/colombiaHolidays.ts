export type ColombiaCalendarDay = {
  isSaturday: boolean;
  isSunday: boolean;
  holidayName: string | null;
  className: string;
  tooltip: string;
};

type Holiday = { month: number; day: number; name: string; mondayize?: boolean };

const FIXED_HOLIDAYS: Holiday[] = [
  { month: 1, day: 1, name: "Año Nuevo" },
  { month: 1, day: 6, name: "Día de los Reyes Magos", mondayize: true },
  { month: 3, day: 19, name: "Día de San José", mondayize: true },
  { month: 5, day: 1, name: "Día del Trabajo" },
  { month: 7, day: 20, name: "Independencia de Colombia" },
  { month: 6, day: 29, name: "San Pedro y San Pablo", mondayize: true },
  { month: 8, day: 7, name: "Batalla de Boyacá" },
  { month: 8, day: 15, name: "Asunción de la Virgen", mondayize: true },
  { month: 10, day: 12, name: "Día de la Raza", mondayize: true },
  { month: 11, day: 1, name: "Todos los Santos", mondayize: true },
  { month: 11, day: 11, name: "Independencia de Cartagena", mondayize: true },
  { month: 12, day: 8, name: "Inmaculada Concepción" },
  { month: 12, day: 25, name: "Navidad" },
];

const toUtcDate = (year: number, month: number, day: number) => new Date(Date.UTC(year, month - 1, day));
const dateKey = (date: Date) => date.toISOString().slice(0, 10);
const addDays = (date: Date, days: number) => new Date(date.getTime() + days * 86400000);

// Meeus/Jones/Butcher, sufficient for Gregorian years used by Empiria.
const easterSunday = (year: number) => {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return toUtcDate(year, month, day);
};

const holidayEntries = (year: number): Map<string, string> => {
  const entries = new Map<string, string>();
  for (const holiday of FIXED_HOLIDAYS) {
    const date = toUtcDate(year, holiday.month, holiday.day);
    const observed = holiday.mondayize && date.getUTCDay() !== 1
      ? addDays(date, (8 - date.getUTCDay()) % 7)
      : date;
    entries.set(dateKey(observed), holiday.name);
  }

  const easter = easterSunday(year);
  entries.set(dateKey(addDays(easter, -3)), "Jueves Santo");
  entries.set(dateKey(addDays(easter, -2)), "Viernes Santo");
  entries.set(dateKey(addDays(easter, 39)), "Ascensión del Señor");
  entries.set(dateKey(addDays(easter, 60)), "Corpus Christi");
  entries.set(dateKey(addDays(easter, 68)), "Sagrado Corazón de Jesús");
  return entries;
};

export const getColombianHoliday = (date: string | Date): string | null => {
  const value = typeof date === "string" ? new Date(`${date.slice(0, 10)}T00:00:00Z`) : date;
  if (Number.isNaN(value.getTime())) return null;
  return holidayEntries(value.getUTCFullYear()).get(dateKey(value)) ?? null;
};

export const getColombianCalendarDay = (date: string): ColombiaCalendarDay => {
  const value = new Date(`${date.slice(0, 10)}T00:00:00Z`);
  const day = value.getUTCDay();
  const isSaturday = day === 6;
  const isSunday = day === 0;
  const holidayName = getColombianHoliday(value);
  const className = holidayName ? "is-holiday" : isSaturday || isSunday ? "is-weekend" : "";
  const description = holidayName ? `Festivo: ${holidayName}` : isSaturday ? "Sábado" : isSunday ? "Domingo" : "Día hábil";
  return { isSaturday, isSunday, holidayName, className, tooltip: `${date.slice(8, 10)} — ${description}` };
};
