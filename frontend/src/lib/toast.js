let _show = null;

export function initToast(fn) { _show = fn; }

export const toast = {
  success: (msg) => _show?.({ type: 'success', message: msg }),
  error:   (msg) => _show?.({ type: 'error',   message: msg }),
  info:    (msg) => _show?.({ type: 'info',     message: msg }),
};
