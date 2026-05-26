function normalizeIp(ip) {
  return (ip || '').replace(/^::ffff:/, '');
}

function isTrustedProxyAddress(ip) {
  const normalizedIp = normalizeIp(ip);

  if (
    normalizedIp === '127.0.0.1' ||
    normalizedIp === '::1' ||
    normalizedIp.startsWith('10.') ||
    normalizedIp.startsWith('192.168.')
  ) {
    return true;
  }

  const parts = normalizedIp.split('.');
  if (parts.length === 4 && parts[0] === '172') {
    const second = Number(parts[1]);
    if (second >= 16 && second <= 31) {
      return true;
    }
  }

  return normalizedIp.startsWith('fc') || normalizedIp.startsWith('fd');
}

export function getClientIp(req, trustProxy) {
  const remoteAddress = req.socket?.remoteAddress || 'unknown';

  if (trustProxy && isTrustedProxyAddress(remoteAddress)) {
    const forwardedFor = req.headers['x-forwarded-for'];
    if (typeof forwardedFor === 'string' && forwardedFor.trim()) {
      return forwardedFor.split(',')[0].trim();
    }
  }

  return normalizeIp(remoteAddress);
}
