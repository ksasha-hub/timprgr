function sanitize(fields = {}) {
  const sanitized = {};

  for (const [key, value] of Object.entries(fields)) {
    if (value == null || value === '') continue;
    if (key === 'ciphertext' || key === 'nonce' || key === 'pub') continue;
    sanitized[key] = value;
  }

  return sanitized;
}

function write(level, event, fields) {
  const entry = {
    ts: new Date().toISOString(),
    level,
    event,
    ...sanitize(fields)
  };

  const line = JSON.stringify(entry);
  if (level === 'error') {
    console.error(line);
    return;
  }

  console.log(line);
}

export const logger = {
  info(event, fields) {
    write('info', event, fields);
  },
  warn(event, fields) {
    write('warn', event, fields);
  },
  error(event, fields) {
    write('error', event, fields);
  }
};
