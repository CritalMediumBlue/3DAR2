/**
 * Generates normally distributed random numbers using the Box-Muller transform
 * @param {number} mean - Mean of the distribution
 * @param {number} sd - Standard deviation of the distribution
 * @returns {Array} Two independent normally distributed random values
 */
export function normalPolar(mean = 0, sd = 1) {
  let u1, u2, s;

  do {
    u1 = Math.random() * 2 - 1; // Random number in (-1, 1)
    u2 = Math.random() * 2 - 1; // Random number in (-1, 1)
    s = u1 * u1 + u2 * u2;      // Compute s = u1^2 + u2^2
  } while (s >= 1 || s === 0);  // Discard if outside the unit circle or s == 0

  const factor = Math.sqrt(-2.0 * Math.log(s) / s);

  const z0 = u1 * factor;
  const z1 = u2 * factor;

  return [mean + z0 * sd, mean + z1 * sd];
}