import { createHash, randomBytes } from "crypto";
import { cookies } from "next/headers";
import { sql } from "../db";

const SESSION_COOKIE = "session";
const SESSION_SECONDS = 60 * 60 * 24 * 7;

export type AccessUser = {
  id: string;
  email: string;
};

export type UserAccess = {
  user: AccessUser | null;
  isAdmin: boolean;
  isSuperadmin: boolean;
};

const noAccess: UserAccess = { user: null, isAdmin: false, isSuperadmin: false };

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

/** The signed-in user and their roles, read from the session cookie. */
export async function getUserAccess(): Promise<UserAccess> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return noAccess;

  const [row] = await sql`
    SELECT
      u.id,
      u.email,
      EXISTS (SELECT 1 FROM public.admin_users a WHERE a.user_id = u.id) AS is_admin,
      EXISTS (SELECT 1 FROM public.superadmin_users sa WHERE sa.user_id = u.id) AS is_superadmin
    FROM public.app_sessions s
    JOIN public.app_users u ON u.id = s.user_id
    WHERE s.token_hash = ${hashToken(token)}
      AND s.expires_at > NOW()
      AND u.is_active = TRUE
    LIMIT 1
  `;
  if (!row) return noAccess;

  const isSuperadmin = Boolean(row.is_superadmin);
  return {
    user: { id: row.id, email: row.email },
    isAdmin: Boolean(row.is_admin) || isSuperadmin,
    isSuperadmin,
  };
}

/** Only callable from a route handler or server action (it writes a cookie). */
export async function createSession(userId: string) {
  const token = randomBytes(32).toString("hex");

  await sql`
    INSERT INTO public.app_sessions (user_id, token_hash, expires_at)
    VALUES (${userId}, ${hashToken(token)}, NOW() + INTERVAL '7 days')
  `;

  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_SECONDS,
  });
}

/** Only callable from a route handler or server action (it writes a cookie). */
export async function destroySession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;

  if (token) {
    await sql`DELETE FROM public.app_sessions WHERE token_hash = ${hashToken(token)}`;
  }

  cookieStore.delete(SESSION_COOKIE);
}
