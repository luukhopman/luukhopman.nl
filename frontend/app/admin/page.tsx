import { getUsageReport } from "@/lib/server/usage";
import { APP_INFO } from "@/lib/app-info";
import { getDeploymentSummary } from "@/lib/server/deployments";
import { getFeedbackItems } from "@/lib/server/feedback";
import { LocalDateTime } from "@/components/local-date-time";

type AdminPageProps = {
  searchParams: Promise<{ days?: string }>;
};

function parseDays(value: string | undefined) {
  const days = Number(value);
  return [7, 30, 90, 365].includes(days) ? days : 30;
}

function formatLastSeen(value: string) {
  return new Date(value).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export default async function AdminPage({ searchParams }: AdminPageProps) {
  const days = parseDays((await searchParams).days);
  const [report, deployments, feedbackItems] = await Promise.all([
    getUsageReport(days),
    getDeploymentSummary(),
    getFeedbackItems(),
  ]);
  const openFeedbackCount = feedbackItems.filter((item) => item.status !== "done").length;

  return (
    <main className="admin-shell min-h-dvh bg-[#f5f1ea] text-[#332a26]">
      <div className="mx-auto w-full max-w-4xl px-4 py-6 pb-24 sm:px-6 sm:py-10">
        <header className="admin-page-header mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-serif text-4xl tracking-tight sm:text-5xl">Usage</h1>
          </div>
          <form method="get" className="flex items-center gap-2 text-sm">
            <label htmlFor="usage-days" className="text-[#7c716b]">Period</label>
            <select
              id="usage-days"
              name="days"
              defaultValue={String(days)}
              className="rounded-lg border border-[#d9d1c8] bg-white px-3 py-2"
            >
              <option value="7">7 days</option>
              <option value="30">30 days</option>
              <option value="90">90 days</option>
              <option value="365">1 year</option>
            </select>
            <button
              type="submit"
              className="rounded-lg bg-[#a94f39] px-3 py-2 font-semibold text-white"
            >
              Apply
            </button>
          </form>
        </header>

        <section className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-label="Application information">
          <div className="rounded-xl border border-[#e4ddd4] bg-white p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-[#8a7a6e]">Android APK</p>
            <p className="mt-1 text-lg font-semibold">
              v{APP_INFO.androidVersionName} · {APP_INFO.androidVersionCode}
            </p>
          </div>
          <div className="rounded-xl border border-[#e4ddd4] bg-white p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-[#8a7a6e]">Deployments</p>
            <p className="mt-1 text-lg font-semibold">{deployments.totalDeployments}</p>
          </div>
          <div className="rounded-xl border border-[#e4ddd4] bg-white p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-[#8a7a6e]">Current commit</p>
            <p className="mt-1 font-mono text-sm font-semibold">{deployments.currentCommit?.slice(0, 12) ?? "—"}</p>
          </div>
          <div className="rounded-xl border border-[#e4ddd4] bg-white p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-[#8a7a6e]">Last deployed</p>
            <p className="mt-1 text-sm font-semibold">
              {deployments.lastDeployedAt ? (
                <LocalDateTime value={deployments.lastDeployedAt} />
              ) : "Not recorded"}
            </p>
          </div>
        </section>

        <section className="mb-6 grid gap-3 sm:grid-cols-2" aria-label="Usage totals">
          <div className="rounded-xl border border-[#e4ddd4] bg-white p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-[#8a7a6e]">Views</p>
            <p className="mt-1 text-3xl font-semibold">{report.totalViews}</p>
          </div>
          <div className="rounded-xl border border-[#e4ddd4] bg-white p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-[#8a7a6e]">Unique visitors</p>
            <p className="mt-1 text-3xl font-semibold">{report.uniqueVisitors}</p>
          </div>
        </section>

        <section className="mb-6 overflow-hidden rounded-xl border border-[#e4ddd4] bg-white" aria-label="Feedback backlog">
          <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-[#eee9e3] px-4 py-3">
            <h2 className="font-semibold">Feedback backlog</h2>
            <span className="text-xs text-[#8a7a6e]">{openFeedbackCount} open</span>
          </div>
          {feedbackItems.length ? (
            <div className="divide-y divide-[#eee9e3]">
              {feedbackItems.map((item) => (
                <article key={item.id} className="px-4 py-4">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[#8a7a6e]">
                    <span className="font-mono">#{item.id} · {item.pagePath}</span>
                    <span className="rounded-full bg-[#f5f1ea] px-2 py-1 font-semibold uppercase tracking-wide">
                      {item.status.replace("_", " ")}
                    </span>
                  </div>
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-6">{item.message}</p>
                  <p className="mt-2 text-xs text-[#8a7a6e]">{formatLastSeen(item.createdAt)}</p>
                </article>
              ))}
            </div>
          ) : (
            <p className="px-4 py-8 text-sm text-[#7c716b]">No feedback backlog items yet.</p>
          )}
        </section>

        <section className="overflow-hidden rounded-xl border border-[#e4ddd4] bg-white">
          <div className="border-b border-[#eee9e3] px-4 py-3">
            <h2 className="font-semibold">Pages · last {report.days} days</h2>
          </div>
          {report.pages.length ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-left text-sm">
                <thead className="bg-[#faf7f2] text-xs uppercase tracking-wide text-[#8a7a6e]">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Page</th>
                    <th className="px-4 py-3 font-semibold">Views</th>
                    <th className="px-4 py-3 font-semibold">Visitors</th>
                    <th className="px-4 py-3 font-semibold">Last seen</th>
                  </tr>
                </thead>
                <tbody>
                  {report.pages.map((page) => (
                    <tr key={page.pagePath} className="border-t border-[#eee9e3]">
                      <td className="px-4 py-3 font-medium">{page.pagePath}</td>
                      <td className="px-4 py-3">{page.views}</td>
                      <td className="px-4 py-3">{page.uniqueVisitors}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-[#7c716b]">
                        {formatLastSeen(page.lastSeenAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="px-4 py-8 text-sm text-[#7c716b]">No usage recorded yet.</p>
          )}
        </section>

      </div>
    </main>
  );
}
