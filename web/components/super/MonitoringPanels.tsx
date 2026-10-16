import Link from 'next/link';
import Icon, { type IconName } from '@/components/icons/Icon';
import { fmtDateTime } from '@/lib/format';
import {
  formatBytes, formatDuration, timeAgo, percent, CRON_SCHEDULE, EVENT_LABELS, SUSPICIOUS,
  type Check, type CheckStatus,
} from '@/lib/monitorChecks';
import type { MonitoringSnapshot, Safe } from '@/lib/systemMonitor';
import { Alert, Kpi, Pill, type PillTone } from './ui';
import CronRunButton from './CronRunButton';

/* ── Umumiy kichik bloklar ─────────────────────────────── */

function Kv({ k, v, mono }: { k: string; v: React.ReactNode; mono?: boolean }) {
  return (
    <div className="sa-mon-kv">
      <span>{k}</span>
      <b>{mono ? <code>{v}</code> : v}</b>
    </div>
  );
}

function Section({ id, title, sub, children, right }: { id: string; title: string; sub?: React.ReactNode; children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <section className="sa-card" id={id}>
      <div className="sa-card-h">
        <div>
          <h2>{title}</h2>
          {sub && <p>{sub}</p>}
        </div>
        {right}
      </div>
      {children}
    </section>
  );
}

function Failed({ label, error }: { label: string; error: string }) {
  return <div className="sa-card-b"><Alert tone="error">{label} ma&apos;lumoti olinmadi: {error}</Alert></div>;
}

const CHECK_ICON: Record<CheckStatus, IconName> = { ok: 'check', warn: 'alert', bad: 'close', info: 'bell' };
const TAG_TONE: Record<string, string> = { ok: 'sa-mon-tag--ok', warn: 'sa-mon-tag--warn', bad: 'sa-mon-tag--bad', off: 'sa-mon-tag--off', late: 'sa-mon-tag--warn', failed: 'sa-mon-tag--bad', never: '' };

function Tag({ tone, children }: { tone?: string; children: React.ReactNode }) {
  return <span className={`sa-mon-tag ${tone ? TAG_TONE[tone] ?? '' : ''}`}>{children}</span>;
}

function Bar({ label, used, total, note }: { label: string; used: number; total: number; note?: string }) {
  const pct = percent(used, total);
  return (
    <div className="sa-mon-bar">
      <div className="sa-mon-bar-h">
        <b>{label}</b>
        <span>{formatBytes(used)} / {formatBytes(total)} · {pct}%{note ? ` · ${note}` : ''}</span>
      </div>
      <span className="sa-prog"><i className={pct >= 90 ? 'is-bad' : pct >= 80 ? 'is-warn' : ''} style={{ width: `${pct}%` }} /></span>
    </div>
  );
}

/* ── 1. Umumiy holat ───────────────────────────────────── */

export function OverallPanel({ s }: { s: MonitoringSnapshot }) {
  const st = s.overall.status;
  const label = st === 'ok' ? 'Hammasi joyida' : st === 'warn' ? "E'tibor talab qiladi" : 'Jiddiy muammo';
  const p = s.process.data;
  const d = s.db.data;
  const o = s.os.data;
  const disk = s.disk.data?.mounts[0];
  const memUsed = o ? (o.containerMemLimit && o.containerMemUsage != null ? o.containerMemUsage : o.totalMem - o.freeMem) : null;
  const memTotal = o ? (o.containerMemLimit ?? o.totalMem) : null;
  const sec = s.security.data;
  const logs = s.logs.data;
  return (
    <>
      <div className="sa-hero-row">
        <div className={`sa-mon-status sa-mon-status--${st}`} role="status">
          <div className="sa-mon-status-h"><Icon name={st === 'ok' ? 'check' : 'alert'} size={16} /> Platforma holati</div>
          <div className="sa-mon-status-v">{label}</div>
          {s.overall.reasons.length > 0 ? (
            <ul>{s.overall.reasons.map((r) => <li key={r}>{r}</li>)}</ul>
          ) : (
            <p>Baza, disk, xotira, cron va xavfsizlik tekshiruvlari me&apos;yorda.</p>
          )}
        </div>
        <div className="ux-strip sa-strip-3">
          <Kpi label="Ilova ishlayapti" value={formatDuration(p?.uptimeSec)} icon="clock" tone="b" delta={p ? `${p.instance} · v${p.version ?? 'dev'}` : '—'} />
          <Kpi label="MongoDB" value={d ? `${d.pingMs} ms` : 'yo\'q'} icon="box" tone={d ? 'o' : 'r'} delta={d ? `v${d.version ?? '?'} · ${d.server ? `${d.server.connectionsCurrent} ulanish` : 'ping OK'}` : s.db.error ?? ''} deltaTone={d ? 'ok' : 'bad'} />
          <Kpi label="Xotira (RAM)" value={memUsed != null && memTotal ? `${percent(memUsed, memTotal)}%` : '—'} icon="chart" tone="v" delta={memUsed != null && memTotal ? `${formatBytes(memUsed)} / ${formatBytes(memTotal)}${o?.containerMemLimit ? ' (konteyner)' : ''}` : ''} deltaTone={memUsed != null && memTotal && percent(memUsed, memTotal) >= 90 ? 'bad' : undefined} />
        </div>
      </div>
      <div className="ux-strip sa-strip-3">
        <Kpi label="Disk" value={disk ? `${disk.usedPct}%` : '—'} icon="download" tone={disk && disk.usedPct >= 90 ? 'r' : disk && disk.usedPct >= 80 ? 'a' : 'c'} delta={disk ? `${formatBytes(disk.free)} bo'sh` : ''} />
        <Kpi label="Server xatolari · 24 soat" value={logs?.errors24h ?? '—'} icon="alert" tone={logs && logs.errors24h > 0 ? 'a' : 'g'} delta={logs ? `7 kunda ${logs.errors7d}` : ''} deltaTone={logs && logs.errors24h >= 50 ? 'warn' : undefined} />
        <Kpi label="Shubhali urinishlar · 24 soat" value={sec?.last24h.suspicious ?? '—'} icon="shield" tone={sec && sec.attackers.length ? 'r' : sec && sec.last24h.suspicious > 0 ? 'a' : 'g'} delta={sec ? (sec.attackers.length ? `${sec.attackers.length} ta IP hujum belgisi` : `7 kunda ${sec.last7d.suspicious}`) : ''} deltaTone={sec?.attackers.length ? 'bad' : undefined} />
      </div>
    </>
  );
}

export function SectionNav() {
  const items: [string, string][] = [
    ['server', 'Server'], ['db', 'Baza'], ['disk', 'Disk va zaxira'], ['audit', 'Xavfsizlik auditi'], ['events', 'Hodisalar'],
    ['errors', 'Xatolar'], ['cron', 'Cron'], ['integrations', 'Integratsiyalar'], ['tenants', "Do'kon bazalari"],
  ];
  return (
    <nav className="sa-mon-nav" aria-label="Bo'limlar">
      {items.map(([id, l]) => <a key={id} href={`#${id}`}>{l}</a>)}
    </nav>
  );
}

/* ── 2. Server ─────────────────────────────────────────── */

export function ServerPanel({ proc, os }: { proc: Safe<MonitoringSnapshot['process']['data'] & object>; os: Safe<MonitoringSnapshot['os']['data'] & object> }) {
  const p = proc.data;
  const o = os.data;
  return (
    <div className="sa-two" id="server">
      <Section title="Ilova jarayoni (Node.js)" id="server-proc" sub="Joriy nusxa — bir nechta nusxa bo'lsa har yangilashda boshqasi ko'rinishi mumkin">
        {!p ? <Failed label="Jarayon" error={proc.error ?? ''} /> : (
          <div>
            <Kv k="Node.js / Next.js" v={`${p.node} / ${p.nextVersion ?? '?'}`} />
            <Kv k="Reliz (APP_VERSION)" v={p.version ?? 'dev'} mono />
            <Kv k="Nusxa (host:pid)" v={p.instance} mono />
            <Kv k="Ishga tushgan" v={`${fmtDateTime(p.startedAt)} (${formatDuration(p.uptimeSec)})`} />
            <Kv k="Rejim" v={<Tag tone={p.nodeEnv === 'production' ? 'ok' : 'warn'}>{p.nodeEnv}</Tag>} />
            <Kv k="Server vaqti / zona" v={`${fmtDateTime(p.serverTime)} · ${p.timezone}`} />
            <Kv k="Heap (V8)" v={`${formatBytes(p.heapUsed)} / ${formatBytes(p.heapTotal)}`} />
            <Kv k="RSS (jarayon xotirasi)" v={formatBytes(p.rss)} />
            <Kv k="Event loop kechikishi" v={<Tag tone={p.eventLoopLagMs > 100 ? 'bad' : p.eventLoopLagMs > 30 ? 'warn' : 'ok'}>{p.eventLoopLagMs} ms</Tag>} />
            <Kv k="CPU vaqti (user / system)" v={`${formatDuration(p.cpuUserMs / 1000)} / ${formatDuration(p.cpuSystemMs / 1000)}`} />
          </div>
        )}
      </Section>
      <Section title="Operatsion tizim" id="server-os">
        {!o ? <Failed label="OS" error={os.error ?? ''} /> : (
          <div>
            <Kv k="Host" v={`${o.hostname}${o.inDocker ? ' (Docker)' : ''}`} mono />
            <Kv k="Tizim" v={`${o.platform} ${o.release} · ${o.arch}`} />
            <Kv k="CPU" v={`${o.cpus} yadro · ${o.cpuModel}`} />
            <Kv k="Yuklama (1 / 5 / 15 daq)" v={<Tag tone={o.load1 > o.cpus ? 'bad' : o.load1 > o.cpus * 0.7 ? 'warn' : 'ok'}>{o.load1} / {o.load5} / {o.load15}</Tag>} />
            <Kv k="RAM (host)" v={`${formatBytes(o.totalMem - o.freeMem)} / ${formatBytes(o.totalMem)} band`} />
            {o.containerMemLimit && <Kv k="Konteyner limiti" v={`${formatBytes(o.containerMemUsage ?? 0)} / ${formatBytes(o.containerMemLimit)}`} />}
            <Kv k="OS ishlayapti" v={formatDuration(o.osUptimeSec)} />
          </div>
        )}
      </Section>
    </div>
  );
}

/* ── 3. Baza ───────────────────────────────────────────── */

export function DbPanel({ db }: { db: MonitoringSnapshot['db'] }) {
  const d = db.data;
  return (
    <Section id="db" title="MongoDB" sub="Ulanish, server holati va hajmlar. Ulanish satri va parol ko'rsatilmaydi.">
      {!d ? <Failed label="MongoDB" error={db.error ?? ''} /> : (
        <div className="sa-two" style={{ padding: '0 0 4px' }}>
          <div>
            <Kv k="Holat" v={<Tag tone="ok">ulangan · ping {d.pingMs} ms</Tag>} />
            <Kv k="Versiya / dvigatel" v={`${d.version ?? '?'} · ${d.server?.storageEngine ?? '?'}`} />
            <Kv k="Master baza" v={d.masterDb} mono />
            {d.server && <>
              <Kv k="Mongo ishlayapti" v={formatDuration(d.server.uptimeSec)} />
              <Kv k="Ulanishlar (band / bo'sh)" v={`${d.server.connectionsCurrent} / ${d.server.connectionsAvailable}`} />
              <Kv k="Operatsiyalar (ins / qry / upd / del)" v={`${d.server.opInsert} / ${d.server.opQuery} / ${d.server.opUpdate} / ${d.server.opDelete}`} />
              <Kv k="Mongo xotirasi (resident)" v={`${d.server.residentMb} MB`} />
              <Kv k="Autentifikatsiya" v={<Tag tone={d.server.authEnabled ? 'ok' : d.server.authEnabled === false ? 'warn' : ''}>{d.server.authEnabled ? 'yoqilgan' : d.server.authEnabled === false ? "o'chiq" : "noma'lum"}</Tag>} />
            </>}
            {d.permissionNote && <div className="sa-mon-help">{d.permissionNote}</div>}
          </div>
          <div>
            {d.master && <>
              <Kv k="Master: kolleksiyalar / hujjatlar" v={`${d.master.collections} / ${d.master.objects.toLocaleString('uz-UZ')}`} />
              <Kv k="Master: ma'lumot / disk / indeks" v={`${formatBytes(d.master.dataSize)} / ${formatBytes(d.master.storageSize)} / ${formatBytes(d.master.indexSize)}`} />
            </>}
            <Kv k="Barcha bazalar diskda" v={formatBytes(d.totalSizeOnDisk)} />
            <Kv k="Bazalar soni" v={d.databases ? d.databases.length : '—'} />
            {d.databases && d.databases.slice(0, 6).map((x) => <Kv key={x.name} k={x.name} v={formatBytes(x.sizeOnDisk)} />)}
          </div>
        </div>
      )}
    </Section>
  );
}

/* ── 4. Disk va zaxira ─────────────────────────────────── */

export function DiskPanel({ disk, backup }: { disk: MonitoringSnapshot['disk']; backup: MonitoringSnapshot['backup'] }) {
  const d = disk.data;
  const b = backup.data;
  const backupAge = b?.latest ? Date.now() - b.latest.at.getTime() : null;
  return (
    <div className="sa-two" id="disk">
      <Section id="disk-mounts" title="Disk" sub="Ilova, yuklamalar va zaxira joylashgan bo'limlar">
        {!d ? <Failed label="Disk" error={disk.error ?? ''} /> : (
          <div>
            {d.mounts.map((m) => <Bar key={m.path} label={m.label} used={m.total - m.free} total={m.total} note={m.path} />)}
            {d.mounts.length === 0 && <div className="sa-empty">Disk ma&apos;lumoti olinmadi</div>}
            {d.uploads && <Kv k="Lokal yuklamalar (public/uploads)" v={`${d.uploads.files.toLocaleString('uz-UZ')}${d.uploads.truncated ? '+' : ''} fayl · ${formatBytes(d.uploads.bytes)}`} />}
          </div>
        )}
      </Section>
      <Section id="backup" title="Zaxira (backup)" sub="scripts/backup.mjs — master + barcha do'kon bazalari (BACKUP.md)">
        {!b ? <Failed label="Zaxira" error={backup.error ?? ''} /> : (
          <div>
            <Kv k="Papka" v={b.dir} mono />
            <Kv k="Holat" v={!b.exists ? <Tag tone="bad">papka yo&apos;q</Tag> : !b.latest ? <Tag tone="bad">zaxira yo&apos;q</Tag> : <Tag tone={backupAge! < 1.5 * 864e5 ? 'ok' : backupAge! < 3 * 864e5 ? 'warn' : 'bad'}>{timeAgo(b.latest.at)}</Tag>} />
            {b.latest && <>
              <Kv k="Oxirgi zaxira" v={`${b.latest.name} · ${fmtDateTime(b.latest.at)}`} />
              <Kv k="Hajmi" v={`${b.latest.files} fayl · ${formatBytes(b.latest.bytes)}`} />
            </>}
            <Kv k="Saqlanadigan nusxalar" v={`${b.count} ta · ${b.keepDays} kun`} />
            <div className="sa-mon-help">Tiklab ko&apos;rilmagan zaxira — ishonchli emas. Oyiga bir marta test serverda <code>npm run restore</code> bilan tekshiring.</div>
          </div>
        )}
      </Section>
    </div>
  );
}

/* ── 5. Xavfsizlik auditi ──────────────────────────────── */

export function AuditPanel({ checks, summary }: { checks: Check[]; summary: MonitoringSnapshot['postureSummary'] }) {
  const order: CheckStatus[] = ['bad', 'warn', 'ok', 'info'];
  const sorted = [...checks].sort((a, b) => order.indexOf(a.status) - order.indexOf(b.status));
  return (
    <Section
      id="audit"
      title="Xavfsizlik auditi"
      sub="Muhit, sirlar, sarlavhalar, zaxira va kirish himoyasi — sir qiymatlari ko'rsatilmaydi"
      right={<div className="sa-legend"><span><Tag tone="bad">{summary.bad} xato</Tag></span><span><Tag tone="warn">{summary.warn} ogoh</Tag></span><span><Tag tone="ok">{summary.ok} OK</Tag></span></div>}
    >
      <div>
        {sorted.map((c, i) => (
          <div key={`${c.key}-${i}`} className="sa-mon-check">
            <span className={`sa-mon-chk sa-mon-chk--${c.status}`} aria-label={c.status}><Icon name={CHECK_ICON[c.status]} size={13} strokeWidth={2.6} /></span>
            <div>
              <b>{c.label}</b>
              <p>{c.detail}</p>
              {c.fix && <small>{c.fix}</small>}
            </div>
          </div>
        ))}
      </div>
    </Section>
  );
}

/* ── 6. Xavfsizlik hodisalari ──────────────────────────── */

const EVENT_TONE: Partial<Record<string, PillTone>> = { login_ok: 'ok', super_login_ok: 'br', reset_done: 'ok', login_blocked: 'bad', cron_forbidden: 'bad', telegram_forbidden: 'bad', super_login_fail: 'bad', login_fail: 'warn', tg_login_fail: 'warn', reset_request: 'gold' };

export function EventsPanel({ sec }: { sec: MonitoringSnapshot['security'] }) {
  const s = sec.data;
  if (!s) return <Section id="events" title="Xavfsizlik hodisalari"><Failed label="Hodisalar" error={sec.error ?? ''} /></Section>;
  const types = Object.entries(s.last24h.byType).sort((a, b) => b[1]! - a[1]!);
  return (
    <section className="sa-stack" id="events">
      {s.attackers.length > 0 && (
        <Alert tone="error">
          <b>Brute-force belgisi:</b> {s.attackers.join(', ')} — 24 soatda 20+ shubhali urinish. Bloklash: <code className="sa-code">sudo ufw deny from &lt;IP&gt;</code> (RUNBOOK §3).
        </Alert>
      )}
      <div className="sa-two">
        <Section id="events-24" title="Hodisalar · 24 soat" sub="Login urinishlari, parol tiklash, ruxsatsiz cron/webhook so'rovlari (30 kun saqlanadi)">
          <div>
            {types.length === 0 && <div className="sa-empty">So&apos;nggi 24 soatda hodisa yo&apos;q</div>}
            {types.map(([t, n]) => <Kv key={t} k={EVENT_LABELS[t as keyof typeof EVENT_LABELS] ?? t} v={<Pill tone={EVENT_TONE[t] ?? 'mut'}>{n}</Pill>} />)}
            <Kv k="Rate-limit (xotirada, shu nusxa)" v={`${s.rateLimit.keys} kalit · ${s.rateLimit.blocked} bloklangan`} />
          </div>
        </Section>
        <Section id="events-ips" title="Eng faol IP manzillar · 24 soat" sub="Faqat shubhali hodisalar bo'yicha">
          {s.last24h.topIps.length === 0 ? <div className="sa-empty">Shubhali urinish yo&apos;q</div> : (
            <div className="sa-table-wrap">
              <table className="sa-table">
                <thead><tr><th>IP</th><th className="sa-td-r">Urinish</th><th className="sa-td-r">Loginlar</th></tr></thead>
                <tbody>
                  {s.last24h.topIps.map((r) => (
                    <tr key={r.ip} className={s.attackers.includes(r.ip) ? 'sa-mon-attack' : undefined}>
                      <td><span className="sa-mon-ip">{r.ip}</span></td>
                      <td className="sa-td-r"><b>{r.count}</b></td>
                      <td className="sa-td-r">{r.users}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Section>
      </div>
      <Section id="events-recent" title="So'nggi hodisalar" sub="Oxirgi 60 ta">
        {s.recent.length === 0 ? <div className="sa-empty">Hali hodisa yozilmagan</div> : (
          <div className="sa-table-wrap">
            <table className="sa-table">
              <thead><tr><th>Vaqt</th><th>Hodisa</th><th>Login</th><th>Do&apos;kon</th><th>IP</th><th>Izoh</th></tr></thead>
              <tbody>
                {s.recent.map((e) => (
                  <tr key={e._id}>
                    <td style={{ whiteSpace: 'nowrap' }}>{fmtDateTime(e.at)}</td>
                    <td><Pill tone={EVENT_TONE[e.type] ?? 'mut'}>{EVENT_LABELS[e.type] ?? e.type}</Pill></td>
                    <td>{e.username || '—'}</td>
                    <td>{e.slug || (e.zone === 'super' ? 'super' : '—')}</td>
                    <td><span className="sa-mon-ip">{e.ip || '—'}</span></td>
                    <td><span className="sa-td-sub">{e.note || e.path || (e.userAgent ? e.userAgent.slice(0, 60) : '')}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </section>
  );
}

/* ── 7. Xatolar jurnali ────────────────────────────────── */

export function ErrorsPanel({ logs }: { logs: MonitoringSnapshot['logs'] }) {
  const l = logs.data;
  if (!l) return <Section id="errors" title="Server xatolari"><Failed label="Xatolar" error={logs.error ?? ''} /></Section>;
  return (
    <div className="sa-two" id="errors">
      <Section id="errors-recent" title="Server xatolari" sub="lib/logger → system_logs (14 kun). Konsol/ERROR_WEBHOOK_URL bilan bir xil manba." right={<div className="sa-legend"><span>24 soat: <b>{l.errors24h}</b> xato, <b>{l.warns24h}</b> ogoh</span></div>}>
        {l.recent.length === 0 ? <div className="sa-empty"><Icon name="check" size={22} /> Xato yozilmagan</div> : (
          <div>
            {l.recent.map((r) => (
              <div key={r._id} className="sa-mon-log">
                <div className="sa-mon-log-h">
                  <Tag tone={r.level === 'error' ? 'bad' : 'warn'}>{r.level === 'error' ? 'xato' : 'ogoh'}</Tag>
                  <b>{r.msg}</b>
                  <time dateTime={new Date(r.at).toISOString()}>{fmtDateTime(r.at)}{r.instance ? ` · ${r.instance}` : ''}</time>
                </div>
                {r.error && <div className="sa-mon-log-e">{r.error}</div>}
                {(r.stack || r.meta) && (
                  <details>
                    <summary>Tafsilot</summary>
                    <pre>{[r.meta ? JSON.stringify(r.meta, null, 1) : '', r.stack ?? ''].filter(Boolean).join('\n\n')}</pre>
                  </details>
                )}
              </div>
            ))}
          </div>
        )}
      </Section>
      <Section id="errors-top" title="Eng ko'p takrorlangan · 7 kun">
        {l.top.length === 0 ? <div className="sa-empty">Ma&apos;lumot yo&apos;q</div> : (
          <div>{l.top.map((t) => <Kv key={t.msg} k={t.msg} v={<><b>{t.n}</b> <small style={{ color: 'var(--ink-3)', fontWeight: 400 }}>· {timeAgo(t.last)}</small></>} />)}</div>
        )}
        <div className="sa-mon-help" style={{ paddingBottom: 12 }}>
          Serverda to&apos;liq log: <code>docker compose logs --since 1h app_a app_b | grep &apos;&quot;level&quot;:&quot;error&quot;&apos;</code>
        </div>
      </Section>
    </div>
  );
}

/* ── 8. Cron ───────────────────────────────────────────── */

const CRON_STATE_LABEL = { ok: 'bajarildi', late: 'kechikdi', failed: 'xato', never: 'hech qachon' } as const;

export function CronPanel({ cron }: { cron: MonitoringSnapshot['cron'] }) {
  const c = cron.data;
  if (!c) return <Section id="cron" title="Cron ishlari"><Failed label="Cron" error={cron.error ?? ''} /></Section>;
  return (
    <section className="sa-stack" id="cron">
      {!c.secretSet && <Alert tone="error">CRON_SECRET o&apos;rnatilmagan — /api/cron/* so&apos;rovlari rad etiladi.</Alert>}
      <div className="sa-mon-cron">
        {c.jobs.map((j) => {
          const meta = CRON_SCHEDULE[j.job];
          return (
            <div key={j.job} className="sa-card">
              <h3>{meta.label} <Tag tone={j.state}>{CRON_STATE_LABEL[j.state]}</Tag></h3>
              <p>{meta.desc} · har kuni {meta.time}</p>
              <dl>
                <dt>Oxirgi</dt><dd>{j.last ? `${timeAgo(j.last.startedAt)} (${j.last.trigger === 'manual' ? "qo'lda" : 'cron'})` : '—'}</dd>
                <dt>Davomiyligi</dt><dd>{j.last?.durationMs != null ? `${j.last.durationMs} ms` : '—'}</dd>
                <dt>7 kun</dt><dd>{j.runs7d} marta{j.fails7d ? `, ${j.fails7d} xato` : ''}</dd>
                {j.last?.result && <><dt>Natija</dt><dd><code className="sa-code">{JSON.stringify(j.last.result).slice(0, 80)}</code></dd></>}
                {j.last?.error && <><dt>Xato</dt><dd className="sa-mon-err">{j.last.error}</dd></>}
              </dl>
              <CronRunButton job={j.job} />
            </div>
          );
        })}
      </div>
      <Section id="cron-recent" title="Cron tarixi" sub="Oxirgi 30 ta bajarilish (90 kun saqlanadi). Serverdagi crontab: deploy/crontab.example">
        {c.recent.length === 0 ? <div className="sa-empty">Hali bajarilmagan. Cron serverda sozlanganini tekshiring (<code className="sa-code">crontab -l</code>).</div> : (
          <div className="sa-table-wrap">
            <table className="sa-table">
              <thead><tr><th>Vaqt</th><th>Ish</th><th>Holat</th><th className="sa-td-r">Davomiyligi</th><th>Manba</th><th>Natija</th></tr></thead>
              <tbody>
                {c.recent.map((r) => (
                  <tr key={r._id}>
                    <td style={{ whiteSpace: 'nowrap' }}>{fmtDateTime(r.startedAt)}</td>
                    <td>{CRON_SCHEDULE[r.job]?.label ?? r.job}</td>
                    <td><Tag tone={r.ok ? 'ok' : 'bad'}>{r.ok ? 'OK' : 'xato'}</Tag></td>
                    <td className="sa-td-r">{r.durationMs ?? '—'} ms</td>
                    <td>{r.trigger === 'manual' ? "qo'lda" : 'cron'}{r.instance ? <span className="sa-td-sub">{r.instance}</span> : null}</td>
                    <td><span className="sa-td-sub">{r.error ?? (r.result ? JSON.stringify(r.result).slice(0, 100) : '')}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </section>
  );
}

/* ── 9. Integratsiyalar + Telegram ─────────────────────── */

export function IntegrationsPanel({ integrations, telegram }: { integrations: MonitoringSnapshot['integrations']; telegram: MonitoringSnapshot['telegram'] }) {
  const t = telegram.data;
  return (
    <div className="sa-two" id="integrations">
      <Section id="integrations-list" title="Integratsiyalar" sub="Qaysi tashqi servislar sozlangan (.env). Kalitlar ko'rsatilmaydi.">
        <div>
          {integrations.map((i) => <Kv key={i.key} k={i.label} v={<><Tag tone={i.status}>{i.status === 'ok' ? 'ulangan' : i.status === 'warn' ? 'qisman' : "o'chiq"}</Tag> <small style={{ color: 'var(--ink-3)', fontWeight: 400 }}>{i.detail}</small></>} />)}
        </div>
      </Section>
      <Section id="telegram" title="Telegram webhook" sub="Jonli tekshiruv: getWebhookInfo / getMe (3 s)">
        {!t ? <Failed label="Telegram" error={telegram.error ?? ''} /> : !t.configured ? <div className="sa-empty">Bot sozlanmagan (TELEGRAM_BOT_TOKEN yo&apos;q)</div> : (
          <div>
            {t.error && <div className="sa-card-b"><Alert tone="error">{t.error}</Alert></div>}
            <Kv k="Bot" v={t.botUsername ?? '—'} mono />
            <Kv k="Webhook manzili" v={t.webhookUrl ? <Tag tone="ok">{t.webhookUrl}</Tag> : <Tag tone="bad">o&apos;rnatilmagan</Tag>} />
            <Kv k="Imzo (secret_token)" v={<Tag tone={t.hasSecret ? 'ok' : 'bad'}>{t.hasSecret ? 'bor' : "yo'q"}</Tag>} />
            <Kv k="Navbatdagi yangilanishlar" v={t.pendingUpdates != null ? <Tag tone={t.pendingUpdates > 50 ? 'warn' : ''}>{t.pendingUpdates}</Tag> : '—'} />
            <Kv k="Oxirgi xato" v={t.lastError ? <span className="sa-mon-err">{fmtDateTime(t.lastError.at)}: {t.lastError.message}</span> : <Tag tone="ok">yo&apos;q</Tag>} />
            <Kv k="Super admin chat (TELEGRAM_CHAT_ID)" v={<Tag tone={t.chatIdSet ? 'ok' : 'warn'}>{t.chatIdSet ? 'sozlangan' : "yo'q"}</Tag>} />
          </div>
        )}
      </Section>
    </div>
  );
}

/* ── 10. Do'kon bazalari ───────────────────────────────── */

export function TenantsPanel({ tenants }: { tenants: MonitoringSnapshot['tenants'] }) {
  const t = tenants.data;
  if (!t) return <Section id="tenants" title="Do'kon bazalari"><Failed label="Do'kon bazalari" error={tenants.error ?? ''} /></Section>;
  const statusLabel: Record<string, string> = { active: 'faol', expired: 'muddati tugagan', suspended: "to'xtatilgan" };
  return (
    <Section id="tenants" title="Do'kon bazalari" sub="Har do'kon alohida MongoDB bazasi (database-per-tenant). Hajm bo'yicha eng kattalari." right={<div className="sa-legend">{Object.entries(t.byStatus).map(([k, n]) => <span key={k}>{statusLabel[k] ?? k}: <b>{n}</b></span>)}</div>}>
      {(t.orphanDbs.length > 0 || t.missingDbs.length > 0) && (
        <div className="sa-card-b" style={{ paddingBottom: 0 }}>
          {t.orphanDbs.length > 0 && <Alert tone="warn">Egasiz bazalar (Organization yozuvi yo&apos;q): {t.orphanDbs.join(', ')} — o&apos;chirilgan do&apos;kon qoldig&apos;i bo&apos;lishi mumkin.</Alert>}
          {t.missingDbs.length > 0 && <Alert tone="info">Hali bazasi yaratilmagan do&apos;konlar: {t.missingDbs.join(', ')} (birinchi yozuvda yaratiladi).</Alert>}
        </div>
      )}
      <div className="sa-table-wrap">
        <table className="sa-table">
          <thead><tr><th>Do&apos;kon</th><th>Baza</th><th>Holat</th><th className="sa-td-r">Loginlar</th><th className="sa-td-r">Diskda</th></tr></thead>
          <tbody>
            {t.rows.slice(0, 15).map((r) => (
              <tr key={r.dbName}>
                <td><Link href={`/super/organizations/${r.slug}`} className="sa-td-main">{r.name}</Link><span className="sa-td-sub">{r.slug}</span></td>
                <td><code className="sa-code">{r.dbName}</code></td>
                <td><Pill tone={r.status === 'active' ? 'ok' : r.status === 'suspended' ? 'warn' : 'bad'}>{statusLabel[r.status] ?? r.status}</Pill></td>
                <td className="sa-td-r">{r.users}</td>
                <td className="sa-td-r">{r.sizeOnDisk != null ? formatBytes(r.sizeOnDisk) : '—'}</td>
              </tr>
            ))}
            {t.rows.length === 0 && <tr><td colSpan={5} className="sa-empty">Do&apos;kon yo&apos;q</td></tr>}
          </tbody>
        </table>
      </div>
      {t.rows.length > 15 && <div className="sa-gfoot" style={{ padding: '10px 16px' }}>Jami {t.total} ta do&apos;kon; 15 tasi ko&apos;rsatildi.</div>}
    </Section>
  );
}

export { SUSPICIOUS };
