export function normalizeSearchKey(value: string) {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase("pt-BR");
}
