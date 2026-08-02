import { query } from "./db";

export type DeploymentSummary = {
  totalDeployments: number;
  currentCommit: string | null;
  lastDeployedAt: string | null;
};

export async function getDeploymentSummary(): Promise<DeploymentSummary> {
  const rows = await query<{
    total_deployments: number | string;
    current_commit: string | null;
    last_deployed_at: string | null;
  }>(
    `
      SELECT
        COUNT(*)::BIGINT AS total_deployments,
        (ARRAY_AGG(commit_sha ORDER BY deployed_at DESC, id DESC))[1] AS current_commit,
        MAX(deployed_at) AS last_deployed_at
      FROM deployment_events
    `,
  );
  const row = rows[0];

  return {
    totalDeployments: Number(row?.total_deployments ?? 0),
    currentCommit: row?.current_commit ?? null,
    lastDeployedAt: row?.last_deployed_at ? new Date(row.last_deployed_at).toISOString() : null,
  };
}

export async function recordDeployment(commitSha: string) {
  await query(
    `INSERT INTO deployment_events (commit_sha) VALUES ($1)`,
    [commitSha],
  );
}
