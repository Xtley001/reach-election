import { useState, useEffect } from 'react';
import { api } from '../../lib/api';
import { toast } from '../../lib/toast';
import { Button } from '../../components/ui/Button.jsx';
import { Input } from '../../components/ui/Input.jsx';

/* ── Reusable modal shell ─────────────────────────────────────────────── */
function Modal({ title, onClose, children }) {
  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.4)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000, padding:'var(--space-5)' }}>
      <div className="card-elevated" style={{ width:'100%', maxWidth:440, maxHeight:'90dvh', overflowY:'auto' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'var(--space-5)' }}>
          <h3 style={{ fontFamily:'var(--font-display)', fontSize:'var(--text-lg)', fontWeight:600 }}>{title}</h3>
          <button onClick={onClose} style={{ background:'none', border:'none', fontSize:20, cursor:'pointer', color:'var(--text-2)', lineHeight:1 }}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

/* ── Zone Card ────────────────────────────────────────────────────────── */
function ZoneCard({ zone, onAddPU, onDelete, onSelect, selected }) {
  return (
    <div className="card" onClick={() => onSelect(zone)}
      style={{ cursor:'pointer', border: selected ? '1.5px solid var(--accent)' : '1px solid var(--border)', transition:'border 0.15s' }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
        <div>
          <p style={{ fontWeight:600, fontSize:'var(--text-base)', color:'var(--text)' }}>{zone.name}</p>
          <p style={{ fontSize:'var(--text-xs)', color:'var(--text-3)', marginTop:2 }}>
            {zone.pu_count} polling unit{zone.pu_count !== 1 ? 's' : ''} · {zone.voter_count} voter{zone.voter_count !== 1 ? 's' : ''}
          </p>
        </div>
        <div style={{ display:'flex', gap:'var(--space-2)' }}>
          <Button size="sm" variant="outline" onClick={e=>{e.stopPropagation();onAddPU(zone);}}>+ PU</Button>
          <Button size="sm" variant="ghost" onClick={e=>{e.stopPropagation();onDelete(zone);}} style={{ color:'var(--red)' }}>✕</Button>
        </div>
      </div>
    </div>
  );
}

/* ── CSV Upload panel ─────────────────────────────────────────────────── */
function CSVImporter({ onDone }) {
  const [loading, setLoading] = useState(false);
  const [result, setResult]   = useState(null);

  async function handleFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    setLoading(true);
    setResult(null);
    const fd = new FormData();
    fd.append('file', file);
    try {
      const data = await api.importPUs(fd);
      setResult(data);
      if (data.success) { toast.success(`Imported ${data.imported} polling unit(s).`); onDone(); }
    } catch(err) { toast.error(err.message || 'Import failed.'); }
    finally { setLoading(false); }
  }

  return (
    <div>
      <p style={{ fontSize:'var(--text-sm)', color:'var(--text-2)', marginBottom:'var(--space-4)' }}>
        CSV columns: <code>polling_unit_name, zone_name, inec_code (optional), registered_voters (optional)</code>
      </p>
      <label style={{ display:'block', border:'2px dashed var(--border)', borderRadius:'var(--radius-md)', padding:'var(--space-8)', textAlign:'center', cursor:'pointer' }}>
        <input type="file" accept=".csv" onChange={handleFile} style={{ display:'none' }} />
        <p style={{ fontSize:'var(--text-base)', color:'var(--text-2)' }}>{loading ? 'Importing…' : '📂 Click to upload CSV'}</p>
      </label>
      {result && !result.success && (
        <div style={{ marginTop:'var(--space-4)', background:'var(--badge-red-bg)', borderRadius:'var(--radius)', padding:'var(--space-3)' }}>
          <p style={{ color:'var(--red)', fontWeight:600, fontSize:'var(--text-sm)', marginBottom:4 }}>{result.errors.length} row error(s)</p>
          {result.errors.slice(0,5).map((err,i) => (
            <p key={i} style={{ fontSize:'var(--text-xs)', color:'var(--red)' }}>Row {err.row}: {err.error}</p>
          ))}
        </div>
      )}
      <Button variant="outline" size="sm" style={{ marginTop:'var(--space-3)' }}
        onClick={() => api.importPUs.toString() && window.open('/v1/polling-units/template')}>
        Download template
      </Button>
    </div>
  );
}

/* ── Main TerritoryPage ───────────────────────────────────────────────── */
export default function TerritoryPage() {
  const [zones,setZones]       = useState([]);
  const [pus,setPUs]           = useState([]);
  const [selectedZone,setSel]  = useState(null);
  const [modal,setModal]       = useState(null); // 'add_zone'|'add_pu'|'csv'
  const [zoneName,setZoneName] = useState('');
  const [zoneRV,setZoneRV]     = useState('');
  const [puName,setPuName]     = useState('');
  const [puCode,setPuCode]     = useState('');
  const [puRV,setPuRV]         = useState('');
  const [loading,setLoading]   = useState(false);
  const [fetching,setFetching] = useState(true);

  async function loadZones() {
    try { setZones(await api.listZones()); } catch(e) { toast.error('Failed to load zones.'); }
    finally { setFetching(false); }
  }

  async function loadPUs(zoneId) {
    try { setPUs(await api.listPUs(zoneId)); } catch {}
  }

  useEffect(() => { loadZones(); }, []);
  useEffect(() => { if (selectedZone) loadPUs(selectedZone.id); else setPUs([]); }, [selectedZone]);

  async function addZone() {
    if (!zoneName.trim()) return;
    setLoading(true);
    try {
      await api.createZone({ name: zoneName.trim(), registered_voter_count: zoneRV ? parseInt(zoneRV) : null });
      toast.success(`Zone "${zoneName}" created.`);
      setZoneName(''); setZoneRV(''); setModal(null);
      await loadZones();
    } catch(e) { toast.error(e.message || 'Failed to create zone.'); }
    finally { setLoading(false); }
  }

  async function deleteZone(zone) {
    if (!window.confirm(`Delete zone "${zone.name}"?`)) return;
    try {
      await api.deleteZone(zone.id);
      toast.success('Zone deleted.');
      if (selectedZone?.id === zone.id) setSel(null);
      await loadZones();
    } catch(e) { toast.error(e.message || 'Cannot delete zone.'); }
  }

  async function addPU() {
    if (!puName.trim() || !selectedZone) return;
    setLoading(true);
    try {
      await api.createPU({ zone_id: selectedZone.id, name: puName.trim(), inec_code: puCode || null, registered_voters: puRV ? parseInt(puRV) : null });
      toast.success('Polling unit added.');
      setPuName(''); setPuCode(''); setPuRV(''); setModal(null);
      await Promise.all([loadZones(), loadPUs(selectedZone.id)]);
    } catch(e) { toast.error(e.message || 'Failed to add polling unit.'); }
    finally { setLoading(false); }
  }

  if (fetching) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'60vh' }}>
      <div className="spinner" />
    </div>
  );

  return (
    <div style={{ padding:'var(--space-5)', maxWidth:900, margin:'0 auto' }}>
      {/* Header */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'var(--space-6)' }}>
        <div>
          <h1 style={{ fontFamily:'var(--font-display)', fontSize:'var(--text-xl)', fontWeight:700 }}>Territory</h1>
          <p style={{ color:'var(--text-2)', fontSize:'var(--text-sm)' }}>{zones.length} zone{zones.length!==1?'s':''}</p>
        </div>
        <div style={{ display:'flex', gap:'var(--space-2)' }}>
          <Button variant="outline" size="sm" onClick={()=>setModal('csv')}>Import CSV</Button>
          <Button variant="primary" size="sm" onClick={()=>setModal('add_zone')}>+ Zone</Button>
        </div>
      </div>

      {/* Two-panel layout */}
      <div style={{ display:'grid', gridTemplateColumns: selectedZone ? '1fr 1fr' : '1fr', gap:'var(--space-4)' }}>
        {/* Zones list */}
        <div style={{ display:'flex', flexDirection:'column', gap:'var(--space-3)' }}>
          {zones.length === 0 ? (
            <div className="card" style={{ textAlign:'center', padding:'var(--space-10)', color:'var(--text-3)' }}>
              <p style={{ fontSize:'var(--text-2xl)', marginBottom:'var(--space-2)' }}>🗺️</p>
              <p style={{ fontWeight:600, color:'var(--text-2)' }}>No zones yet</p>
              <p style={{ fontSize:'var(--text-sm)', marginTop:'var(--space-1)' }}>Create your first zone to get started.</p>
            </div>
          ) : zones.map(z => (
            <ZoneCard key={z.id} zone={z}
              selected={selectedZone?.id === z.id}
              onSelect={setSel}
              onAddPU={zone => { setSel(zone); setModal('add_pu'); }}
              onDelete={deleteZone}
            />
          ))}
        </div>

        {/* Polling units panel */}
        {selectedZone && (
          <div>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'var(--space-3)' }}>
              <p style={{ fontWeight:600, fontSize:'var(--text-sm)' }}>{selectedZone.name} — Polling Units</p>
              <Button size="sm" variant="outline" onClick={()=>setModal('add_pu')}>+ Add</Button>
            </div>
            <div style={{ display:'flex', flexDirection:'column', gap:'var(--space-2)' }}>
              {pus.length === 0 ? (
                <div className="card" style={{ textAlign:'center', padding:'var(--space-6)', color:'var(--text-3)' }}>
                  <p style={{ fontSize:'var(--text-sm)' }}>No polling units in this zone.</p>
                </div>
              ) : pus.map(pu => (
                <div key={pu.id} className="card" style={{ padding:'var(--space-3) var(--space-4)' }}>
                  <p style={{ fontWeight:600, fontSize:'var(--text-sm)', color:'var(--text)' }}>{pu.name}</p>
                  <p style={{ fontSize:'var(--text-xs)', color:'var(--text-3)', marginTop:2 }}>
                    {pu.inec_code ? `Code: ${pu.inec_code} · ` : ''}
                    {pu.registered_voters ? `${pu.registered_voters.toLocaleString()} registered` : 'No reg. count'}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Add Zone Modal */}
      {modal==='add_zone' && (
        <Modal title="Add Zone" onClose={()=>{ setModal(null); setZoneName(''); setZoneRV(''); }}>
          <div style={{ display:'flex', flexDirection:'column', gap:'var(--space-4)' }}>
            <div>
              <label className="field-label" style={{ display:'block', marginBottom:'var(--space-2)' }}>Zone name</label>
              <Input placeholder="e.g. Ibadan North" value={zoneName} onChange={e=>setZoneName(e.target.value)} autoFocus
                onKeyDown={e=>e.key==='Enter' && addZone()} />
            </div>
            <div>
              <label className="field-label" style={{ display:'block', marginBottom:'var(--space-2)' }}>Registered voters (optional)</label>
              <Input type="number" min="1" placeholder="e.g. 45000" value={zoneRV} onChange={e=>setZoneRV(e.target.value)} />
            </div>
            <Button variant="primary" onClick={addZone} disabled={loading || !zoneName.trim()}>
              {loading ? 'Creating…' : 'Create Zone'}
            </Button>
          </div>
        </Modal>
      )}

      {/* Add PU Modal */}
      {modal==='add_pu' && selectedZone && (
        <Modal title={`Add Polling Unit — ${selectedZone.name}`} onClose={()=>{ setModal(null); setPuName(''); setPuCode(''); setPuRV(''); }}>
          <div style={{ display:'flex', flexDirection:'column', gap:'var(--space-4)' }}>
            <div>
              <label className="field-label" style={{ display:'block', marginBottom:'var(--space-2)' }}>Polling unit name</label>
              <Input placeholder="e.g. Oke-Ado PU 001" value={puName} onChange={e=>setPuName(e.target.value)} autoFocus />
            </div>
            <div>
              <label className="field-label" style={{ display:'block', marginBottom:'var(--space-2)' }}>INEC code (optional)</label>
              <Input placeholder="e.g. OS/IB/01/01/001" value={puCode} onChange={e=>setPuCode(e.target.value)} />
            </div>
            <div>
              <label className="field-label" style={{ display:'block', marginBottom:'var(--space-2)' }}>Registered voters (optional)</label>
              <Input type="number" min="1" placeholder="e.g. 1247" value={puRV} onChange={e=>setPuRV(e.target.value)} />
            </div>
            <Button variant="primary" onClick={addPU} disabled={loading || !puName.trim()}>
              {loading ? 'Adding…' : 'Add Polling Unit'}
            </Button>
          </div>
        </Modal>
      )}

      {/* CSV Import Modal */}
      {modal==='csv' && (
        <Modal title="Bulk Import Polling Units" onClose={()=>setModal(null)}>
          <CSVImporter onDone={async()=>{ await loadZones(); setModal(null); }} />
        </Modal>
      )}
    </div>
  );
}
