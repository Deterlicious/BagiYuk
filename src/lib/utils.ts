export function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export function createId(prefix: string) {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function initials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toLocaleUpperCase("id-ID"))
    .join("") || "?";
}

const avatarColors = [
  "#DCEDE8",
  "#FDE8DF",
  "#F4E4B7",
  "#DEE8F2",
  "#E9E0F0",
  "#E3E9D2",
];

export function avatarColor(id: string) {
  const hash = [...id].reduce((value, character) => value + character.charCodeAt(0), 0);
  return avatarColors[hash % avatarColors.length] ?? avatarColors[0];
}
