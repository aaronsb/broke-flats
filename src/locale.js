// Which side of the road the player's locale drives on. Read once at load
// from the browser's language tag; regions that drive on the left flip the
// crossing-gate layout. Defaults to right-hand traffic.
const LEFT = new Set([
  'GB', 'IE', 'AU', 'NZ', 'JP', 'IN', 'ZA', 'MT', 'CY', 'HK', 'SG', 'MY', 'TH', 'ID', 'KE', 'PK', 'LK', 'BD', 'NP',
  'JM', 'TT', 'BB', 'BS', 'BW', 'ZW', 'ZM', 'MZ', 'NA', 'MW', 'UG', 'TZ', 'MU', 'FJ', 'PG', 'BN', 'GY', 'SR', 'BM',
  'KY', 'VG', 'AI', 'MS', 'TC', 'GD', 'LC', 'VC', 'KN', 'AG', 'DM', 'MO', 'TL', 'LS', 'SZ', 'GG', 'JE', 'IM', 'CK',
  'NR', 'KI', 'SB', 'TO', 'TV', 'WS', 'NU', 'TK', 'PN', 'SH', 'FK', 'GS', 'BT', 'MV', 'SC',
]);

export function leftHandTraffic() {
  try {
    const tag = navigator.language || Intl.DateTimeFormat().resolvedOptions().locale || 'en-US';
    const region = new Intl.Locale(tag).maximize().region;
    return LEFT.has(region);
  } catch { return false; }
}

export const LEFT_HAND = leftHandTraffic();
