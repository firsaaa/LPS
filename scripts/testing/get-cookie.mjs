import "dotenv/config";
const BASE = process.env.NEXTAUTH_URL ?? "http://localhost:3001";
async function login(email, password) {
  const csrfRes = await fetch(`${BASE}/api/auth/csrf`);
  const jar = csrfRes.headers.getSetCookie();
  const { csrfToken } = await csrfRes.json();
  const body = new URLSearchParams({ email, password, csrfToken, json: "true" });
  const loginRes = await fetch(`${BASE}/api/auth/callback/credentials`, {
    method: "POST", redirect: "manual",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Cookie: jar.map((c) => c.split(";")[0]).join("; ") },
    body,
  });
  const allCookies = [...jar, ...loginRes.headers.getSetCookie()];
  const merged = new Map();
  for (const c of allCookies) { const [kv] = c.split(";"); const [k, v] = kv.split("="); merged.set(k, v); }
  return [...merged.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
}
console.log(await login(process.env.TEST_SUPERADMIN_EMAIL, process.env.TEST_SUPERADMIN_PASSWORD));
