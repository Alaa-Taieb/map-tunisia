/**
 * WGS 84 / UTM zone 32N (EPSG:32632) forward and inverse transverse Mercator,
 * using Krüger's series to 6th order (Karney 2011). Accurate to well under a
 * millimetre inside the zone. Dependency-free.
 *
 * @module map-tunisia/utm
 */

const a = 6378137; // WGS84 semi-major axis
const f = 1 / 298.257223563;
const k0 = 0.9996;
const lon0 = (9 * Math.PI) / 180; // central meridian of UTM zone 32
const FALSE_EASTING = 500000;

const n = f / (2 - f);
const n2 = n * n, n3 = n2 * n, n4 = n3 * n, n5 = n4 * n, n6 = n5 * n;
const A = (a / (1 + n)) * (1 + n2 / 4 + n4 / 64 + n6 / 256);

const alpha = [
  n / 2 - (2 / 3) * n2 + (5 / 16) * n3 + (41 / 180) * n4 - (127 / 288) * n5 + (7891 / 37800) * n6,
  (13 / 48) * n2 - (3 / 5) * n3 + (557 / 1440) * n4 + (281 / 630) * n5 - (1983433 / 1935360) * n6,
  (61 / 240) * n3 - (103 / 140) * n4 + (15061 / 26880) * n5 + (167603 / 181440) * n6,
  (49561 / 161280) * n4 - (179 / 168) * n5 + (6601661 / 7257600) * n6,
  (34729 / 80640) * n5 - (3418889 / 1995840) * n6,
  (212378941 / 319334400) * n6,
];
const beta = [
  n / 2 - (2 / 3) * n2 + (37 / 96) * n3 - (1 / 360) * n4 - (81 / 512) * n5 + (96199 / 604800) * n6,
  (1 / 48) * n2 + (1 / 15) * n3 - (437 / 1440) * n4 + (46 / 105) * n5 - (1118711 / 3870720) * n6,
  (17 / 480) * n3 - (37 / 840) * n4 - (209 / 4480) * n5 + (5569 / 90720) * n6,
  (4397 / 161280) * n4 - (11 / 504) * n5 - (830251 / 7257600) * n6,
  (4583 / 161280) * n5 - (108847 / 3991680) * n6,
  (20648693 / 638668800) * n6,
];
const e = Math.sqrt(f * (2 - f));

/**
 * Longitude/latitude (degrees, WGS84) → UTM 32N easting/northing (metres).
 * @param {[number, number]} lonlat
 * @returns {[number, number]}
 */
export function toUTM([lon, lat]) {
  const phi = (lat * Math.PI) / 180;
  const lambda = (lon * Math.PI) / 180 - lon0;
  const t = Math.sinh(Math.atanh(Math.sin(phi)) - e * Math.atanh(e * Math.sin(phi)));
  const xiP = Math.atan2(t, Math.cos(lambda));
  const etaP = Math.atanh(Math.sin(lambda) / Math.sqrt(1 + t * t));
  let xi = xiP, eta = etaP;
  for (let j = 1; j <= 6; j++) {
    xi += alpha[j - 1] * Math.sin(2 * j * xiP) * Math.cosh(2 * j * etaP);
    eta += alpha[j - 1] * Math.cos(2 * j * xiP) * Math.sinh(2 * j * etaP);
  }
  return [FALSE_EASTING + k0 * A * eta, k0 * A * xi];
}

/**
 * UTM 32N easting/northing (metres) → longitude/latitude (degrees, WGS84).
 * @param {[number, number]} en
 * @returns {[number, number]}
 */
export function fromUTM([E, N]) {
  const xi = N / (k0 * A);
  const eta = (E - FALSE_EASTING) / (k0 * A);
  let xiP = xi, etaP = eta;
  for (let j = 1; j <= 6; j++) {
    xiP -= beta[j - 1] * Math.sin(2 * j * xi) * Math.cosh(2 * j * eta);
    etaP -= beta[j - 1] * Math.cos(2 * j * xi) * Math.sinh(2 * j * eta);
  }
  const chi = Math.asin(Math.sin(xiP) / Math.cosh(etaP));
  // Iterate for latitude from the conformal latitude.
  const tauP = Math.tan(chi);
  let tau = tauP;
  for (let i = 0; i < 6; i++) {
    const sigma = Math.sinh(e * Math.atanh((e * tau) / Math.sqrt(1 + tau * tau)));
    const tauPi = tau * Math.sqrt(1 + sigma * sigma) - sigma * Math.sqrt(1 + tau * tau);
    const dTau = ((tauP - tauPi) / Math.sqrt(1 + tauPi * tauPi)) * ((1 + (1 - e * e) * tau * tau) / ((1 - e * e) * Math.sqrt(1 + tau * tau)));
    tau += dTau;
    if (Math.abs(dTau) < 1e-14) break;
  }
  const lat = Math.atan(tau);
  const lambda = Math.atan2(Math.sinh(etaP), Math.cos(xiP));
  return [((lambda + lon0) * 180) / Math.PI, (lat * 180) / Math.PI];
}
