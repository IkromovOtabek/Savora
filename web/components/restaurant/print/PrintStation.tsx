'use client';

/**
 * Printer stansiyasi (/app/kitchen/print) — oshxona/kassa kompyuterida doim ochiq turadigan sahifa.
 * POST /api/restaurant/print (3 s polling): chop etish yoqilgan va navbat bo'sh bo'lsa — server yangi
 * varaqlarni shu qurilmaga beradi (claim). Varaqlar ketma-ket `window.print()` bilan chop etiladi
 * (Chrome `--kiosk-printing` — dialogsiz, asosiy printerga), keyin { op: 'done' }.
 * KDS'dan farqi: sahifa orqada qolsa ham so'rov to'xtamaydi (oyna yopilmaguncha chop etadi).
 * Sof mantiq: ./printLogic.ts.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import Icon from '@/components/icons/Icon';
import { useDict } from '@/lib/i18n/client';
import { tr } from '@/lib/i18n/fmt';
import { toast } from '@/lib/toast';
import type { PrintJobView, PrintStationBoard } from '@/lib/restaurant/printQueue';
import { readStore, writeStore } from '../kitchen/kdsDevice';
import KitchenTicket from './KitchenTicket';
import {
  PRINT_DONE_RETRIES,
  PRINT_POLL_MAX_MS,
  PRINT_POLL_MS,
  chromeCommand,
  hhmm,
  linesSummary,
  mergeQueue,
  newDeviceId,
  printStationUrl,
  sampleJob,
  ticketPlace,
  validDeviceId,
  type PaperWidth,
} from './printLogic';

const DEVICE_KEY = 'savora.print.device';
const RUN_KEY = 'savora.print.running';
const WIDTH_KEY = 'savora.print.width';
const STATION_KEY = 'savora.print.station';
const BRANCH_KEY = 'savora.print.branch';
const HEX24 = /^[a-f0-9]{24}$/i;

type Phase = 'loading' | 'live' | 'offline' | 'error' | 'auth' | 'denied';
interface Current { job: PrintJobView; test: boolean }

export interface PrintStationProps {
  isAdmin: boolean;
  urlStation: string;
  urlBranch: string;
  defaultWidth: PaperWidth;
}

const sleep = (ms: number) => new Promise((r) => window.setTimeout(r, ms));

async function postJson(url: string, body: unknown): Promise<{ res: Response; body: unknown }> {
  const res = await fetch(url, {
    method: 'POST',
    cache: 'no-store',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify(body),
  });
  return { res, body: await res.json().catch(() => null) };
}

export default function PrintStation({ isAdmin, urlStation, urlBranch, defaultWidth }: PrintStationProps) {
  const d = useDict();
  const p = d.restaurant.print;

  const [hydrated, setHydrated] = useState(false);
  const [deviceId, setDeviceId] = useState('');
  const [station, setStation] = useState(urlStation);
  const [branchId, setBranchId] = useState(urlBranch);
  const [running, setRunning] = useState(false);
  const [width, setWidth] = useState<PaperWidth>(defaultWidth);
  const [phase, setPhase] = useState<Phase>('loading');
  const [phaseMsg, setPhaseMsg] = useState('');
  const [meta, setMeta] = useState<Pick<PrintStationBoard, 'stations' | 'branches'> | null>(null);
  const [recent, setRecent] = useState<PrintJobView[]>([]);
  const [queue, setQueue] = useState<PrintJobView[]>([]);
  const [current, setCurrent] = useState<Current | null>(null);
  const [preview, setPreview] = useState<Current | null>(null);
  const [lastPoll, setLastPoll] = useState(0);
  const [printedN, setPrintedN] = useState(0);
  const [reloadKey, setReloadKey] = useState(0);
  const [origin, setOrigin] = useState('');

  const runningRef = useRef(false);
  /** Navbatning haqiqiy manbai (state — ekran uchun nusxa): polling va chop etish bir-birini kutmaydi */
  const queueRef = useRef<PrintJobView[]>([]);
  const currentRef = useRef<Current | null>(null);
  const handledRef = useRef<Set<string>>(new Set());
  const pokeRef = useRef<() => void>(() => {});

  useEffect(() => { runningRef.current = running; }, [running]);
  useEffect(() => { currentRef.current = current; }, [current]);

  const setQueueBoth = useCallback((next: PrintJobView[]) => {
    queueRef.current = next;
    setQueue(next);
  }, []);

  /* ── tanlovlarni tiklash (URL ustun, keyin localStorage) ── */
  useEffect(() => {
    let dev = readStore(DEVICE_KEY);
    if (!validDeviceId(dev)) {
      dev = newDeviceId();
      writeStore(DEVICE_KEY, dev);
    }
    setDeviceId(dev);
    setRunning(readStore(RUN_KEY) === '1');
    const w = readStore(WIDTH_KEY);
    if (w === '58' || w === '80') setWidth(Number(w) as PaperWidth);
    if (!urlStation) {
      const s = readStore(STATION_KEY);
      if (s && HEX24.test(s)) setStation(s);
    }
    if (isAdmin && !urlBranch) {
      const b = readStore(BRANCH_KEY);
      if (b && HEX24.test(b)) setBranchId(b);
    }
    setOrigin(window.location.origin);
    setHydrated(true);
  }, [urlStation, urlBranch, isAdmin]);

  useEffect(() => {
    if (!hydrated) return;
    writeStore(RUN_KEY, running ? '1' : null);
    writeStore(WIDTH_KEY, String(width));
    writeStore(STATION_KEY, station || null);
    if (isAdmin) writeStore(BRANCH_KEY, branchId || null);
    const url = new URL(window.location.href);
    if (station) url.searchParams.set('station', station);
    else url.searchParams.delete('station');
    if (isAdmin && branchId) url.searchParams.set('branch', branchId);
    else url.searchParams.delete('branch');
    if (url.href !== window.location.href) window.history.replaceState(null, '', url.pathname + url.search);
  }, [hydrated, running, width, station, branchId, isAdmin]);

  /* ── «chop etildi» belgisi (aloqa uzilsa — bir necha urinish) ── */
  const markDone = useCallback(async (id: string) => {
    for (let k = 0; k < PRINT_DONE_RETRIES; k++) {
      try {
        const { res } = await postJson(`/api/restaurant/print/${id}`, { op: 'done' });
        if (res.ok || res.status === 404 || res.status === 403) return;
      } catch { /* qayta urinamiz */ }
      await sleep(1000 * (k + 1));
    }
    // Yetib bormadi: server varaqni muddat o'tgach shu qurilmaga qayta beradi — handledRef takror chop etishdan saqlaydi
  }, []);

  /* ── polling ── */
  useEffect(() => {
    if (!hydrated || !deviceId) return;
    let timer: number | undefined;
    let stopped = false;
    let inflight = false;
    let failures = 0;
    let initial = true;
    setPhase('loading');

    const schedule = (ms: number) => {
      window.clearTimeout(timer);
      if (!stopped) timer = window.setTimeout(() => void tick(), ms);
    };

    async function tick() {
      if (stopped || inflight) return;
      inflight = true;
      try {
        // Navbat bo'sh va hech narsa chop etilmayotganda — yangi varaq olinadi
        const claim = runningRef.current && !currentRef.current && queueRef.current.length === 0;
        const { res, body } = await postJson('/api/restaurant/print', {
          deviceId,
          claim,
          ...(station ? { stationId: station } : {}),
          ...(branchId ? { branchId } : {}),
        });
        if (stopped) return;
        const b = body as (PrintStationBoard & { error?: string; code?: string }) | null;
        if (!res.ok || !b) {
          if (res.status === 401) { stopped = true; setPhase('auth'); return; }
          if (res.status === 403) { stopped = true; setPhaseMsg(b?.error ?? ''); setPhase('denied'); return; }
          if (b?.code === 'badBranch' && branchId) { setBranchId(''); return; }
          throw new Error(b?.error ?? `HTTP ${res.status}`);
        }
        setMeta({ stations: b.stations, branches: b.branches });
        setRecent(b.recent);
        setLastPoll(Date.now());
        if (station && !b.stations.some((s) => s.id === station)) { setStation(''); return; }
        if (b.jobs.length) {
          const m = mergeQueue(queueRef.current, b.jobs, handledRef.current);
          setQueueBoth(m.queue);
          for (const id of m.again) void markDone(id);
        }
        initial = false;
        failures = 0;
        setPhase('live');
        schedule(PRINT_POLL_MS);
      } catch {
        if (stopped) return;
        failures++;
        setPhase(initial ? 'error' : 'offline');
        schedule(Math.min(PRINT_POLL_MAX_MS, PRINT_POLL_MS * 2 ** failures));
      } finally {
        inflight = false;
      }
    }

    pokeRef.current = () => schedule(0);
    const onOnline = () => schedule(0);
    window.addEventListener('online', onOnline);
    void tick();
    return () => {
      stopped = true;
      window.clearTimeout(timer);
      window.removeEventListener('online', onOnline);
      pokeRef.current = () => {};
    };
  }, [hydrated, deviceId, station, branchId, reloadKey, markDone, setQueueBoth]);

  // Chop etish yoqilganda — darhol so'rov
  useEffect(() => { if (running) pokeRef.current(); }, [running]);

  /* ── navbat: bittadan chop etish ── */
  useEffect(() => {
    if (current || !queue.length) return;
    const next = { job: queue[0], test: false };
    currentRef.current = next;
    setCurrent(next);
  }, [queue, current]);

  useEffect(() => {
    if (!current) return;
    let cancelled = false;
    let raf2 = 0;
    // Varaq DOM'ga chizilib, chop etish uslubi qo'llanib ulgursin
    const raf1 = window.requestAnimationFrame(() => {
      raf2 = window.requestAnimationFrame(() => {
        if (cancelled) return;
        window.print(); // --kiosk-printing: dialogsiz; aks holda dialog yopilguncha kutadi
        const { job, test } = current;
        setPreview(current);
        if (!test) {
          handledRef.current.add(job.id);
          setPrintedN((n) => n + 1);
          void markDone(job.id).then(() => pokeRef.current());
        }
        setQueueBoth(queueRef.current.filter((j) => j.id !== job.id));
        currentRef.current = null;
        setCurrent(null);
      });
    });
    return () => {
      cancelled = true;
      window.cancelAnimationFrame(raf1);
      if (raf2) window.cancelAnimationFrame(raf2);
    };
  }, [current, markDone, setQueueBoth]);

  /* ── amallar ── */
  const stations = useMemo(() => meta?.stations ?? [], [meta]);
  const branches = meta?.branches ?? [];
  const selected = stations.find((s) => s.id === station) ?? null;
  const printable = stations.filter((s) => s.printEnabled);

  function testPrint() {
    if (current) return;
    const next = { job: sampleJob(d, selected?.name ?? printable[0]?.name ?? p.title, Date.now()), test: true };
    currentRef.current = next;
    setCurrent(next);
  }

  async function reprint(job: PrintJobView) {
    try {
      const { res, body } = await postJson(`/api/restaurant/print/${job.id}`, { op: 'reprint' });
      if (!res.ok) {
        toast((body as { error?: string } | null)?.error ?? p.reprintFailed, 'error');
        return;
      }
      toast(running ? p.reprinted : p.reprintPaused, running ? 'success' : 'info');
      pokeRef.current();
    } catch {
      toast(p.reprintFailed, 'error');
    }
  }

  const liveText =
    phase === 'live' ? p.live : phase === 'offline' ? p.offline : phase === 'loading' ? p.loading : '';
  const url = origin ? printStationUrl(origin) : '';

  if (phase === 'auth' || phase === 'denied' || phase === 'error') {
    return (
      <div className="kp">
        <div className="t-page-head"><div><h1 className="t-page-title">{p.title}</h1></div></div>
        <div className="t-note t-note--warn" role="alert">
          {phase === 'auth' ? p.authRequired : phase === 'denied' ? phaseMsg || p.loadError : p.loadError}
        </div>
        {phase === 'auth' && <Link className="btn btn-primary" href="/login">{p.login}</Link>}
        {phase === 'error' && (
          <button type="button" className="btn btn-primary" onClick={() => setReloadKey((n) => n + 1)}>{p.retry}</button>
        )}
      </div>
    );
  }

  return (
    <div className="kp">
      {/* Chop etish sahifa o'lchami (termal rulon) — faqat varaq chiqadi */}
      <style>{`@media print{@page{size:${width}mm auto;margin:${width === 58 ? 1 : 3}mm}}`}</style>
      <div className="kp-print" style={{ ['--kt-w' as string]: `${width}mm` }}>
        {current && <KitchenTicket job={current.job} d={d} test={current.test} />}
      </div>

      <div className="kp-screen no-print">
        <div className="t-page-head">
          <div>
            <h1 className="t-page-title">{p.title}</h1>
            <p className="t-page-sub">{p.sub}</p>
          </div>
          <div className="t-page-actions">
            <Link className="btn btn-ghost btn-sm" href="/app/kitchen">{p.kdsLink}</Link>
            {isAdmin && <Link className="btn btn-ghost btn-sm" href="/app/restaurant/stations">{p.settingsLink}</Link>}
          </div>
        </div>

        <section className={`t-card kp-control${running ? ' is-running' : ''}`} aria-label={p.title}>
          <div className="kp-control-main">
            <button
              type="button"
              className={`btn ${running ? 'btn-ghost' : 'btn-primary'} kp-run`}
              aria-pressed={running}
              onClick={() => setRunning((r) => !r)}
            >
              <Icon name={running ? 'close' : 'send'} size={18} />
              {running ? p.stop : p.start}
            </button>
            <div className="kp-state">
              <b className={running ? 'kp-on' : 'kp-off'}>{running ? p.running : p.paused}</b>
              <span className="kp-state-meta tnum">
                {liveText && <span className={`kp-live kp-live--${phase}`} role="status">{liveText}</span>}
                {lastPoll > 0 && <span>{tr(p.lastPoll, { time: new Date(lastPoll).toLocaleTimeString('uz-UZ', { hour12: false }) })}</span>}
                {queue.length > 0 && <span>{tr(p.queueN, { n: queue.length })}</span>}
                {current && !current.test && <span>{p.printingNow}</span>}
                {printedN > 0 && <span>{tr(p.printedN, { n: printedN })}</span>}
              </span>
            </div>
            <button type="button" className="btn btn-ghost kp-test" onClick={testPrint} disabled={!!current}>
              <Icon name="clipboard" size={16} /> {p.test}
            </button>
          </div>

          <div className="kp-filters">
            {isAdmin && branches.length > 1 && (
              <label className="kp-field">
                <span>{p.branch}</span>
                <select className="input" value={branchId} onChange={(e) => { setStation(''); setBranchId(e.target.value); }}>
                  <option value="">—</option>
                  {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </label>
            )}
            <label className="kp-field">
              <span>{p.station}</span>
              <select className="input" value={station} onChange={(e) => setStation(e.target.value)}>
                <option value="">{p.allStations}</option>
                {stations.map((s) => <option key={s.id} value={s.id}>{s.name}{s.printEnabled ? '' : ' ✕'}</option>)}
              </select>
            </label>
            <div className="kp-field">
              <span>{p.paper}</span>
              <div className="sl-seg" role="group" aria-label={p.paper}>
                {([80, 58] as PaperWidth[]).map((w) => (
                  <button key={w} type="button" className={`sl-seg-btn${width === w ? ' is-on' : ''}`} aria-pressed={width === w} onClick={() => setWidth(w)}>
                    {w} mm
                  </button>
                ))}
              </div>
            </div>
          </div>

          {meta && stations.length === 0 && <p className="t-note t-note--warn">{p.noStations}</p>}
          {meta && stations.length > 0 && printable.length === 0 && <p className="t-note t-note--warn">{p.noPrintStations}</p>}
          {selected && !selected.printEnabled && <p className="t-note t-note--warn">{tr(p.stationOff, { name: selected.name })}</p>}
        </section>

        <div className="kp-grid">
          <section className="t-card kp-recent" aria-labelledby="kp-recent-h">
            <div className="t-card-head"><h2 id="kp-recent-h">{p.recent}</h2></div>
            {recent.length === 0 ? (
              <p className="kp-empty">{p.recentEmpty}</p>
            ) : (
              <ul className="kp-list">
                {recent.map((j) => (
                  <li key={j.id} className={`kp-row${preview?.job.id === j.id ? ' is-on' : ''}`}>
                    <button type="button" className="kp-row-main" onClick={() => setPreview({ job: j, test: false })}>
                      <span className="kp-row-time tnum">{hhmm(j.queuedAt)}</span>
                      <span className="kp-row-body">
                        <b>
                          {ticketPlace(j, d)}
                          {j.kind === 'void' && <span className="t-pill t-pill--bad">{p.ticketVoid}</span>}
                          {j.copy && <span className="t-pill">{p.ticketCopy}</span>}
                        </b>
                        <small>{j.stationName} · {linesSummary(j.lines)}</small>
                      </span>
                      <span className={`kp-status kp-status--${j.status === 'printed' ? 'ok' : j.stale ? 'bad' : 'wait'}`} title={j.stale ? p.staleHint : undefined}>
                        {j.status === 'printed' ? tr(p.statusPrinted, { time: j.printedAt ? hhmm(j.printedAt) : '' }) : j.stale ? p.statusStale : p.statusPending}
                      </span>
                    </button>
                    <button type="button" className="icon-btn" onClick={() => void reprint(j)} aria-label={`${p.reprint}: ${ticketPlace(j, d)}`} title={p.reprint}>
                      <Icon name="repeat" size={16} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <div className="kp-side">
            <section className="t-card kp-preview" aria-labelledby="kp-prev-h">
              <div className="t-card-head"><h2 id="kp-prev-h">{p.preview}</h2></div>
              {preview ? (
                <div className="kp-paper" style={{ ['--kt-w' as string]: `${width}mm` }}>
                  <KitchenTicket job={preview.job} d={d} test={preview.test} />
                </div>
              ) : (
                <p className="kp-empty">{p.previewEmpty}</p>
              )}
            </section>

            <details className="t-card kp-setup">
              <summary>{p.setupTitle}</summary>
              <ol className="kp-steps">
                <li>{p.setupStep1}</li>
                <li>
                  {p.setupStep2}
                  {url && <CopyCode text={chromeCommand('windows', url)} d={d} />}
                  <small>{p.setupStep2Hint}</small>
                </li>
                <li>{p.setupStep3}</li>
                <li>{p.setupStep4}</li>
                <li>{p.setupStep5}</li>
              </ol>
              {url && (
                <div className="kp-mac">
                  <span>{p.setupMac}</span>
                  <CopyCode text={chromeCommand('mac', url)} d={d} />
                </div>
              )}
            </details>
          </div>
        </div>
      </div>
    </div>
  );
}

function CopyCode({ text, d }: { text: string; d: ReturnType<typeof useDict> }) {
  const p = d.restaurant.print;
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      toast(p.copied, 'success');
    } catch {
      /* clipboard yopiq — matn ko'rinib turibdi, qo'lda belgilanadi */
    }
  }
  return (
    <div className="kp-code">
      <code>{text}</code>
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => void copy()}>{p.copy}</button>
    </div>
  );
}
