const currencyFormatter = new Intl.NumberFormat("es-DO", {
  style: "currency",
  currency: "DOP",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export const formatMoney = (cents: number): string =>
  currencyFormatter.format(cents / 100);

const usdFormatter = new Intl.NumberFormat("es-DO", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export const formatCurrency = (minor: number, currency: "DOP" | "USD"): string =>
  currency === "USD" ? usdFormatter.format(minor / 100) : formatMoney(minor);

export const formatExcelAmount = (cents: number): string => {
  const value = cents / 100;
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
};

export const parseMoneyToCents = (rawValue: string): number | null => {
  let value = rawValue.trim().replace(/\s+/g, "").replace(/RD\$/gi, "").replace(/\$/g, "");
  if (!value) return null;
  if (!/^[0-9.,]+$/.test(value)) return null;

  const lastComma = value.lastIndexOf(",");
  const lastDot = value.lastIndexOf(".");
  const lastSeparator = Math.max(lastComma, lastDot);

  let normalized: string;
  if (lastSeparator >= 0) {
    const fractionLength = value.length - lastSeparator - 1;
    const separator = value[lastSeparator];
    const sameSeparatorCount = value.split(separator).length - 1;
    const treatAsDecimal = fractionLength > 0 && fractionLength <= 2;

    if (treatAsDecimal) {
      const whole = value.slice(0, lastSeparator).replace(/[.,]/g, "");
      const fraction = value.slice(lastSeparator + 1).replace(/[.,]/g, "");
      normalized = `${whole || "0"}.${fraction}`;
    } else if (sameSeparatorCount === 1 && fractionLength === 0) {
      normalized = value.slice(0, -1).replace(/[.,]/g, "");
    } else {
      normalized = value.replace(/[.,]/g, "");
    }
  } else {
    normalized = value;
  }

  const amount = Number(normalized);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  const cents = Math.round(amount * 100);
  return cents > 0 ? cents : null;
};

export const minorToInput = (minor: number | undefined): string =>
  typeof minor === "number" ? (minor / 100).toFixed(2) : "";
