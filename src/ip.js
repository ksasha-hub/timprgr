export function getClientIp(req, trustProxy) {
  if (trustProxy) {
    const forwardedFor = req.headers['x-forwarded-for'];
    if (typeof forwardedFor === 'string' && forwardedFor.trim()) {
      return forwardedFor.split(',')[0].trim();
    }
  }

  return req.socket?.remoteAddress || 'unknown';
}
