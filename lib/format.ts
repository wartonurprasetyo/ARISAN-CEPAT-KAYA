export const rupiah = (amount: number) => new Intl.NumberFormat("id-ID", {
  style: "currency", currency: "IDR", maximumFractionDigits: 0
}).format(amount);

export const formatWib = (value: string | null) => value ? new Intl.DateTimeFormat("id-ID", {
  dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Jakarta"
}).format(new Date(value)) + " WIB" : "Belum diambil";

export const formatWibParts = (value: string | null) => {
  if (!value) return { date: "Belum diambil", time: "" };
  const date = new Date(value);
  return {
    date: new Intl.DateTimeFormat("id-ID", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Jakarta" }).format(date),
    time: `${new Intl.DateTimeFormat("id-ID", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Jakarta" }).format(date)} WIB`
  };
};
