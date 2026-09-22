import { createClient } from "@supabase/supabase-js";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const emailArgument = process.argv[2]?.trim().toLowerCase();

if (!supabaseUrl || !serviceRoleKey) {
  console.error("Set SUPABASE_URL dan SUPABASE_SERVICE_ROLE_KEY terlebih dahulu.");
  process.exit(1);
}

const rl = createInterface({ input, output });

async function askHidden(question) {
  if (!input.isTTY || !output.isTTY) {
    return rl.question(question);
  }

  return new Promise((resolve) => {
    output.write(question);
    input.setRawMode(true);
    input.resume();
    let value = "";

    const onData = (chunk) => {
      const char = chunk.toString();
      if (char === "\u0003") {
        input.setRawMode(false);
        input.removeListener("data", onData);
        rl.close();
        process.exit(130);
      }
      if (char === "\r" || char === "\n") {
        input.setRawMode(false);
        input.removeListener("data", onData);
        output.write("\n");
        resolve(value);
        return;
      }
      if (char === "\u007f") {
        value = value.slice(0, -1);
        return;
      }
      value += char;
    };

    input.on("data", onData);
  });
}

async function findAdminByEmail(client, email) {
  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await client.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    const user = data.users.find((candidate) => candidate.email?.toLowerCase() === email);
    if (user) {
      const { data: admin, error: adminError } = await client
        .from("admin_users")
        .select("user_id")
        .eq("user_id", user.id)
        .maybeSingle();
      if (adminError) throw adminError;
      return admin ? user : null;
    }
    if (data.users.length < 1000) break;
  }
  return null;
}

try {
  const email = emailArgument || (await rl.question("Email admin: ")).trim().toLowerCase();
  if (!email) throw new Error("Email admin wajib diisi.");

  const password = await askHidden("Password baru: ");
  const confirmation = await askHidden("Ulangi password baru: ");
  if (password.length < 8) throw new Error("Password minimal 8 karakter.");
  if (password !== confirmation) throw new Error("Konfirmasi password tidak cocok.");

  const client = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
  const user = await findAdminByEmail(client, email);
  if (!user) throw new Error("Email tidak ditemukan atau bukan anggota admin_users.");

  const { error } = await client.auth.admin.updateUserById(user.id, { password });
  if (error) throw error;
  console.log(`Password admin ${email} berhasil diperbarui.`);
} catch (error) {
  console.error(`Gagal mengganti password: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
} finally {
  rl.close();
}
