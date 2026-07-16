const getDeviceLocale = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().locale || undefined;
  } catch {
    return undefined;
  }
};

export const formatCurrency = (amount: number, currency = "INR") =>
  new Intl.NumberFormat(getDeviceLocale(), {
    currency,
    maximumFractionDigits: amount % 1 === 0 ? 0 : 2,
    style: "currency",
  }).format(amount);

export const formatDate = (timestamp: number) =>
  new Intl.DateTimeFormat(getDeviceLocale(), {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(timestamp));
