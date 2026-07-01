/* REACH Election — useOfflineSync hook
   Phase 7. Spec from 08_SECURITY.md: max 10 retries, error queue, toast on complete. */
import { useEffect, useRef } from 'react';
import { getPendingSync, clearSynced, incrementRetry, getErrorCount } from '../lib/offline';
import { api } from '../lib/api';
import { toast } from '../lib/toast';

export function useOfflineSync() {
  const syncing = useRef(false);

  async function drainQueue() {
    if (syncing.current || !navigator.onLine) return;
    syncing.current = true;

    let pending;
    try { pending = await getPendingSync(); } catch { syncing.current = false; return; }
    if (!pending.length) { syncing.current = false; return; }

    let synced = 0, failed = 0;

    for (const item of pending) {
      try {
        if (item.type === 'add_voter') {
          await api.addVoter(item.payload);
        } else if (item.type === 'log_contact') {
          await api.logContact(item.payload.voter_id, item.payload);
        }
        await clearSynced(item.id);
        synced++;
      } catch (err) {
        const msg = err?.message || '';
        // 409 conflict (already exists) — discard, not an error to retry
        if (msg.includes('409') || msg.includes('already')) {
          await clearSynced(item.id);
          continue;
        }
        // Network / server error — increment retry counter
        const retryCount = await incrementRetry(item.id);
        if (retryCount >= 10) failed++;
      }
    }

    if (synced > 0) {
      toast.success(`Synced ${synced} offline item${synced !== 1 ? 's' : ''}`);
    }

    const errCount = await getErrorCount().catch(() => 0);
    if (failed > 0 || errCount > 0) {
      toast.error(`${errCount} item${errCount !== 1 ? 's' : ''} failed to sync — contact your coordinator`);
    }

    syncing.current = false;
  }

  useEffect(() => {
    window.addEventListener('online', drainQueue);
    // Drain on mount if already online
    if (navigator.onLine) drainQueue();
    return () => window.removeEventListener('online', drainQueue);
  }, []);
}
