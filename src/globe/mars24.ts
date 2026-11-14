// Mars24 solar-position algorithm (Allison & McEwen 2000, NASA GISS Mars24).
// Returns the subsolar point and season for the current UTC instant.
export type MarsSun = {
  lonEast: number;
  lat: number;
  ls: number;
  mstHours: number;
};

const RAD = Math.PI / 180;

function mod360(value: number) {
  return ((value % 360) + 360) % 360;
}

export function getMarsSun(date: Date = new Date()): MarsSun {
  const jdUT = 2440587.5 + date.getTime() / 86_400_000;
  const jdTT = jdUT + 69.184 / 86_400;
  const dt = jdTT - 2451545.0;

  const M = 19.3871 + 0.52402073 * dt;
  const alphaFMS = 270.3871 + 0.524038496 * dt;

  const perturbers: Array<[number, number, number]> = [
    [0.0071, 2.2353, 49.409],
    [0.0057, 2.7543, 168.173],
    [0.0039, 1.1177, 191.837],
    [0.0037, 15.7866, 21.736],
    [0.0021, 2.1354, 15.704],
    [0.002, 2.4694, 95.528],
    [0.0018, 32.8493, 49.095],
  ];
  let pbs = 0;
  for (const [a, tau, phi] of perturbers) {
    pbs += a * Math.cos((0.985626 * dt) / tau + phi * RAD);
  }

  const eqCenter =
    (10.691 + 3e-7 * dt) * Math.sin(M * RAD) +
    0.623 * Math.sin(2 * M * RAD) +
    0.05 * Math.sin(3 * M * RAD) +
    0.005 * Math.sin(4 * M * RAD) +
    0.0005 * Math.sin(5 * M * RAD) +
    pbs;

  const ls = mod360(alphaFMS + eqCenter);
  const eot =
    2.861 * Math.sin(2 * ls * RAD) -
    0.071 * Math.sin(4 * ls * RAD) +
    0.002 * Math.sin(6 * ls * RAD) -
    eqCenter;

  const mstHours =
    (((24 * ((jdTT - 2451549.5) / 1.0274912517 + 44796.0 - 0.0009626)) % 24) + 24) %
    24;

  const sunLonWest = mod360(mstHours * 15 + eot + 180);
  const lonEast = ((-sunLonWest + 540) % 360) - 180;
  const lat = Math.asin(0.42565 * Math.sin(ls * RAD)) / RAD + 0.25 * Math.sin(ls * RAD);

  return { lonEast, lat, ls, mstHours };
}
