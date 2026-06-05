export function removeVietnameseAccents(str: string): string {
  if (!str) return '';
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'd')
    .toLowerCase();
}

export function extractTitleFromUrl(urlStr: string): string {
  try {
    const url = new URL(urlStr);
    const pathParts = url.pathname.split('/').filter(Boolean);
    const lastSegment = pathParts[pathParts.length - 1] || '';
    // Split by dot to strip any suffix identifier (e.g., .123456)
    const title = lastSegment.split('.')[0] || lastSegment;
    return decodeURIComponent(title);
  } catch (error) {
    // Fallback if URL is not absolute or standard
    const lastPart = urlStr.split('/').filter(Boolean).pop() || '';
    return decodeURIComponent(lastPart.split('.')[0] || lastPart);
  }
}
