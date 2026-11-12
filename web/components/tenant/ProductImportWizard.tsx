'use client';

import { useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import Icon from '@/components/icons/Icon';
import BackLink from '@/components/ui/BackLink';
import { useDict } from '@/lib/i18n/client';
import { tr } from '@/lib/i18n/fmt';
import { fmtMoney } from '@/lib/format';
import { readSpreadsheet, XlsxReadError, type Cell, type SheetData } from '@/lib/xlsxRead';
import {
  IMPORT_BATCH_SIZE,
  IMPORT_MAX_ROWS,
  autoMapColumns,
  buildRawRows,
  detectHeaderRow,
  importFieldsFor,
  normalizeExtraName,
  parseImportRow,
  type ColumnTarget,
  type ConstColumn,
  type DuplicateMode,
  type ImportContext,
  type ImportField,
  type ImportIssue,
  type RawImportRow,
} from '@/lib/productImport';
import { importProductsBatchAction, type ImportRowResult } from '@/app/actions/productImport';

const MAX_FILE_MB = 15;
const PREVIEW_ROWS = 100;

type Stage = 'file' | 'map' | 'importing' | 'done';
type ManualCol = { id: number; target: 'extra' | ImportField; name: string; value: string };

function colLetter(i: number): string {
  let s = '';
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}

function cellText(c: Cell | undefined): string {
  if (c === null || c === undefined) return '';
  return typeof c === 'number' ? String(c) : c;
}


export default function ProductImportWizard({
  ctx,
  isAdmin,
  extraNames,
}: {
  ctx: ImportContext;
  isAdmin: boolean;
  /** Do'kondagi mavjud qo'shimcha ustun nomlari (taklif uchun) */
  extraNames: string[];
}) {
  const d = useDict();
  const t = d.importer;
  const fields = useMemo(() => importFieldsFor(ctx), [ctx]);

  const [stage, setStage] = useState<Stage>('file');
  const [reading, setReading] = useState(false);
  const [readError, setReadError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [fileName, setFileName] = useState('');
  const [sheets, setSheets] = useState<SheetData[]>([]);
  const [sheetIdx, setSheetIdx] = useState(0);
  const [headerRow, setHeaderRow] = useState(0);
  const [mapping, setMapping] = useState<ColumnTarget[]>([]);
  const [manual, setManual] = useState<ManualCol[]>([]);
  const [duplicate, setDuplicate] = useState<DuplicateMode>('skip');
  const [onlyErrors, setOnlyErrors] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [results, setResults] = useState<ImportRowResult[]>([]);
  const [stopError, setStopError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const nextId = useRef(1);

  const rows = sheets[sheetIdx]?.rows ?? [];
  const colCount = useMemo(() => {
    let n = 0;
    for (let i = headerRow; i < Math.min(rows.length, headerRow + 300); i++) n = Math.max(n, rows[i]?.length ?? 0);
    return n;
  }, [rows, headerRow]);
  const headers = useMemo(() => Array.from({ length: colCount }, (_, i) => rows[headerRow]?.[i] ?? null), [rows, headerRow, colCount]);

  function remap(sheetRows: Cell[][], hr: number) {
    let n = 0;
    for (let i = hr; i < Math.min(sheetRows.length, hr + 300); i++) n = Math.max(n, sheetRows[i]?.length ?? 0);
    const hs = Array.from({ length: n }, (_, i) => sheetRows[hr]?.[i] ?? null);
    setMapping(autoMapColumns(hs, fields));
  }

  async function openFile(file: File) {
    setReadError(null);
    if (file.size > MAX_FILE_MB * 1024 * 1024) {
      setReadError(tr(t.fileTooBig, { mb: MAX_FILE_MB }));
      return;
    }
    setReading(true);
    try {
      const all = await readSpreadsheet(await file.arrayBuffer(), file.name, { maxRows: IMPORT_MAX_ROWS * 2 });
      const idx = Math.max(0, all.findIndex((s) => s.rows.length >= 2));
      const hr = detectHeaderRow(all[idx].rows, fields);
      const dataRows = all[idx].rows.length - hr - 1;
      if (dataRows > IMPORT_MAX_ROWS) {
        setReadError(tr(t.tooManyRows, { n: dataRows, max: IMPORT_MAX_ROWS }));
        return;
      }
      setFileName(file.name);
      setSheets(all);
      setSheetIdx(idx);
      setHeaderRow(hr);
      remap(all[idx].rows, hr);
      setManual([]);
      setStage('map');
    } catch (err) {
      setReadError(err instanceof XlsxReadError ? t.readErrors[err.code] : t.readErrors.corrupt);
    } finally {
      setReading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  function chooseSheet(i: number) {
    setSheetIdx(i);
    const hr = detectHeaderRow(sheets[i].rows, fields);
    setHeaderRow(hr);
    remap(sheets[i].rows, hr);
  }

  function chooseHeaderRow(hr: number) {
    setHeaderRow(hr);
    remap(rows, hr);
  }

  function setTarget(col: number, value: string) {
    setMapping((prev) => {
      const next = [...prev];
      if (value === 'skip') next[col] = { type: 'skip' };
      else if (value === 'extra') next[col] = { type: 'extra', name: normalizeExtraName(headers[col]) };
      else {
        const field = value as ImportField;
        // Maydon bitta ustunga: avvalgi egasi qo'shimcha ustunga (sarlavhasi bo'lsa) yoki o'tkazishga
        next.forEach((m, i) => {
          if (i !== col && m.type === 'field' && m.field === field) {
            const name = normalizeExtraName(headers[i]);
            next[i] = name ? { type: 'extra', name } : { type: 'skip' };
          }
        });
        next[col] = { type: 'field', field };
      }
      return next;
    });
  }

  function setExtraName(col: number, name: string) {
    setMapping((prev) => prev.map((m, i) => (i === col ? { type: 'extra', name: name.slice(0, 40) } : m)));
  }

  const constants: ConstColumn[] = useMemo(
    () =>
      manual.flatMap((m): ConstColumn[] => {
        if (m.target === 'extra') {
          const name = normalizeExtraName(m.name);
          return name ? [{ target: { type: 'extra', name }, value: m.value }] : [];
        }
        return [{ target: { type: 'field', field: m.target }, value: m.value }];
      }),
    [manual],
  );

  const raw = useMemo(
    () => (stage !== 'file' ? buildRawRows(rows, headerRow, mapping.map((m) => (m.type === 'extra' && !normalizeExtraName(m.name) ? { type: 'skip' } as const : m)), constants) : []),
    [stage, rows, headerRow, mapping, constants],
  );
  const checked = useMemo(() => raw.map((r) => ({ raw: r, res: parseImportRow(r, ctx) })), [raw, ctx]);
  const validRows = useMemo(() => checked.filter((c) => c.res.ok).map((c) => c.raw), [checked]);
  const invalidCount = checked.length - validRows.length;

  const mapped = new Set<ImportField>([
    ...mapping.flatMap((m) => (m.type === 'field' ? [m.field] : [])),
    ...constants.flatMap((c) => (c.target.type === 'field' && c.value.trim() ? [c.target.field] : [])),
  ]);
  const blocker = !mapped.has('name') ? t.nameMissing : null;
  // Telefon do'koni: IMEI ustuni tanlanmasa ham import bo'ladi — tovarlar keyin IMEI kiritish uchun belgilanadi
  const imeiNote = ctx.phoneShop && !mapped.has('imei') ? t.imeiNotMapped : null;
  const showQty = !ctx.phoneShop || mapped.has('quantity');

  function issueText(i: ImportIssue): string {
    const field = i.field === 'extra' ? t.extraLabel : i.field ? t.fields[i.field] : '';
    return tr(t.errors[i.code], { field });
  }

  async function runImport() {
    const batches: RawImportRow[][] = [];
    for (let i = 0; i < validRows.length; i += IMPORT_BATCH_SIZE) batches.push(validRows.slice(i, i + IMPORT_BATCH_SIZE));
    const invalidResults: ImportRowResult[] = checked.filter((c) => !c.res.ok).map((c) => ({ line: c.raw.line, status: 'error', reason: 'invalid' }));
    setStage('importing');
    setStopError(null);
    setProgress({ done: 0, total: validRows.length });
    const acc: ImportRowResult[] = [];
    for (const batch of batches) {
      try {
        const res = await importProductsBatchAction({ duplicate, rows: batch });
        if (!res.ok) { setStopError(res.error); break; }
        acc.push(...res.results);
        setProgress({ done: acc.length, total: validRows.length });
      } catch {
        setStopError(tr(t.resStopped, { done: acc.length }));
        break;
      }
    }
    setResults([...acc, ...invalidResults].sort((a, b) => a.line - b.line));
    setStage('done');
  }

  function reset() {
    setStage('file');
    setSheets([]);
    setMapping([]);
    setManual([]);
    setResults([]);
    setStopError(null);
    setReadError(null);
  }

  const stepIdx = stage === 'file' ? 0 : stage === 'map' ? 1 : 2;

  // ─────────────── Natija ───────────────
  if (stage === 'done') {
    const n = (s: ImportRowResult['status']) => results.filter((r) => r.status === s).length;
    const problems = results.filter((r) => r.status === 'skipped' || r.status === 'error');
    const noImei = results.filter((r) => r.noImei).length;
    const invalidByLine = new Map(checked.filter((c) => !c.res.ok).map((c) => [c.raw.line, c.res.ok ? [] : c.res.issues]));
    return (
      <div className="im-page">
        <Head t={t} isAdmin={isAdmin} stepIdx={3} />
        <section className="st-group im-done" aria-live="polite">
          <span className={`im-done-ic${n('created') + n('restocked') > 0 ? '' : ' im-done-ic--warn'}`} aria-hidden="true">
            <Icon name={n('created') + n('restocked') > 0 ? 'check' : 'alert'} size={26} />
          </span>
          <h2>{t.resultTitle}</h2>
          {stopError && <div className="auth-alert auth-alert--error">{stopError}</div>}
          <ul className="im-stats">
            <li className="im-stat im-stat--ok">{tr(t.resCreated, { n: n('created') })}</li>
            {n('restocked') > 0 && <li className="im-stat im-stat--ok">{tr(t.resRestocked, { n: n('restocked') })}</li>}
            {n('skipped') > 0 && <li className="im-stat">{tr(t.resSkipped, { n: n('skipped') })}</li>}
            {n('error') > 0 && <li className="im-stat im-stat--bad">{tr(t.resFailed, { n: n('error') })}</li>}
          </ul>
          {noImei > 0 && (
            <div className="auth-alert auth-alert--warn im-noimei" role="status">
              <Icon name="alert" size={16} />
              <span>{tr(t.resNoImei, { n: noImei })}</span>
              <Link href="/app/products?imei=pending">{t.resNoImeiLink}</Link>
            </div>
          )}
          <div className="im-done-actions">
            <Link href="/app/products" className="btn btn-primary">{t.goToStock}</Link>
            <button type="button" className="btn btn-tinted" onClick={reset}>{t.again}</button>
          </div>
        </section>
        {problems.length > 0 && (
          <section className="st-group im-table-wrap">
            <table className="im-table">
              <thead><tr><th>{t.line}</th><th>{t.status}</th></tr></thead>
              <tbody>
                {problems.slice(0, 300).map((r) => (
                  <tr key={r.line}>
                    <td className="im-line">{r.line}</td>
                    <td className={r.status === 'error' ? 'im-bad' : 'im-muted'}>
                      {r.reason === 'invalid' && invalidByLine.get(r.line)?.length
                        ? invalidByLine.get(r.line)!.map(issueText).join(' · ')
                        : t.reasons[r.reason ?? 'saveFailed']}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}
      </div>
    );
  }

  // ─────────────── 1. Fayl ───────────────
  if (stage === 'file') {
    return (
      <div className="im-page">
        <Head t={t} isAdmin={isAdmin} stepIdx={stepIdx} />
        {readError && <div className="auth-alert auth-alert--error st-alert" role="alert">{readError}</div>}
        <label
          className={`im-drop${dragOver ? ' im-drop--over' : ''}${reading ? ' im-drop--busy' : ''}`}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            const f = e.dataTransfer.files?.[0];
            if (f && !reading) void openFile(f);
          }}
        >
          <input
            ref={fileRef}
            type="file"
            className="sr-only"
            accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
            disabled={reading}
            onChange={(e) => { const f = e.target.files?.[0]; if (f) void openFile(f); }}
          />
          <span className="im-drop-ic" aria-hidden="true"><Icon name="download" size={26} /></span>
          <b>{reading ? t.reading : t.dropTitle}</b>
          <small>{tr(t.dropHint, { max: fmtMoney(IMPORT_MAX_ROWS) })}</small>
          <span className="btn btn-primary btn-sm im-drop-btn">{t.choose}</span>
        </label>
        <section className="im-known">
          <h2>{t.knownTitle}</h2>
          <p>{t.knownHint}</p>
          <ul className="im-chips">
            {fields.map((f) => <li key={f}>{t.fields[f]}</li>)}
          </ul>
        </section>
      </div>
    );
  }

  // ─────────────── 2–3. Moslash va tekshiruv ───────────────
  const busy = stage === 'importing';
  const previewItems = (onlyErrors ? checked.filter((c) => !c.res.ok) : checked).slice(0, PREVIEW_ROWS);
  const samples = (col: number) => {
    const out: string[] = [];
    for (let r = headerRow + 1; r < rows.length && out.length < 3; r++) {
      const v = cellText(rows[r]?.[col]).trim();
      if (v) out.push(v);
    }
    return out;
  };
  const targetValue = (m: ColumnTarget | undefined) => (!m || m.type === 'skip' ? 'skip' : m.type === 'extra' ? 'extra' : m.field);

  return (
    <div className="im-page">
      <Head t={t} isAdmin={isAdmin} stepIdx={stepIdx} />

      <div className="st-group im-file">
        <span className="im-file-ic" aria-hidden="true"><Icon name="clipboard" size={18} /></span>
        <div className="im-file-main">
          <b>{tr(t.fileInfo, { file: fileName, n: Math.max(0, rows.length - headerRow - 1) })}</b>
          <div className="im-file-opts">
            {sheets.length > 1 && (
              <label>
                <span>{t.sheet}</span>
                <select value={sheetIdx} onChange={(e) => chooseSheet(Number(e.target.value))} disabled={busy}>
                  {sheets.map((s, i) => <option key={i} value={i}>{s.name}</option>)}
                </select>
              </label>
            )}
            <label>
              <span>{t.headerRow}</span>
              <select value={headerRow} onChange={(e) => chooseHeaderRow(Number(e.target.value))} disabled={busy}>
                {rows.slice(0, 15).map((r, i) => (
                  <option key={i} value={i}>
                    {tr(t.headerRowOpt, { n: i + 1, text: r.filter((c) => c !== null).slice(0, 3).map(cellText).join(', ').slice(0, 40) || '—' })}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>
        <button type="button" className="btn btn-ghost btn-sm" onClick={reset} disabled={busy}>{t.changeFile}</button>
      </div>

      {/* Ustunlarni moslash */}
      <div className="st-ghead im-ghead"><span>{t.columnsTitle}</span></div>
      <section className="st-group im-map">
        <p className="im-hint">{t.columnsHint}</p>
        <datalist id="im-extra-names">
          {extraNames.map((n) => <option key={n} value={n} />)}
        </datalist>
        <ul className="im-cols">
          {headers.map((h, col) => {
            const m = mapping[col];
            const v = targetValue(m);
            const s = samples(col);
            return (
              <li key={col} className={`im-col${v === 'skip' ? ' im-col--skip' : ''}`}>
                <div className="im-col-src">
                  <span className="im-col-letter" aria-hidden="true">{colLetter(col)}</span>
                  <div className="im-col-txt">
                    <b>{cellText(h).trim() || tr(t.noHeader, { col: colLetter(col) })}</b>
                    <small title={s.join(' · ')}>{s.join(' · ') || '—'}</small>
                  </div>
                </div>
                <span className="im-col-arrow" aria-hidden="true"><Icon name="arrowRight" size={16} /></span>
                <div className="im-col-dst">
                  <select
                    value={v}
                    onChange={(e) => setTarget(col, e.target.value)}
                    disabled={busy}
                    aria-label={`${t.colTarget}: ${cellText(h) || colLetter(col)}`}
                  >
                    <option value="skip">{t.skip}</option>
                    <optgroup label={t.groupFields}>
                      {fields.map((f) => <option key={f} value={f}>{t.fields[f]}</option>)}
                    </optgroup>
                    <optgroup label={t.groupExtra}>
                      <option value="extra">{t.extraTarget}</option>
                    </optgroup>
                  </select>
                  {m?.type === 'extra' && (
                    <input
                      type="text"
                      list="im-extra-names"
                      value={m.name}
                      maxLength={40}
                      placeholder={t.extraNamePh}
                      onChange={(e) => setExtraName(col, e.target.value)}
                      disabled={busy}
                      aria-label={t.extraNamePh}
                    />
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      {/* Qo'lda ustun qo'shish */}
      <div className="st-ghead im-ghead"><span>{t.addColTitle}</span></div>
      <section className="st-group im-map">
        <p className="im-hint">{t.addColHint}</p>
        {manual.length > 0 && (
          <ul className="im-manual">
            {manual.map((mc) => (
              <li key={mc.id} className="im-manual-row">
                <select
                  value={mc.target}
                  onChange={(e) => setManual((p) => p.map((x) => (x.id === mc.id ? { ...x, target: e.target.value as ManualCol['target'] } : x)))}
                  disabled={busy}
                  aria-label={t.constTarget}
                >
                  <option value="extra">{t.extraTarget}</option>
                  <optgroup label={t.groupFields}>
                    {fields.filter((f) => f !== 'name' && f !== 'imei' && f !== 'barcode').map((f) => <option key={f} value={f}>{t.fields[f]}</option>)}
                  </optgroup>
                </select>
                {mc.target === 'extra' && (
                  <input
                    type="text"
                    list="im-extra-names"
                    value={mc.name}
                    maxLength={40}
                    placeholder={t.extraNamePh}
                    onChange={(e) => setManual((p) => p.map((x) => (x.id === mc.id ? { ...x, name: e.target.value } : x)))}
                    disabled={busy}
                    aria-label={t.extraNamePh}
                  />
                )}
                <input
                  type="text"
                  value={mc.value}
                  maxLength={200}
                  placeholder={t.constValuePh}
                  onChange={(e) => setManual((p) => p.map((x) => (x.id === mc.id ? { ...x, value: e.target.value } : x)))}
                  disabled={busy}
                  aria-label={t.constValue}
                />
                <button
                  type="button"
                  className="icon-btn im-remove"
                  onClick={() => setManual((p) => p.filter((x) => x.id !== mc.id))}
                  disabled={busy}
                  aria-label={t.remove}
                  title={t.remove}
                >
                  <Icon name="close" size={16} />
                </button>
              </li>
            ))}
          </ul>
        )}
        <button
          type="button"
          className="btn btn-tinted btn-sm btn-with-icon im-add"
          onClick={() => setManual((p) => [...p, { id: nextId.current++, target: 'extra', name: '', value: '' }])}
          disabled={busy}
        >
          <Icon name="plus" size={16} /> {t.addCol}
        </button>
      </section>

      {/* Takrorlar */}
      <div className="st-ghead im-ghead">
        <span>{tr(t.dupTitle, { code: ctx.phoneShop ? t.dupCodeImei : t.dupCodeBarcode })}</span>
      </div>
      <section className="st-group im-dup" role="radiogroup">
        {(['skip', 'restock'] as const).map((mode) => (
          <label key={mode} className="im-dup-opt">
            <input type="radio" name="im-dup" value={mode} checked={duplicate === mode} onChange={() => setDuplicate(mode)} disabled={busy} />
            <span>
              <b>{mode === 'skip' ? t.dupSkip : t.dupRestock}</b>
              <small>{mode === 'skip' ? t.dupSkipHint : t.dupRestockHint}</small>
            </span>
          </label>
        ))}
      </section>

      {/* Tekshiruv */}
      <div className="st-ghead im-ghead">
        <span>{t.previewTitle}</span>
        {checked.length > 0 && (
          <span className="im-counts">
            <span className="st-pill st-pill--in_stock">{tr(t.ready, { n: validRows.length })}</span>
            {invalidCount > 0 && <span className="st-pill st-pill--defective">{tr(t.invalid, { n: invalidCount })}</span>}
          </span>
        )}
      </div>
      <section className="st-group im-table-wrap">
        {blocker ? (
          <p className="im-blocker" role="alert"><Icon name="alert" size={16} /> {blocker}</p>
        ) : checked.length === 0 ? (
          <p className="im-blocker">{t.noRows}</p>
        ) : (
          <>
            {imeiNote && <p className="im-note"><Icon name="alert" size={16} /> {imeiNote}</p>}
            {invalidCount > 0 && (
              <label className="im-only-err">
                <input type="checkbox" checked={onlyErrors} onChange={(e) => setOnlyErrors(e.target.checked)} />
                {t.onlyErrors}
              </label>
            )}
            <div className="im-scroll">
              <table className="im-table">
                <thead>
                  <tr>
                    <th>{t.line}</th>
                    <th>{t.fields.name}</th>
                    {ctx.phoneShop ? <th>{t.fields.imei}</th> : <th>{t.fields.barcode}</th>}
                    <th className="r">{t.fields.purchasePrice}</th>
                    <th className="r">{t.fields.salePrice}</th>
                    {showQty && <th className="r">{t.fields.quantity}</th>}
                    <th>{t.status}</th>
                  </tr>
                </thead>
                <tbody>
                  {previewItems.map(({ raw: r, res }) => {
                    const row = res.ok ? res.row : null;
                    return (
                      <tr key={r.line} className={res.ok ? undefined : 'im-tr-bad'}>
                        <td className="im-line">{r.line}</td>
                        <td className="im-name">
                          {row?.name ?? cellText(r.values.name as Cell)}
                          {row && row.extra.length > 0 && (
                            <small>{row.extra.map((e) => `${e.name}: ${e.value}`).join(' · ')}</small>
                          )}
                        </td>
                        <td className="st-mono">
                          {row && ctx.phoneShop && !row.imei
                            ? <span className="im-muted">{t.imeiLater}</span>
                            : (ctx.phoneShop ? row?.imei : row?.barcode) ?? cellText((ctx.phoneShop ? r.values.imei : r.values.barcode) as Cell)}
                        </td>
                        <td className="r">{row ? fmtMoney(row.purchasePrice) : cellText(r.values.purchasePrice as Cell)}</td>
                        <td className="r">{row ? fmtMoney(row.salePrice) : cellText(r.values.salePrice as Cell)}</td>
                        {showQty && (
                          <td className="r">{row ? (row.quantity ?? '—') : cellText(r.values.quantity as Cell)}{row?.unit && row.unit !== 'dona' ? ` ${d.stock.fields.units[row.unit]}` : ''}</td>
                        )}
                        <td>
                          {res.ok
                            ? <span className="im-ok"><Icon name="check" size={14} /> {t.ok}</span>
                            : <span className="im-bad">{res.issues.map(issueText).join(' · ')}</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {(onlyErrors ? invalidCount : checked.length) > PREVIEW_ROWS && (
              <p className="im-foot">{tr(t.previewLimit, { n: PREVIEW_ROWS })}</p>
            )}
          </>
        )}
      </section>

      <div className="im-submit">
        {busy && (
          <div className="im-progress" role="progressbar" aria-valuemin={0} aria-valuemax={progress.total} aria-valuenow={progress.done}>
            <span style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }} />
          </div>
        )}
        <button
          type="button"
          className="btn btn-primary"
          onClick={runImport}
          disabled={busy || !!blocker || validRows.length === 0}
        >
          {busy ? tr(t.importing, { done: progress.done, total: progress.total }) : tr(t.start, { n: validRows.length })}
        </button>
        {!busy && invalidCount > 0 && validRows.length > 0 && <small>{t.skipInvalidNote}</small>}
      </div>
    </div>
  );
}

function Head({ t, isAdmin, stepIdx }: { t: ReturnType<typeof useDict>['importer']; isAdmin: boolean; stepIdx: number }) {
  const steps = [t.steps.file, t.steps.columns, t.steps.check];
  return (
    <>
      <div className="st-form-head">
        <BackLink href="/app/products" className="btn btn-plain btn-sm st-form-back">{t.back}</BackLink>
        <div>
          <h1>{t.title}</h1>
          <p>{t.subtitle}. {isAdmin ? t.hintAdmin : t.hintBranch}</p>
        </div>
      </div>
      <ol className="im-steps">
        {steps.map((s, i) => (
          <li key={s} aria-current={i === stepIdx ? 'step' : undefined} className={i < stepIdx ? 'im-step--done' : undefined}>
            <span className="im-step-n" aria-hidden="true">{i < stepIdx ? <Icon name="check" size={12} /> : i + 1}</span>{s}
          </li>
        ))}
      </ol>
    </>
  );
}
