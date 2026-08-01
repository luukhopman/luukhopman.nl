import { getPool } from "../lib/server/db";
import { recordDeployment } from "../lib/server/deployments";

const commitSha = process.argv[2]?.trim() ?? "";
if (!/^[0-9a-f]{7,64}$/i.test(commitSha)) {
  console.error("A valid deployment commit SHA is required.");
  process.exit(1);
}

const pool = getPool();
try {
  await recordDeployment(commitSha);
  console.log(`Recorded deployment ${commitSha}.`);
} finally {
  await pool.end();
}
