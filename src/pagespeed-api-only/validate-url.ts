/** Devolve mensagem de erro ou `null` se a URL for aceite pela API (http/https). */
export function validateAuditUrl(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.protocol !== "http:" && u.protocol !== "https:") {
      return `Protocolo não suportado: ${u.protocol}`;
    }
    return null;
  } catch {
    return "URL inválida";
  }
}
