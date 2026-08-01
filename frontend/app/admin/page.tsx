import { getUsageReport } from "@/lib/server/usage";

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
  const report = await getUsageReport(days);

  return (
    <main className="min-h-dvh bg-[#f5f1ea] text-[#332a26]">
      <div className="mx-auto w-full max-w-4xl px-4 py-6 pb-24 sm:px-6 sm:py-10">
        <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="mb-1 text-xs font-semibold uppercase tracking-[0.16em] text-[#8a7a6e]">
              Private admin
            </p>
            <h1 className="font-serif text-4xl tracking-tight sm:text-5xl">Usage</h1>
            <p className="mt-2 max-w-xl text-sm text-[#7c716b]">
              Page views and unique visitor counts for the selected period.
            </p>
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

        <p className="mt-4 text-xs leading-5 text-[#8a7a6e]">
          Visitor counts use one-way IP hashes. Raw IP addresses, user agents, and recipe share tokens are not stored.
        </p>
      </div>
    </main>
  );
}
