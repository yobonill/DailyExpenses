export const EXPENSE_CATEGORIES = [
  "Alimentación",
  "Vivienda y hogar",
  "Servicios",
  "Transporte",
  "Salud",
  "Educación",
  "Deudas y préstamos",
  "Ahorros",
  "Familia y mesadas",
  "Suscripciones y entretenimiento",
  "Donaciones",
  "Otros",
] as const;

export const isPredefinedExpenseCategory = (value: string): boolean =>
  EXPENSE_CATEGORIES.some((category) => category === value);
