export function compareReleaseVersions(left: string, right: string): number {
  const parse = (value: string) => {
    const [core = '', prerelease = ''] = String(value || '').trim().replace(/^v/i, '').split('-', 2);
    return { numbers: core.split('.').map((part) => Number.parseInt(part, 10) || 0), prerelease };
  };
  const leftVersion = parse(left);
  const rightVersion = parse(right);
  for (let index = 0; index < Math.max(leftVersion.numbers.length, rightVersion.numbers.length); index += 1) {
    const difference = (leftVersion.numbers[index] || 0) - (rightVersion.numbers[index] || 0);
    if (difference) return difference;
  }
  if (leftVersion.prerelease && !rightVersion.prerelease) return -1;
  if (!leftVersion.prerelease && rightVersion.prerelease) return 1;
  return leftVersion.prerelease.localeCompare(rightVersion.prerelease);
}
