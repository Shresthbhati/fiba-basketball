export const MIN_AGE = 13;

export function ageOn(dob: string, today: Date): number {
  const [y, m, d] = dob.split("-").map(Number) as [number, number, number];
  let age = today.getUTCFullYear() - y;
  const hadBirthday =
    today.getUTCMonth() + 1 > m || (today.getUTCMonth() + 1 === m && today.getUTCDate() >= d);
  if (!hadBirthday) age -= 1;
  return age;
}
