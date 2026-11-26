import { NextRequest, NextResponse } from "next/server";
import { sql } from "../../../../lib/db";
import { createSession } from "../../../../lib/auth/authenticate";
import { verifyPassword } from "../../../../lib/auth/password";
import {
  clientIp,
  createRateLimiter,
  isAllowedOrigin,
  loginSchema,
} from "../../../../lib/auth/login-guard";

const loginAttempts = createRateLimiter(5, 15 * 60 * 1000);

function reject(message: string, status: number, headers?: HeadersInit) {
  return NextResponse.json({ message }, { status, headers });
}

export async function POST(request: NextRequest) {
  const host =
    request.headers.get("x-forwarded-host") ?? request.headers.get("host");

  if (!isAllowedOrigin(request.headers.get("origin"), host)) {
    return reject("Permintaan ditolak.", 403);
  }

  const parsed = loginSchema.safeParse(await request.json().catch(() => null));

  if (!parsed.success) {
    return reject("Email dan password wajib diisi.", 400);
  }

  const { email, password } = parsed.data;
  const attemptKey = `${clientIp(request.headers.get("x-forwarded-for"))}|${email}`;
  const retryAfter = loginAttempts.take(attemptKey);

  if (retryAfter) {
    return reject("Terlalu banyak percobaan masuk. Coba lagi nanti.", 429, {
      "Retry-After": String(retryAfter),
    });
  }

  try {
    const [user] = await sql`
      SELECT
        u.id,
        u.email,
        u.password_hash,
        u.is_active,
        EXISTS (SELECT 1 FROM public.admin_users a WHERE a.user_id = u.id)
          OR EXISTS (SELECT 1 FROM public.superadmin_users s WHERE s.user_id = u.id) AS is_admin
      FROM public.app_users u
      WHERE u.email = ${email}
      LIMIT 1
    `;

    const passwordMatches = await verifyPassword(user?.password_hash, password);

    if (!user || !passwordMatches || !user.is_active) {
      return reject("Email atau password tidak valid.", 401);
    }

    if (!user.is_admin) {
      return reject("Akun ini tidak memiliki akses admin.", 403);
    }

    await createSession(user.id);
    loginAttempts.reset(attemptKey);

    return NextResponse.json({
      success: true,
      user: { id: user.id, email: user.email },
    });
  } catch (error) {
    console.error("Admin sign-in failed", error);
    return reject("Layanan autentikasi belum tersedia. Silakan coba kembali.", 503);
  }
}
