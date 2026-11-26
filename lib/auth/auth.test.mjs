import assert from "node:assert/strict";
import { test } from "node:test";

import { clientIp, createRateLimiter, isAllowedOrigin, loginSchema, safeNextPath } from "./login-guard.ts";
import { hashPassword, newPasswordError, verifyPassword } from "./password.ts";

test("login body is validated and normalised", () => {
  assert.equal(loginSchema.parse({ email: "  A@B.ID ", password: " x " }).email, "a@b.id");
  assert.equal(loginSchema.parse({ email: "a@b.id", password: " x " }).password, " x ");
  for (const body of [null, "teks", {}, { email: "a@b.id" }, { email: 1, password: "x" },
    { email: "a@b.id", password: "x".repeat(1025) }, { email: "a".repeat(255), password: "x" }]) {
    assert.equal(loginSchema.safeParse(body).success, false);
  }
});

test("only same-origin or origin-less requests pass", () => {
  assert.equal(isAllowedOrigin(null, "site.id"), true);
  assert.equal(isAllowedOrigin("https://site.id", "site.id"), true);
  assert.equal(isAllowedOrigin("https://evil.id", "site.id"), false);
  assert.equal(isAllowedOrigin("null", "site.id"), false);
  assert.equal(isAllowedOrigin("https://site.id", null), false);
});

test("client IP comes from the last forwarded entry", () => {
  assert.equal(clientIp("6.6.6.6, 10.0.0.1"), "10.0.0.1");
  assert.equal(clientIp(null), "unknown");
});

test("rate limiter blocks, expires, resets and stays bounded", () => {
  const limiter = createRateLimiter(2, 1000, 2);
  assert.equal(limiter.take("a", 0), 0);
  assert.equal(limiter.take("a", 0), 0);
  assert.equal(limiter.take("a", 0), 1);
  assert.equal(limiter.take("a", 1000), 0);
  limiter.take("a", 1000);
  limiter.reset("a");
  assert.equal(limiter.take("a", 1000), 0);
  limiter.take("b", 1000);
  limiter.take("c", 1000); // evicts the oldest key, "a"
  limiter.take("a", 1000);
  assert.equal(limiter.take("a", 1000), 0);
});

test("next path never leaves the site", () => {
  assert.equal(safeNextPath("/admin/users?a=1#b"), "/admin/users?a=1#b");
  for (const bad of [undefined, "", "admin", "https://evil.id", "//evil.id", "/\\evil.id",
    "/\t/evil.id", "/.//evil.id", "javascript:alert(1)"]) {
    assert.equal(safeNextPath(bad), "/admin/schools", JSON.stringify(bad));
  }
});

test("new passwords need 12 characters and fit in 72 bytes", () => {
  assert.ok(newPasswordError("x".repeat(11)));
  assert.equal(newPasswordError("x".repeat(12)), null);
  assert.equal(newPasswordError("x".repeat(72)), null);
  assert.ok(newPasswordError("x".repeat(73)));
  assert.ok(newPasswordError("é".repeat(37)));
});

test("password verification never throws and rejects foreign hashes", async () => {
  const hash = await hashPassword("contoh-sandi-123");
  assert.match(hash, /^\$2b\$12\$/);
  assert.equal(await verifyPassword(hash, "contoh-sandi-123"), true);
  // The $2a$ prefix used by the imported hashes is the same algorithm.
  assert.equal(await verifyPassword(hash.replace("$2b$", "$2a$"), "contoh-sandi-123"), true);
  assert.equal(await verifyPassword(hash, "salah"), false);
  for (const bad of [undefined, null, "", "teks", "$argon2id$rusak", "$2a$99$" + "a".repeat(53)]) {
    assert.equal(await verifyPassword(bad, "contoh-sandi-123"), false);
  }
});
