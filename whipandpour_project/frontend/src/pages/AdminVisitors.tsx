import { Fragment, useState } from 'react';
import { useLocation } from 'wouter';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { Loader2, ChevronDown, ChevronRight, Globe, Info } from 'lucide-react';
import AdminLayout from '@/components/AdminLayout';
import { useAdmin } from '@/contexts/AdminContext';
import { trpc } from '@/lib/trpc';

/**
 * Admin → Visitors
 *
 * Every figure is counted from the pageViews table, which the storefront fills
 * via usePageTracking on each route change. Nothing is estimated or modelled:
 * before this page shipped there was no tracking at all, so history starts at
 * the deploy that introduced it rather than at the store's launch.
 *
 * WHAT "VISITOR" MEANS HERE
 * A visitor is a distinct `visitorId` — an HMAC of IP and user agent under a
 * server-held salt. That makes the count honest for ordinary browsing but not
 * infallible: the same person on phone and laptop counts twice, and a changing
 * mobile IP can also count twice. It is a good trend line, not a headcount.
 *
 * A *visit* groups one visitor's page views with no gap longer than 30 minutes,
 * which is why the table can show the path someone took through the store.
 *
 * COLOR
 * The two series use brand gold and blue, a pair validated for colorblind
 * separation (ΔE 29 under protanopia). Everything else is a single-hue bar
 * with its value written beside it, so no reading depends on hue alone.
 */

const SERIES_VISITORS = '#C9A84C';
const SERIES_VIEWS = '#2a78d6';
const GRID = '#E8DDD0';
const AXIS_INK = '#898781';

const RANGES = [
  { days: 7, label: '7 days' },
  { days: 30, label: '30 days' },
  { days: 90, label: '90 days' },
] as const;

const tooltipStyle = {
  backgroundColor: '#FAF7F2',
  border: '1px solid #E8DDD0',
  borderRadius: '8px',
  fontSize: '12px',
};

const regionNames =
  typeof Intl !== 'undefined' && 'DisplayNames' in Intl
    ? new Intl.DisplayNames(['en'], { type: 'region' })
    : null;

function countryName(code: string) {
  if (!code) return 'Unknown';
  try {
    return regionNames?.of(code) ?? code;
  } catch {
    return code;
  }
}

/** Regional-indicator flag from an ISO country code — no icon set needed. */
function countryFlag(code: string) {
  if (!/^[A-Z]{2}$/.test(code)) return '🌐';
  return String.fromCodePoint(...[...code].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
}

function shortDate(iso: string) {
  const d = new Date(`${iso}T00:00:00Z`);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

function whenRelative(iso: string) {
  const then = new Date(iso).getTime();
  const mins = Math.round((Date.now() - then) / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function duration(seconds: number) {
  if (!seconds) return '—';
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s ? `${m}m ${s}s` : `${m}m`;
}

/**
 * One row of a single-hue bar list. The value is always written out, which is
 * both easier to read than judging bar length and what keeps the gold bars
 * legible despite sitting under 3:1 contrast against white.
 */
function BarRow({ label, value, max, sub }: { label: React.ReactNode; value: number; max: number; sub?: string }) {
  const pct = max > 0 ? Math.max(2, Math.round((value / max) * 100)) : 0;
  return (
    <div className="py-1.5">
      <div className="flex items-baseline justify-between gap-3 mb-1">
        <span className="text-xs text-[#2C2C2C] truncate min-w-0">{label}</span>
        <span className="text-xs font-semibold text-[#2C2C2C] shrink-0 tabular-nums">
          {value.toLocaleString()}
          {sub && <span className="font-normal text-[#7A7066]"> {sub}</span>}
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-[#FAF7F2] overflow-hidden">
        <div className="h-full rounded-full bg-[#C9A84C]" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function Panel({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-[#E8DDD0] p-5 shadow-sm">
      <h3 className="font-bold text-[#2C2C2C] mb-1">{title}</h3>
      {note && <p className="text-xs text-[#7A7066] mb-3">{note}</p>}
      {!note && <div className="mb-2" />}
      {children}
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-xs text-[#7A7066] py-6 text-center">{children}</p>;
}

export default function AdminVisitors() {
  const { isAdminAuthenticated, isCheckingSession } = useAdmin();
  const [, navigate] = useLocation();
  const [days, setDays] = useState<number>(30);
  const [openVisit, setOpenVisit] = useState<string | null>(null);

  const { data, isLoading, isError, error } = trpc.admin.visitors.useQuery(
    { days },
    { enabled: isAdminAuthenticated, refetchInterval: 60_000 }
  );

  if (isCheckingSession) {
    return (
      <AdminLayout title="Visitors">
        <div className="flex items-center justify-center py-20 text-[#7A7066]">
          <Loader2 className="animate-spin mr-2" size={20} /> Checking your session…
        </div>
      </AdminLayout>
    );
  }

  if (!isAdminAuthenticated) { navigate('/admin/login'); return null; }

  if (isLoading) {
    return (
      <AdminLayout title="Visitors">
        <div className="flex items-center justify-center py-20 text-[#7A7066]">
          <Loader2 className="animate-spin mr-2" size={20} /> Counting your visitors…
        </div>
      </AdminLayout>
    );
  }

  if (isError || !data) {
    return (
      <AdminLayout title="Visitors">
        <div className="py-20 text-center text-red-600">
          {(error as any)?.message ?? 'Could not load visitor data'}
        </div>
      </AdminLayout>
    );
  }

  const s = data.summary;
  const series = (data.daily ?? []).map((d: any) => ({
    date: shortDate(d.date),
    Visitors: d.visitors,
    'Page views': d.views,
  }));

  const hasTraffic = s.viewsAllTime > 0;
  const maxPage = Math.max(1, ...(data.topPages ?? []).map((p: any) => p.views));
  const maxCountry = Math.max(1, ...(data.countries ?? []).map((c: any) => c.visitors));
  const maxReferrer = Math.max(1, ...(data.referrers ?? []).map((r: any) => r.visitors));
  const maxDevice = Math.max(1, ...(data.devices ?? []).map((d: any) => d.views));
  const maxBrowser = Math.max(1, ...(data.browsers ?? []).map((b: any) => b.views));

  const tiles = [
    { label: 'Visitors', value: s.visitors, note: `in the last ${data.rangeDays} days` },
    { label: 'Page views', value: s.views, note: `${s.viewsPerVisitor} per visitor` },
    { label: 'Visitors today', value: s.visitorsToday, note: `${s.viewsToday} views today` },
    { label: 'Repeat visitors', value: s.repeatVisitors, note: 'seen on more than one day' },
    { label: 'All-time views', value: s.viewsAllTime, note: `${s.visitorsAllTime} visitors tracked` },
  ];

  return (
    <AdminLayout title="Visitors">
      {/* Range filter — one row above the charts */}
      <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
        <p className="text-xs text-[#7A7066]">
          Tracking started when this feature was deployed, so earlier traffic is not counted.
          Views are kept for {data.retentionDays} days.
        </p>
        <div className="flex gap-1 bg-[#FAF7F2] rounded-lg p-1 border border-[#E8DDD0]">
          {RANGES.map((r) => (
            <button
              key={r.days}
              onClick={() => setDays(r.days)}
              className={`px-3 py-1 rounded-md text-xs font-semibold transition-colors ${
                days === r.days ? 'bg-[#C9A84C] text-[#2C2C2C]' : 'text-[#7A7066]'
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {!hasTraffic && (
        <div className="bg-[#FAF7F2] border border-[#E8DDD0] rounded-xl p-4 mb-6 flex gap-3">
          <Info size={16} className="text-[#C9A84C] shrink-0 mt-0.5" />
          <div className="text-xs text-[#7A7066]">
            <p className="font-semibold text-[#2C2C2C] mb-1">No visits recorded yet</p>
            <p>
              Every figure here stays at zero until someone loads a storefront page. Your own
              visits to <span className="font-mono">/admin</span> are deliberately not counted, and
              known crawlers are filtered out — so open the shop in a normal browser tab to see
              the first row appear.
            </p>
          </div>
        </div>
      )}

      {/* Summary tiles */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 mb-6">
        {tiles.map((t) => (
          <div key={t.label} className="bg-white rounded-xl border border-[#E8DDD0] p-4">
            <p className="text-xl font-bold text-[#2C2C2C] tabular-nums">{t.value.toLocaleString()}</p>
            <p className="text-xs text-[#7A7066] mt-0.5">{t.label}</p>
            <p className="text-xs text-[#7A7066] mt-1">{t.note}</p>
          </div>
        ))}
      </div>

      {/* Trend — two series, one axis, legend always present */}
      <div className="bg-white rounded-xl border border-[#E8DDD0] p-5 mb-6 shadow-sm">
        <h3 className="font-bold text-[#2C2C2C] mb-4">Visitors &amp; page views</h3>
        <div style={{ width: '100%', height: 280 }}>
          <ResponsiveContainer>
            <LineChart data={series} margin={{ top: 4, right: 8, bottom: 0, left: -12 }}>
              <CartesianGrid stroke={GRID} vertical={false} />
              <XAxis
                dataKey="date"
                tick={{ fill: AXIS_INK, fontSize: 11 }}
                stroke={GRID}
                interval="preserveStartEnd"
                minTickGap={24}
              />
              <YAxis tick={{ fill: AXIS_INK, fontSize: 11 }} stroke={GRID} allowDecimals={false} />
              <Tooltip contentStyle={tooltipStyle} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Line
                type="monotone" dataKey="Visitors" stroke={SERIES_VISITORS}
                strokeWidth={2} dot={false} activeDot={{ r: 4 }}
              />
              <Line
                type="monotone" dataKey="Page views" stroke={SERIES_VIEWS}
                strokeWidth={2} dot={false} activeDot={{ r: 4 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <Panel title="Most visited pages" note="Page views in the selected range">
          {(data.topPages ?? []).length === 0 ? (
            <Empty>No page views yet.</Empty>
          ) : (
            data.topPages.map((p: any) => (
              <BarRow
                key={p.path}
                label={<span className="font-mono">{p.path}</span>}
                value={p.views}
                max={maxPage}
                sub={`views · ${p.visitors} visitors`}
              />
            ))
          )}
        </Panel>

        <Panel
          title="Where visitors are"
          note={
            data.cityAvailable
              ? 'Country and city, from Cloudflare'
              : 'Country, from Cloudflare. City needs a paid Cloudflare plan or a local GeoIP database.'
          }
        >
          {(data.countries ?? []).length === 0 ? (
            <Empty>No location data yet.</Empty>
          ) : (
            data.countries.map((c: any) => (
              <BarRow
                key={c.country}
                label={
                  <span>
                    <span className="mr-1.5">{countryFlag(c.country)}</span>
                    {countryName(c.country)}
                  </span>
                }
                value={c.visitors}
                max={maxCountry}
                sub={`visitors · ${c.views} views`}
              />
            ))
          )}
        </Panel>

        <Panel title="How they found you" note="Referring site of the first page in a visit">
          {(data.referrers ?? []).length === 0 ? (
            <Empty>
              No referrals yet — visitors arriving directly, by typing the address or from a
              bookmark, have no referring site.
            </Empty>
          ) : (
            data.referrers.map((r: any) => (
              <BarRow key={r.host} label={r.host} value={r.visitors} max={maxReferrer} sub="visitors" />
            ))
          )}
        </Panel>

        <Panel title="Devices & browsers">
          {(data.devices ?? []).length === 0 ? (
            <Empty>No device data yet.</Empty>
          ) : (
            <>
              <div className="mb-4">
                {data.devices.map((d: any) => (
                  <BarRow key={d.device} label={<span className="capitalize">{d.device}</span>} value={d.views} max={maxDevice} sub="views" />
                ))}
              </div>
              {(data.browsers ?? []).length > 0 && (
                <>
                  <p className="text-xs font-semibold text-[#7A7066] mt-4 mb-1">Browsers</p>
                  {data.browsers.map((b: any) => (
                    <BarRow key={b.browser} label={b.browser} value={b.views} max={maxBrowser} sub="views" />
                  ))}
                </>
              )}
            </>
          )}
        </Panel>
      </div>

      {/* Per-visit log */}
      <div className="bg-white rounded-xl border border-[#E8DDD0] shadow-sm overflow-hidden">
        <div className="p-5 pb-3">
          <h3 className="font-bold text-[#2C2C2C] mb-1">Recent visits</h3>
          <p className="text-xs text-[#7A7066]">
            One row per visit — a run of pages viewed by the same visitor with no 30-minute gap.
            Click a row to see the path they took. The visitor ID is a one-way hash, not an IP
            address: it tells repeat visits apart without identifying anyone.
          </p>
        </div>

        {(data.recentVisits ?? []).length === 0 ? (
          <Empty>No visits recorded yet.</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-[#FAF7F2] text-[#7A7066]">
                <tr>
                  <th className="text-left font-semibold px-4 py-2 w-6" />
                  <th className="text-left font-semibold px-2 py-2">When</th>
                  <th className="text-left font-semibold px-2 py-2">Location</th>
                  <th className="text-left font-semibold px-2 py-2">Landed on</th>
                  <th className="text-left font-semibold px-2 py-2">From</th>
                  <th className="text-left font-semibold px-2 py-2">Device</th>
                  <th className="text-right font-semibold px-2 py-2">Pages</th>
                  <th className="text-right font-semibold px-4 py-2">Stayed</th>
                </tr>
              </thead>
              <tbody>
                {data.recentVisits.map((v: any) => {
                  const key = `${v.visitorId}-${v.startedAt}`;
                  const isOpen = openVisit === key;
                  return (
                    <Fragment key={key}>
                      <tr
                        onClick={() => setOpenVisit(isOpen ? null : key)}
                        className="border-t border-[#E8DDD0] cursor-pointer hover:bg-[#FAF7F2]"
                      >
                        <td className="px-4 py-2 text-[#7A7066]">
                          {isOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                        </td>
                        <td className="px-2 py-2 text-[#2C2C2C] whitespace-nowrap" title={new Date(v.startedAt).toLocaleString()}>
                          {whenRelative(v.startedAt)}
                        </td>
                        <td className="px-2 py-2 text-[#2C2C2C] whitespace-nowrap">
                          {v.country ? (
                            <>
                              <span className="mr-1">{countryFlag(v.country)}</span>
                              {v.city ? `${v.city}, ` : ''}
                              {countryName(v.country)}
                            </>
                          ) : (
                            <span className="text-[#7A7066] inline-flex items-center gap-1">
                              <Globe size={11} /> Unknown
                            </span>
                          )}
                        </td>
                        <td className="px-2 py-2 font-mono text-[#2C2C2C] max-w-[180px] truncate" title={v.landingPath}>
                          {v.landingPath}
                        </td>
                        <td className="px-2 py-2 text-[#7A7066]">{v.referrerHost ?? 'direct'}</td>
                        <td className="px-2 py-2 text-[#7A7066] whitespace-nowrap capitalize">
                          {v.device}
                          {v.browser ? ` · ${v.browser}` : ''}
                          {v.os ? ` · ${v.os}` : ''}
                        </td>
                        <td className="px-2 py-2 text-right text-[#2C2C2C] tabular-nums">{v.pageCount}</td>
                        <td className="px-4 py-2 text-right text-[#7A7066] tabular-nums whitespace-nowrap">
                          {duration(v.durationSeconds)}
                        </td>
                      </tr>
                      {isOpen && (
                        <tr className="bg-[#FAF7F2] border-t border-[#E8DDD0]">
                          <td />
                          <td colSpan={7} className="px-2 py-3">
                            <p className="text-[#7A7066] mb-2">
                              Visitor <span className="font-mono">{v.visitorId}</span> · path through the store:
                            </p>
                            <ol className="flex flex-wrap items-center gap-1.5">
                              {v.paths.map((p: string, idx: number) => (
                                <li key={`${p}-${idx}`} className="flex items-center gap-1.5">
                                  <span className="font-mono bg-white border border-[#E8DDD0] rounded px-1.5 py-0.5 text-[#2C2C2C]">
                                    {p}
                                  </span>
                                  {idx < v.paths.length - 1 && <ChevronRight size={11} className="text-[#7A7066]" />}
                                </li>
                              ))}
                            </ol>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
