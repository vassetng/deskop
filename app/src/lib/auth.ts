export type Staff = {
  id: string;
  username: string;
  displayName: string;
  department: string;
  role: "admin" | "staff";
  createdAt: string;
};

type Session = {
  serverUrl: string;
  token: string;
  connectionPassword: string | null;
  staff: Staff;
};

const STORAGE_KEY = "deskop:session";

let session: Session | null = loadSession();

function loadSession(): Session | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveSession(next: Session | null) {
  session = next;
  if (next) sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  else sessionStorage.removeItem(STORAGE_KEY);
}

export function getSession(): Session | null {
  return session;
}

export function getServerUrl(): string {
  return session?.serverUrl || "http://localhost:4000";
}

export function getToken(): string | null {
  return session?.token || null;
}

export function getConnectionPassword(): string | null {
  return session?.connectionPassword || null;
}

export async function login(
  serverUrl: string,
  username: string,
  password: string,
  connectionPassword: string | null
): Promise<Staff> {
  const res = await fetch(`${serverUrl}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "Login failed");
  }
  const { token, staff } = await res.json();
  saveSession({ serverUrl, token, connectionPassword, staff });
  return staff;
}

export function logout() {
  saveSession(null);
}

export async function authFetch(path: string, options: RequestInit = {}): Promise<Response> {
  if (!session) throw new Error("Not logged in");
  const headers = new Headers(options.headers);
  headers.set("Authorization", `Bearer ${session.token}`);
  return fetch(`${session.serverUrl}${path}`, { ...options, headers });
}
