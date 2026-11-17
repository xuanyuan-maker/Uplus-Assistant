let logEl;

export function setLogElement(element) {
  logEl = element;
}

function log(level, ...args) {
  const msg = args.join(' ');
  const prefix = `[U+助手] `;
  console[level](prefix + msg);
  if (logEl) {
    const line = document.createElement('div');
    line.className = `uplus-log-line uplus-log-${level}`;
    line.textContent = prefix + msg;
    logEl.appendChild(line);
    logEl.scrollTop = logEl.scrollHeight;
  }
}

export const logger = {
  log: (...a) => log('log', ...a),
  warn: (...a) => log('warn', ...a),
  error: (...a) => log('error', ...a),
};
