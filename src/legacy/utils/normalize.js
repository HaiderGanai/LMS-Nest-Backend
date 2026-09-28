function isFirestoreTimestampObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const keys = Object.keys(value);
  return keys.length === 2
    && typeof value._seconds === 'number'
    && typeof value._nanoseconds === 'number';
}

function toDateFromTimestampObject(value) {
  return new Date((value._seconds * 1000) + Math.floor(value._nanoseconds / 1e6));
}

function normalizeFirestoreValue(value) {
  if (Array.isArray(value)) {
    return value.map(normalizeFirestoreValue);
  }

  if (isFirestoreTimestampObject(value)) {
    return toDateFromTimestampObject(value);
  }

  if (value && typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = normalizeFirestoreValue(v);
    }
    return out;
  }

  return value;
}

module.exports = {
  normalizeFirestoreValue,
};

