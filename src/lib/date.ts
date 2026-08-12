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

export const toLocalDateKey = (date = new Date()): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

export const getQuincena = (dateKey: string): Quincena => {
  const day = Number(dateKey.slice(8, 10));
  return day <= 15 ? 1 : 2;
};

export const getMonthKey = (dateKey: string): string => dateKey.slice(0, 7);

export const formatMonthTitle = (monthKey: string): string => {
  const [yearRaw, monthRaw] = monthKey.split("-");
  const monthIndex = Number(monthRaw) - 1;
  return `${MONTHS[monthIndex] || monthRaw} ${yearRaw}`;
};

export const formatShortDate = (dateKey: string): string => {
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return new Intl.DateTimeFormat("es-DO", {
    day: "numeric",
    month: "short",
  }).format(date);
};
