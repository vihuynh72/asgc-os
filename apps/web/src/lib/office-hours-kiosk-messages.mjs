function formatMinutes(totalMinutes) {
  const minutes = Math.max(0, Math.round(Number(totalMinutes) || 0));
  const hoursPart = Math.floor(minutes / 60);
  const minutesPart = minutes % 60;
  return `${hoursPart}h ${minutesPart}m`;
}

export function buildKioskOtpSmsText({ code, expiresInMinutes }) {
  return `ASGC Office Hours code: ${code}. This code expires in ${expiresInMinutes} minutes.`;
}

export function buildKioskCheckoutReminderSmsText({ elapsedMinutes }) {
  return `ASGC Office Hours reminder: your session has been open for ${formatMinutes(elapsedMinutes)}. Please check out when you leave the office.`;
}
