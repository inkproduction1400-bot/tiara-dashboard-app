export function isPhoneOnlyUserAgent(userAgent: string | null | undefined): boolean {
  const ua = userAgent ?? "";
  const isIpad = /iPad/i.test(ua) || (/Macintosh/i.test(ua) && /Mobile/i.test(ua));
  const isIphone = /iPhone/i.test(ua);
  const isAndroidPhone = /Android/i.test(ua) && /Mobile/i.test(ua);
  return !isIpad && (isIphone || isAndroidPhone);
}

export function isCurrentPhoneDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  return isPhoneOnlyUserAgent(navigator.userAgent);
}
