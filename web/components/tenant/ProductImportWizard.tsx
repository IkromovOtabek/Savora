'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
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
  templateFieldsFor,
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

  // Yangi ekran (fayl → tekshirish → natija) tepadan ochiladi; import paytida joyida qoladi
  useEffect(() => {
    if (stage !== 'importing') window.scrollTo({ top: 0 });
  }, [stage]);

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

  const stepIdx = stage === 'file' ? 0 : stage === 'done' ? 2 : 1;

  /** Namuna CSV: BOM (Excel kirill/lotinni to'g'ri ochsin) + «;» ajratuvchi — sarlavhalar o'zi taniladi */
  function downloadTemplate() {
    const cell = (v: string) => (/[;"\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
    const csv = `\uFEFF${templateFieldsFor(ctx).map((f) => cell(t.fields[f])).join(';')}\r\n`;
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = t.templateFile;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  // ─────────────── 3. Natija ───────────────
  if (stage === 'done') {
    const n = (s: ImportRowResult['status']) => results.filter((r) => r.status === s).length;
    const problems = results.filter((r) => r.status === 'skipped' || r.status === 'error');
    const noImei = results.filter((r) => r.noImei).length;
    const added = n('created') + n('restocked');
    const invalidByLine = new Map(checked.filter((c) => !c.res.ok).map((c) => [c.raw.line, c.res.ok ? [] : c.res.issues]));
    const tiles = [
      { key: 'created', v: n('created'), cls: n('created') ? 'ok' : '' },
      { key: 'restocked', v: n('restocked'), cls: 'ok' },
      { key: 'skipped', v: n('skipped'), cls: '' },
      { key: 'failed', v: n('error'), cls: 'bad' },
    ] as const;
    return (
      <div className="im-page">
        <Head t={t} isAdmin={isAdmin} stepIdx={stepIdx} />
        <section className="st-group im-done" aria-live="polite">
          <span className={`im-done-ic${added > 0 ? '' : ' im-done-ic--warn'}`} aria-hidden="true">
            <Icon name={added > 0 ? 'check' : 'alert'} size={28} />
          </span>
          <h2>{t.resultTitle}</h2>
          <p className="im-done-lead">{n('created') > 0 ? tr(t.resLead, { n: n('created') }) : t.resNone}</p>
          {stopError && <div className="auth-alert auth-alert--error">{stopError}</div>}
          <ul className="im-tiles">
            {tiles.filter((x) => x.key === 'created' || x.v > 0).map((x) => (
              <li key={x.key} className={x.cls ? `im-tile im-tile--${x.cls}` : 'im-tile'}>
                <b>{fmtMoney(x.v)}</b>
                <span>{t.resTiles[x.key]}</span>
              </li>
            ))}
          </ul>
          {noImei > 0 && (
            <div className="auth-alert auth-alert--warn im-alert" role="status">
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
          <>
            <div className="st-ghead im-ghead"><span>{t.problemsTitle}</span></div>
            <section className="st-group im-table-wrap">
              <div className="im-scroll">
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
              </div>
            </section>
          </>
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
          <span className="im-drop-ic" aria-hidden="true"><Icon name="download" size={28} /></span>
          <b>{reading ? t.reading : t.dropTitle}</b>
          <small>{tr(t.dropHint, { max: fmtMoney(IMPORT_MAX_ROWS) })}</small>
          <span className="btn btn-primary im-drop-btn">{t.choose}</span>
        </label>
        <div className="st-group im-tpl">
          <span className="ux-clay ux-clay--green im-tpl-ic" aria-hidden="true"><Icon name="clipboard" size={18} /></span>
          <div className="im-tpl-txt">
            <b>{t.templateTitle}</b>
            <small>{t.templateHint}</small>
          </div>
          <button type="button" className="btn btn-tinted btn-sm btn-with-icon" onClick={downloadTemplate}>
            <Icon name="download" size={16} /> {t.templateBtn}
          </button>
        </div>
      </div>
    );
  }

  // ─────────────── 2. Tekshirish ───────────────
  const busy = stage === 'importing';
  const previewItems = (onlyErrors ? checked.filter((c) => !c.res.ok) : checked).slice(0, PREVIEW_ROWS);
  const noImeiCount = ctx.phoneShop ? checked.filter((c) => c.res.ok && !c.res.row.imei).length : 0;
  const takenCols = mapping.filter((m) => m.type !== 'skip').length;
  const samples = (col: number) => {
    const out: string[] = [];
    for (let r = headerRow + 1; r < rows.length && out.length < 3; r++) {
      const v = cellText(rows[r]?.[col]).trim();
      if (v) out.push(v);
    }
    return out;
  };
  const targetValue = (m: ColumnTarget | undefined) => (!m || m.type === 'skip' ? 'skip' : m.type === 'extra' ? 'extra' : m.field);
  const canImport = !busy && !blocker && validRows.length > 0;

  return (
    <div className="im-page">
      <Head t={t} isAdmin={isAdmin} stepIdx={stepIdx} />

      {/* Fayl */}
      <div className="st-group im-file">
        <span className="ux-clay ux-clay--green im-file-ic" aria-hidden="true"><Icon name="clipboard" size={18} /></span>
        <div className="im-file-main">
          <b>{fileName}</b>
          <small>{tr(t.fileRows, { n: fmtMoney(Math.max(0, rows.length - headerRow - 1)) })}</small>
        </div>
        {sheets.length > 1 && (
          <select className="im-file-sheet" value={sheetIdx} onChange={(e) => chooseSheet(Number(e.target.value))} disabled={busy} aria-label={t.sheet}>
            {sheets.map((s, i) => <option key={i} value={i}>{s.name}</option>)}
          </select>
        )}
        <button type="button" className="btn btn-tinted btn-sm" onClick={reset} disabled={busy}>{t.changeFile}</button>
      </div>

      {/* Xulosa */}
      <section className="im-sum" aria-label={t.previewTitle}>
        <div className="im-sum-item im-sum-item--ok">
          <span className="ux-clay ux-clay--green" aria-hidden="true"><Icon name="check" size={16} /></span>
          <div><b>{fmtMoney(validRows.length)}</b><span>{t.statReady}<small> · {t.statReadyHint}</small></span></div>
        </div>
        <div className={`im-sum-item${invalidCount ? ' im-sum-item--bad' : ''}`}>
          <span className={`ux-clay ${invalidCount ? 'ux-clay--red' : 'ux-clay--gray'}`} aria-hidden="true"><Icon name="alert" size={16} /></span>
          <div><b>{fmtMoney(invalidCount)}</b><span>{t.statErrors}<small> · {t.statErrorsHint}</small></span></div>
        </div>
        {ctx.phoneShop && (
          <div className={`im-sum-item${noImeiCount ? ' im-sum-item--warn' : ''}`}>
            <span className={`ux-clay ${noImeiCount ? 'ux-clay--gold' : 'ux-clay--gray'}`} aria-hidden="true"><Icon name="phone" size={16} /></span>
            <div><b>{fmtMoney(noImeiCount)}</b><span>{t.statNoImei}<small> · {t.statNoImeiHint}</small></span></div>
          </div>
        )}
      </section>

      {blocker ? (
        <div className="auth-alert auth-alert--error im-alert" role="alert"><Icon name="alert" size={16} /><span>{blocker}</span></div>
      ) : imeiNote ? (
        <div className="auth-alert auth-alert--warn im-alert" role="status"><Icon name="alert" size={16} /><span>{imeiNote}</span></div>
      ) : null}

      {/* Ustunlar */}
      <div className="st-ghead im-ghead">
        <span>{t.columnsTitle}</span>
        <span className="im-ghead-aside">{tr(t.columnsCount, { n: takenCols, total: headers.length })}</span>
      </div>
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
            const title = cellText(h).trim() || tr(t.noHeader, { col: colLetter(col) });
            return (
              <li key={col} className={`im-col im-col--${v === 'skip' ? 'skip' : v === 'extra' ? 'extra' : 'field'}`}>
                <div className="im-col-head">
                  <span className="im-col-letter" aria-hidden="true">{colLetter(col)}</span>
                  <b title={title}>{title}</b>
                </div>
                <small className="im-col-sample" title={s.join(' · ')}>{s.join(' · ') || '—'}</small>
                <select
                  value={v}
                  onChange={(e) => setTarget(col, e.target.value)}
                  disabled={busy}
                  aria-label={`${t.colTarget}: ${title}`}
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
              </li>
            );
          })}
        </ul>
      </section>

      {/* Qo'shimcha sozlamalar — kamdan-kam kerak, sukut bo'yicha yopiq */}
      <details className="st-group im-more">
        <summary>
          <span className="ux-clay ux-clay--gray" aria-hidden="true"><Icon name="settings" size={16} /></span>
          <span className="im-more-txt"><b>{t.moreTitle}</b><small>{t.moreHint}</small></span>
          <span className="im-more-chev" aria-hidden="true"><Icon name="chevron" size={16} /></span>
        </summary>
        <div className="im-more-body">
          <div className="im-more-sec">
            <h3>{tr(t.dupTitle, { code: ctx.phoneShop ? t.dupCodeImei : t.dupCodeBarcode })}</h3>
            <div className="st-seg im-seg" role="radiogroup">
              {(['skip', 'restock'] as const).map((mode) => (
                <label key={mode}>
                  <input type="radio" name="im-dup" value={mode} checked={duplicate === mode} onChange={() => setDuplicate(mode)} disabled={busy} />
                  <span>{mode === 'skip' ? t.dupSkip : t.dupRestock}</span>
                </label>
              ))}
            </div>
            <small>{duplicate === 'skip' ? t.dupSkipHint : t.dupRestockHint}</small>
          </div>

          <div className="im-more-sec">
            <h3>{t.headerRow}</h3>
            <select value={headerRow} onChange={(e) => chooseHeaderRow(Number(e.target.value))} disabled={busy} aria-label={t.headerRow}>
              {rows.slice(0, 15).map((r, i) => (
                <option key={i} value={i}>
                  {tr(t.headerRowOpt, { n: i + 1, text: r.filter((c) => c !== null).slice(0, 3).map(cellText).join(', ').slice(0, 40) || '—' })}
                </option>
              ))}
            </select>
          </div>

          <div className="im-more-sec">
            <h3>{t.addColTitle}</h3>
            <small>{t.addColHint}</small>
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
          </div>
        </div>
      </details>

      {/* Ko'rib chiqish */}
      <div className="st-ghead im-ghead">
        <span>{t.previewTitle}</span>
        {invalidCount > 0 && (
          <div className="st-seg im-seg im-seg--sm" role="radiogroup" aria-label={t.previewTitle}>
            <label>
              <input type="radio" name="im-view" checked={!onlyErrors} onChange={() => setOnlyErrors(false)} />
              <span>{t.viewAll}</span>
            </label>
            <label>
              <input type="radio" name="im-view" checked={onlyErrors} onChange={() => setOnlyErrors(true)} />
              <span>{tr(t.viewErrors, { n: invalidCount })}</span>
            </label>
          </div>
        )}
      </div>
      <section className="st-group im-table-wrap">
        {checked.length === 0 ? (
          <p className="im-empty">{blocker ?? t.noRows}</p>
        ) : (
          <>
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
                        <td className="im-code">
                          {row && ctx.phoneShop && !row.imei
                            ? <span className="im-later">{t.imeiLater}</span>
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

      {/* Pastki panel — tugma doim ko'rinadi */}
      <div className="im-bar">
        {busy ? (
          <div className="im-progress" role="progressbar" aria-valuemin={0} aria-valuemax={progress.total} aria-valuenow={progress.done}>
            <span style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }} />
          </div>
        ) : (
          <div className="im-bar-txt">
            <b>{t.statReady}: {fmtMoney(validRows.length)}</b>
            {invalidCount > 0 && <small>{tr(t.viewErrors, { n: invalidCount })} · {t.statErrorsHint}</small>}
          </div>
        )}
        <button type="button" className="btn btn-primary im-bar-btn" onClick={runImport} disabled={!canImport}>
          {busy ? tr(t.importing, { done: progress.done, total: progress.total }) : tr(t.start, { n: fmtMoney(validRows.length) })}
        </button>
      </div>
    </div>
  );
}

function Head({ t, isAdmin, stepIdx }: { t: ReturnType<typeof useDict>['importer']; isAdmin: boolean; stepIdx: number }) {
  const steps = [t.steps.file, t.steps.check, t.steps.done];
  return (
    <>
      <div className="st-form-head im-head">
        <BackLink href="/app/products" className="btn btn-plain btn-sm st-form-back">{t.back}</BackLink>
        <div>
          <h1>{t.title}</h1>
          <p>{isAdmin ? t.hintAdmin : t.hintBranch}</p>
        </div>
      </div>
      <ol className="im-steps">
        {steps.map((s, i) => {
          const done = i < stepIdx || stepIdx === 2;
          return (
            <li key={s} aria-current={i === stepIdx ? 'step' : undefined} className={done ? 'im-step--done' : undefined}>
              <span className="im-step-n" aria-hidden="true">{done ? <Icon name="check" size={12} /> : i + 1}</span>
              <span className="im-step-l">{s}</span>
            </li>
          );
        })}
      </ol>
    </>
  );
}
