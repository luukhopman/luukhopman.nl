import fs from "node:fs";
import path from "node:path";

import { loadEnvConfig } from "@next/env";

function loadMigrationEnv() {
  const dirs = [
    process.cwd(),
    path.resolve(process.cwd(), ".."),
  ];

  for (const dir of dirs) {
    const hasEnvFile = [".env", ".env.local"].some((name) =>
      fs.existsSync(path.join(dir, name)),
    );
    if (!hasEnvFile) {
      continue;
    }

    loadEnvConfig(dir);
  }
}

async function main() {
  loadMigrationEnv();
  const [{ createPool }, { MIGRATIONS, runMigrations }] = await Promise.all([
    import("../lib/server/db"),
    import("../lib/server/migrations"),
  ]);
  const pool = createPool();

  try {
    const applied = await runMigrations(pool);
    if (applied.length === 0) {
      console.log("Database schema already up to date.");
      return;
    }

    console.log(`Applied ${applied.length} migration(s): ${applied.join(", ")}`);
  } catch (error) {
    console.error("Migration failed.");
    console.error(error instanceof Error ? error.stack : error);
    console.error(`Known migrations: ${MIGRATIONS.map((item) => item.id).join(", ")}`);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

void main();
