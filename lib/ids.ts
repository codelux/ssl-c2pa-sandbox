export function rid(prefix = 'req_') {
  return prefix + Math.random().toString(36).slice(2);
}

