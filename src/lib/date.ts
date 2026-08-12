const MONTHS = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
] as const;

export type Quincena = 1 | 2;

interface DateParts {
  year: number;
  month: number;
  day: number;
}

interface DateRange {
  startDateKey: string;
  endDateKey: string;
}

const parseDateKey = (dateKey: string): DateParts => {
  const [year, month, day] = dateKey.split("-").map(Number);
  return { year, month, day };
};

const toMonthKey = (year: number, month: number): string =>
  `${year}-${String(month).padStart(2, "0")}`;

const toDateKey = (year: number, month: number, day: number): string =>
  `${toMonthKey(year, month)}-${String(day).padStart(2, "0")}`;

const shiftMonth = (year: number, month: number, offset: number): { year: number; month: number } => {
  const shifted = new Date(year, month - 1 + offset, 1);
  return { year: shifted.getFullYear(), month: shifted.getMonth() + 1 };
};

const getLastDayOfMonth = (year: number, month: number): number =>
  new Date(year, month, 0).getDate();

const getSecondPayDay = (year: number, month: number): number =>
  month === 2 ? getLastDayOfMonth(year, month) : 30;

export const toLocalDateKey = (date = new Date()): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

/**
 * Returns the budget-cycle month that owns a date.
 * A cycle named "Agosto 2026" runs from Aug 15 through Sep 14.
 */
export const getMonthKey = (dateKey: string): string => {
  const { year, month, day } = parseDateKey(dateKey);
  if (day >= 15) return toMonthKey(year, month);

  const previousMonth = shiftMonth(year, month, -1);
  return toMonthKey(previousMonth.year, previousMonth.month);
};

/**
 * Quincena 1: 15th through the day before the second pay date.
 * Quincena 2: second pay date through the 14th of the following month.
 * The second pay date is the 30th, except February where it is the last day.
 */
export const getQuincena = (dateKey: string): Quincena => {
  const { year, month, day } = parseDateKey(dateKey);

  // Days 1-14 always belong to Quincena 2 of the previous budget cycle.
  if (day <= 14) return 2;

  const secondPayDay = getSecondPayDay(year, month);
  return day < secondPayDay ? 1 : 2;
};

export const getBudgetCycleRange = (monthKey: string): DateRange => {
  const [year, month] = monthKey.split("-").map(Number);
  const nextMonth = shiftMonth(year, month, 1);

  return {
    startDateKey: toDateKey(year, month, 15),
    endDateKey: toDateKey(nextMonth.year, nextMonth.month, 14),
  };
};

export const getQuincenaRange = (monthKey: string, quincena: Quincena): DateRange => {
  const [year, month] = monthKey.split("-").map(Number);
  const secondPayDay = getSecondPayDay(year, month);

  if (quincena === 1) {
    return {
      startDateKey: toDateKey(year, month, 15),
      endDateKey: toDateKey(year, month, secondPayDay - 1),
    };
  }

  const nextMonth = shiftMonth(year, month, 1);
  return {
    startDateKey: toDateKey(year, month, secondPayDay),
    endDateKey: toDateKey(nextMonth.year, nextMonth.month, 14),
  };
};

export const formatMonthTitle = (monthKey: string): string => {
  const [yearRaw, monthRaw] = monthKey.split("-");
  const monthIndex = Number(monthRaw) - 1;
  return `${MONTHS[monthIndex] || monthRaw} ${yearRaw}`;
};

export const formatShortDate = (dateKey: string): string => {
  const { year, month, day } = parseDateKey(dateKey);
  const date = new Date(year, month - 1, day);
  return new Intl.DateTimeFormat("es-DO", {
    day: "numeric",
    month: "short",
  }).format(date);
};

const formatRange = ({ startDateKey, endDateKey }: DateRange): string =>
  `${formatShortDate(startDateKey)} – ${formatShortDate(endDateKey)}`;

export const formatBudgetCycleRange = (monthKey: string): string =>
  formatRange(getBudgetCycleRange(monthKey));

export const formatQuincenaRange = (monthKey: string, quincena: Quincena): string =>
  formatRange(getQuincenaRange(monthKey, quincena));
