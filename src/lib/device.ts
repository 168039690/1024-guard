export function isPhone(ua: string = typeof navigator === 'undefined' ? '' : navigator.userAgent): boolean {
  return /iPhone|iPod|Android.+Mobile|Windows Phone/i.test(ua);
}
