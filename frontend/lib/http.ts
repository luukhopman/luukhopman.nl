export class UnauthorizedError extends Error {
  constructor() {
    super("Unauthorized");
    this.name = "UnauthorizedError";
  }
}

export async function apiFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const response = await fetch(input, {
    ...init,
    credentials: "same-origin",
  });

  if (response.status === 401) {
    throw new UnauthorizedError();
  }

  return response;
}

export function redirectToLogin(pathname: string) {
  window.location.href = `/login?redirect=${encodeURIComponent(pathname)}`;
}
