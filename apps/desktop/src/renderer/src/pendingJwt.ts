let token: string | null = null;

export function queueJwt(next: string): void {
  token = next;
}

export function takeJwt(): string | null {
  const value = token;
  token = null;
  return value;
}
