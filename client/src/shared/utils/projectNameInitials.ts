export function projectNameInitials(name: string): string {
  return Array.from(name.trim()).slice(0, 2).join('') || '项目';
}
