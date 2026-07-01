import { useState, useEffect, useRef } from 'react';
import { api } from '../../lib/api';
import { toast } from '../../lib/toast';
import { Button } from '../../components/ui/Button.jsx';

/* ── Status badge ────────────────────────────────────────────────────────── */
function StatusBadge({ status }) {
  const map = {
    completed:  { label: 'Completed',  bg: 'var(--badge-green-bg)',  color: 'var(--green)' },
    processing: { label: 'Processing', bg: 'var(--badge-yellow-bg)', color: 'var(--yellow)' },
    failed:     { label: 'Failed',     bg: 'var(--badge-red-bg)',    color: 'var(--red)' },
  };
  const s = map[status] || map.processing;
  return (
    <span style={{
      fontSize: 'var(--text-xs)', fontWeight: 600,
      padding: '2px 8px', borderRadius: 999,
      background: s.bg, color: s.color,
    }}>
      {s.label}
    </span>
  );
}

/* ── Import history row ──────────────────────────────────────────────────── */
function ImportRow({ imp }) {
  const date = new Date(imp.created_at).toLocaleString('en-NG', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '1fr auto auto auto auto auto',
      alignItems: 'center',
      gap: 'var(--space-4)',
      padding: 'var(--space-3) var(--space-4)',
      borderBottom: '1px solid var(--border)',
      fontSize: 'var(--text-sm)',
    }}>
      <div style={{ minWidth: 0 }}>
        <p style={{ fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {imp.filename}
        </p>
        <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-3)', marginTop: 2 }}>{date}</p>
      </div>
      <span style={{ color: 'var(--text-2)', textAlign: 'right' }}>{imp.total_rows.toLocaleString()} rows</span>
      <span style={{ color: 'var(--green)', textAlign: 'right', fontWeight: 600 }}>↑ {imp.imported.toLocaleString()}</span>
      <span style={{ color: 'var(--text-3)', textAlign: 'right' }}>skip {imp.skipped}</span>
      <span style={{ color: imp.errors > 0 ? 'var(--red)' : 'var(--text-3)', textAlign: 'right' }}>
        {imp.errors > 0 ? `⚠ ${imp.errors} err` : '✓'}
      </span>
      <StatusBadge status={imp.status} />
    </div>
  );
}

/* ── Drop zone ───────────────────────────────────────────────────────────── */
function DropZone({ onFile, disabled }) {
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef(null);

  function handleDrop(e) {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) onFile(f);
  }

  return (
    <div
      onDragOver={e => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      onClick={() => !disabled && inputRef.current?.click()}
      style={{
        border: `2px dashed ${dragging ? 'var(--accent)' : 'var(--border)'}`,
        borderRadius: 'var(--radius-md)',
        padding: 'var(--space-10)',
        textAlign: 'center',
        cursor: disabled ? 'default' : 'pointer',
        background: dragging ? 'color-mix(in srgb, var(--accent) 5%, transparent)' : 'var(--bg-2)',
        transition: 'all 0.15s ease',
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".csv,.CSV"
        onChange={e => e.target.files[0] && onFile(e.target.files[0])}
        style={{ display: 'none' }}
      />
      <p style={{ fontSize: 28, marginBottom: 'var(--space-2)' }}>📂</p>
      <p style={{ fontWeight: 600, fontSize: 'var(--text-base)', color: 'var(--text)', marginBottom: 'var(--space-1)' }}>
        {dragging ? 'Drop it here' : 'Click or drag INEC CSV here'}
      </p>
      <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-3)' }}>
        Maximum 20 MB · CSV format only
      </p>
    </div>
  );
}

/* ── Progress bar ────────────────────────────────────────────────────────── */
function Progress({ value, max, label }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, fontSize: 'var(--text-sm)' }}>
        <span style={{ color: 'var(--text-2)' }}>{label}</span>
        <span style={{ fontWeight: 600, color: 'var(--text)' }}>{pct}%</span>
      </div>
      <div style={{ height: 8, background: 'var(--border)', borderRadius: 999, overflow: 'hidden' }}>
        <div style={{
          height: '100%',
          width: `${pct}%`,
          background: 'var(--accent)',
          borderRadius: 999,
          transition: 'width 0.4s ease',
        }} />
      </div>
      <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-3)', marginTop: 4 }}>
        {value.toLocaleString()} of {max.toLocaleString()}
      </p>
    </div>
  );
}

/* ── Main page ───────────────────────────────────────────────────────────── */
export default function VoterImportPage() {
  const [imports, setImports] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(true);

  const [file, setFile]           = useState(null);
  const [importing, setImporting] = useState(false);
  const [result, setResult]       = useState(null);

  async function loadHistory() {
    try {
      const data = await api.listImports();
      setImports(data);
    } catch {
      // history is non-critical
    } finally {
      setLoadingHistory(false);
    }
  }

  useEffect(() => { loadHistory(); }, []);

  function handleFile(f) {
    setFile(f);
    setResult(null);
  }

  async function handleImport() {
    if (!file) return;
    setImporting(true);
    setResult(null);
    const fd = new FormData();
    fd.append('file', file);
    try {
      const data = await api.importINECVoters(fd);
      setResult({ ok: true, ...data });
      toast.success(`Import complete — ${data.imported.toLocaleString()} voters seeded.`);
      setFile(null);
      await loadHistory();
    } catch (err) {
      setResult({ ok: false, error: err.message || 'Import failed.' });
      toast.error(err.message || 'Import failed.');
    } finally {
      setImporting(false);
    }
  }

  return (
    <div style={{ padding: 'var(--space-5)', maxWidth: 800, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: 'var(--space-6)' }}>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-xl)', fontWeight: 700 }}>
          Voter Register Import
        </h1>
        <p style={{ color: 'var(--text-2)', fontSize: 'var(--text-sm)', marginTop: 4 }}>
          Upload your INEC voter register CSV to pre-seed the voter roster for your agents.
          Agents search by name and confirm with a phone number in ~10 seconds.
        </p>
      </div>

      {/* Requirements notice */}
      <div style={{
        padding: 'var(--space-4)',
        borderRadius: 'var(--radius-md)',
        background: 'color-mix(in srgb, var(--accent) 8%, transparent)',
        border: '1px solid color-mix(in srgb, var(--accent) 25%, transparent)',
        marginBottom: 'var(--space-6)',
        fontSize: 'var(--text-sm)',
        color: 'var(--text-2)',
        lineHeight: 1.6,
      }}>
        <p style={{ fontWeight: 600, color: 'var(--text)', marginBottom: 'var(--space-2)' }}>Before importing</p>
        <ol style={{ paddingLeft: 'var(--space-5)', margin: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
          <li>Territory must be set up with zones and polling units including their INEC codes.</li>
          <li>INEC codes in your polling units must match those in the CSV (e.g. <code>25/01/03/001</code>).</li>
          <li>The CSV must come directly from INEC — do not modify column headers.</li>
          <li>Voters without a matching polling unit code are skipped and counted as errors.</li>
        </ol>
      </div>

      {/* Upload area */}
      <div className="card" style={{ marginBottom: 'var(--space-6)' }}>
        <h2 style={{ fontSize: 'var(--text-base)', fontWeight: 600, marginBottom: 'var(--space-4)' }}>Upload CSV</h2>

        <DropZone onFile={handleFile} disabled={importing} />

        {file && !importing && !result && (
          <div style={{
            marginTop: 'var(--space-4)',
            padding: 'var(--space-3) var(--space-4)',
            borderRadius: 'var(--radius)',
            background: 'var(--bg-2)',
            border: '1px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 'var(--space-3)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', minWidth: 0 }}>
              <span style={{ fontSize: 20 }}>📄</span>
              <div style={{ minWidth: 0 }}>
                <p style={{ fontWeight: 600, fontSize: 'var(--text-sm)', color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file.name}</p>
                <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-3)' }}>
                  {(file.size / 1024 / 1024).toFixed(2)} MB
                </p>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 'var(--space-2)', flexShrink: 0 }}>
              <Button variant="ghost" size="sm" onClick={() => setFile(null)} style={{ color: 'var(--text-3)' }}>✕</Button>
              <Button variant="primary" size="sm" onClick={handleImport}>Import</Button>
            </div>
          </div>
        )}

        {/* Importing progress */}
        {importing && (
          <div style={{ marginTop: 'var(--space-4)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', color: 'var(--text-2)', marginBottom: 'var(--space-4)' }}>
              <div className="spinner" />
              <span>Processing {file?.name}…</span>
            </div>
            <div style={{ height: 6, background: 'var(--border)', borderRadius: 999, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: '100%', background: 'var(--accent)', borderRadius: 999, animation: 'pulse 1.5s ease-in-out infinite' }} />
            </div>
            <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-3)', marginTop: 8 }}>
              Large files may take 30–60 seconds…
            </p>
          </div>
        )}

        {/* Result */}
        {result && (
          <div style={{
            marginTop: 'var(--space-4)',
            padding: 'var(--space-4)',
            borderRadius: 'var(--radius)',
            background: result.ok ? 'color-mix(in srgb, var(--green) 8%, transparent)' : 'color-mix(in srgb, var(--red) 8%, transparent)',
            border: `1px solid ${result.ok ? 'color-mix(in srgb, var(--green) 25%, transparent)' : 'color-mix(in srgb, var(--red) 25%, transparent)'}`,
          }}>
            {result.ok ? (
              <>
                <p style={{ fontWeight: 700, color: 'var(--green)', marginBottom: 'var(--space-3)' }}>
                  Import complete ✓
                </p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 'var(--space-3)', fontSize: 'var(--text-sm)' }}>
                  <div style={{ textAlign: 'center' }}>
                    <p style={{ fontSize: 'var(--text-2xl)', fontWeight: 700, color: 'var(--green)' }}>{result.imported.toLocaleString()}</p>
                    <p style={{ color: 'var(--text-3)' }}>Imported</p>
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <p style={{ fontSize: 'var(--text-2xl)', fontWeight: 700, color: 'var(--text-2)' }}>{result.skipped.toLocaleString()}</p>
                    <p style={{ color: 'var(--text-3)' }}>Skipped</p>
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <p style={{ fontSize: 'var(--text-2xl)', fontWeight: 700, color: result.errors > 0 ? 'var(--red)' : 'var(--text-2)' }}>
                      {result.errors.toLocaleString()}
                    </p>
                    <p style={{ color: 'var(--text-3)' }}>Errors</p>
                  </div>
                </div>
                {result.error_sample?.length > 0 && (
                  <div style={{ marginTop: 'var(--space-3)' }}>
                    <p style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--red)', marginBottom: 4 }}>
                      Error sample (first {result.error_sample.length}):
                    </p>
                    {result.error_sample.map((e, i) => (
                      <p key={i} style={{ fontSize: 'var(--text-xs)', color: 'var(--red)' }}>
                        Row {e.row}: {e.error}
                      </p>
                    ))}
                    {result.errors > result.error_sample.length && (
                      <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-3)', marginTop: 4 }}>
                        …and {result.errors - result.error_sample.length} more. Common cause: polling unit INEC codes not set up in Territory.
                      </p>
                    )}
                  </div>
                )}
              </>
            ) : (
              <p style={{ color: 'var(--red)', fontWeight: 600 }}>
                {result.error}
              </p>
            )}
          </div>
        )}
      </div>

      {/* Import history */}
      <div className="card">
        <h2 style={{ fontSize: 'var(--text-base)', fontWeight: 600, marginBottom: 'var(--space-1)' }}>Import History</h2>
        <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-3)', marginBottom: 'var(--space-4)' }}>Last 20 imports for this campaign</p>

        {loadingHistory ? (
          <div style={{ padding: 'var(--space-6)', textAlign: 'center' }}>
            <div className="spinner" style={{ margin: '0 auto' }} />
          </div>
        ) : imports.length === 0 ? (
          <div style={{ padding: 'var(--space-6)', textAlign: 'center', color: 'var(--text-3)' }}>
            <p style={{ fontSize: 'var(--text-sm)' }}>No imports yet.</p>
          </div>
        ) : (
          <div>
            {/* Header row */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: '1fr auto auto auto auto auto',
              gap: 'var(--space-4)',
              padding: 'var(--space-2) var(--space-4)',
              borderBottom: '2px solid var(--border)',
              fontSize: 'var(--text-xs)',
              fontWeight: 600,
              color: 'var(--text-3)',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
            }}>
              <span>File</span>
              <span>Rows</span>
              <span>Imported</span>
              <span>Skipped</span>
              <span>Errors</span>
              <span>Status</span>
            </div>
            {imports.map(imp => <ImportRow key={imp.id} imp={imp} />)}
          </div>
        )}
      </div>
    </div>
  );
}
