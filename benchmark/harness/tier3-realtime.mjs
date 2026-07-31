// TIER 3 — WebSocket realtime: 4 operations x {1,5,10} viewers x 10 iterations.
//
// 4 x (1+5+10) x 10 = 640 viewer-observations.
//
// The report currently asserts zero packet loss, zero duplication and zero
// misordering without evidence. This harness measures all three directly:
//   loss        - a subscribed viewer that never receives an event it should have
//   duplication - the same event delivered more than once to one viewer
//   ordering    - per-viewer received order compared against server-side send order
//
// Every observation is recorded. Benchmark comments are tagged with a unique run
// marker and removed afterwards; the comment count is verified back to baseline.

import { WebSocket } from 'ws';
import { performance } from 'node:perf_hooks';
import { meta, writeOut, stats } from '../lib/env.mjs';
import { connect as dbConnect } from '../lib/db.mjs';

const API = 'http://127.0.0.1:3000/api';
const WS_URL = 'ws://127.0.0.1:3000';
const RECIPE_ID = 1;
const VIEWER_COUNTS = [1, 5, 10];
const ITERATIONS = 10;
const MARKER = `__BENCH2_${Date.now()}__`;

const FIX = { user: { email: 'long@foodstory.test', password: 'User123!' },
              admin: { email: 'admin@foodstory.test', password: 'Admin123!' } };

async function login(f) {
  const r = await fetch(`${API}/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(f),
  });
  if (!r.ok) throw new Error(`login HTTP ${r.status}`);
  return (await r.json()).token;
}

async function api(method, route, token, body) {
  const sent = performance.now();
  const r = await fetch(API + route, {
    method,
    headers: { Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  let data = null; try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  return { status: r.status, data, sentAt: sent, doneAt: performance.now() };
}

function openViewer(token, recipeId, id) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(WS_URL);
    const events = [];
    const t = setTimeout(() => reject(new Error(`viewer ${id} subscribe timeout`)), 8000);
    socket.on('message', (raw) => {
      let ev = null; try { ev = JSON.parse(String(raw)); } catch { ev = { parseError: String(raw).slice(0, 120) }; }
      events.push({ event: ev, receivedAt: performance.now() });
    });
    socket.on('error', (e) => { clearTimeout(t); reject(e); });
    socket.on('open', () => {
      socket.send(JSON.stringify({ type: 'subscribe', recipeId: String(recipeId), token }));
      setTimeout(() => { clearTimeout(t); resolve({ id, socket, events }); }, 200);
    });
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  let userToken, adminToken;
  try { userToken = await login(FIX.user); adminToken = await login(FIX.admin); }
  catch (e) {
    writeOut('realtime-raw.json', {
      meta: meta({ measurement: 'realtime-websocket', tier: '3' }),
      status: 'unavailable', reason: `login failed: ${e.message}`, observations: [],
    });
    return;
  }

  const db = await dbConnect();
  const [[baseline]] = await db.query('SELECT COUNT(*) n FROM comments');
  console.log(`[RT] baseline comment count: ${baseline.n}, marker ${MARKER}`);

  const observations = [];
  const operationRecords = [];
  const createdCommentIds = [];

  for (const viewerCount of VIEWER_COUNTS) {
    for (let iter = 1; iter <= ITERATIONS; iter++) {
      // Fresh viewers per iteration so subscription state cannot carry over.
      let viewers = [];
      try {
        viewers = await Promise.all(
          Array.from({ length: viewerCount }, (_, i) => openViewer(userToken, RECIPE_ID, i + 1)),
        );
      } catch (e) {
        operationRecords.push({ viewerCount, iteration: iter, status: 'unavailable',
          reason: `viewer setup failed: ${e.message}` });
        continue;
      }

      // Server-side send order for this iteration.
      const sendOrder = [];
      const ops = [];

      // 1. create comment -> new_comment
      const created = await api('POST', `/recipes/${RECIPE_ID}/comments`, userToken,
        { content: `${MARKER} v${viewerCount} i${iter} create` });
      const commentId = created.data?.comment?.id ?? created.data?.id ?? null;
      if (commentId) createdCommentIds.push(commentId);
      ops.push({ op: 'new_comment', expectType: 'new_comment', http: created.status, at: created.sentAt, commentId });
      sendOrder.push('new_comment');
      await sleep(250);

      // 2. update comment -> comment_updated
      let upd = { status: null, sentAt: performance.now() };
      if (commentId) {
        upd = await api('PUT', `/comments/${commentId}`, userToken,
          { content: `${MARKER} v${viewerCount} i${iter} updated` });
      }
      ops.push({ op: 'comment_updated', expectType: 'comment_updated', http: upd.status, at: upd.sentAt, commentId });
      sendOrder.push('comment_updated');
      await sleep(250);

      // 3. rating -> rating_updated
      // Route is /rating (singular) and the body field is rating_value; /ratings with
      // {rating} returns 404 and silently exercises none of the broadcast path.
      const rated = await api('POST', `/recipes/${RECIPE_ID}/rating`, userToken,
        { rating_value: 1 + (iter % 5) });
      ops.push({ op: 'rating_updated', expectType: 'rating_updated', http: rated.status, at: rated.sentAt });
      sendOrder.push('rating_updated');
      await sleep(250);

      // 4. delete comment -> comment_deleted
      let del = { status: null, sentAt: performance.now() };
      if (commentId) del = await api('DELETE', `/comments/${commentId}`, userToken);
      ops.push({ op: 'comment_deleted', expectType: 'comment_deleted', http: del.status, at: del.sentAt, commentId });
      sendOrder.push('comment_deleted');

      // Allow delivery to settle before inspecting.
      await sleep(900);

      for (const v of viewers) {
        const received = v.events.map((e) => e.event?.type).filter(Boolean);
        const perOp = [];
        for (const o of ops) {
          const matches = v.events.filter((e) => e.event?.type === o.expectType);
          const httpOk = o.http != null && o.http >= 200 && o.http < 300;
          perOp.push({
            op: o.op,
            httpStatus: o.http,
            httpSucceeded: httpOk,
            deliveredCount: matches.length,
            lost: httpOk && matches.length === 0,
            duplicated: matches.length > 1,
            latencyMs: matches.length
              ? Number((matches[0].receivedAt - o.at).toFixed(3)) : null,
          });
          observations.push({
            viewerCount, iteration: iter, viewerId: v.id, op: o.op,
            httpStatus: o.http, httpSucceeded: httpOk,
            deliveredCount: matches.length,
            lost: httpOk && matches.length === 0,
            duplicated: matches.length > 1,
            latencyMs: matches.length ? Number((matches[0].receivedAt - o.at).toFixed(3)) : null,
          });
        }
        // Ordering: compare the received sequence against the send sequence,
        // restricted to the event types actually expected.
        const expectedSeq = ops.filter((o) => o.http >= 200 && o.http < 300).map((o) => o.expectType);
        const receivedSeq = received.filter((t) => expectedSeq.includes(t));
        const dedupReceived = receivedSeq.filter((t, i) => i === 0 || t !== receivedSeq[i - 1]);
        const inOrder = JSON.stringify(dedupReceived) === JSON.stringify(expectedSeq);
        operationRecords.push({
          viewerCount, iteration: iter, viewerId: v.id, status: 'measured',
          sendOrder: expectedSeq, receivedOrder: receivedSeq,
          orderPreserved: inOrder,
          totalEventsReceived: v.events.length,
          perOp,
        });
      }

      for (const v of viewers) v.socket.close();
      await sleep(120);
    }
    console.log(`[RT] viewers=${viewerCount} done (${ITERATIONS} iterations)`);
  }

  // Cleanup: remove anything this run created that still exists.
  const [cleanup] = await db.query('DELETE FROM comments WHERE content LIKE ?', [`%${MARKER}%`]);
  const [[after]] = await db.query('SELECT COUNT(*) n FROM comments');
  console.log(`[RT] cleanup removed ${cleanup.affectedRows} rows; count ${baseline.n} -> ${after.n}`);
  await db.end();

  const lost = observations.filter((o) => o.lost);
  const dup = observations.filter((o) => o.duplicated);
  const misordered = operationRecords.filter((r) => r.status === 'measured' && !r.orderPreserved);
  const lat = observations.map((o) => o.latencyMs).filter((x) => x != null);

  writeOut('realtime-raw.json', {
    meta: meta({
      measurement: 'realtime-websocket',
      tier: '3',
      design: `4 operations x {${VIEWER_COUNTS.join(',')}} viewers x ${ITERATIONS} iterations`,
      expectedObservations: 4 * VIEWER_COUNTS.reduce((a, b) => a + b, 0) * ITERATIONS,
      operations: ['new_comment', 'comment_updated', 'rating_updated', 'comment_deleted'],
      latencyDefinition: 'HTTP request send time to WebSocket message receipt in the same '
        + 'process; server-internal broadcast time and browser render time are not separable '
        + 'from here and are not claimed',
      lossDefinition: 'an operation whose HTTP call succeeded (2xx) but for which a subscribed '
        + 'viewer received no matching event within the 900 ms settle window',
      orderingDefinition: 'per-viewer received type sequence (consecutive duplicates collapsed) '
        + 'compared against the server-side send sequence',
      dataHygiene: `comments tagged ${MARKER}; ${cleanup.affectedRows} residual rows deleted; `
        + `comment count ${baseline.n} -> ${after.n}`,
      cleanupVerified: baseline.n === after.n,
    }),
    totals: {
      observations: observations.length,
      // A zero loss rate only means something if the operations actually succeeded.
      // This makes the denominator explicit rather than implied.
      observationsWithSuccessfulHttp: observations.filter((o) => o.httpSucceeded).length,
      observationsWithFailedHttp: observations.filter((o) => !o.httpSucceeded).length,
      operationsExercised: [...new Set(observations.filter((o) => o.httpSucceeded).map((o) => o.op))],
      operationsNotExercised: [...new Set(observations.filter((o) => !o.httpSucceeded).map((o) => o.op))],
      lossCount: lost.length,
      lossRate: observations.length ? Number((lost.length / observations.length).toFixed(6)) : null,
      duplicateCount: dup.length,
      duplicateRate: observations.length ? Number((dup.length / observations.length).toFixed(6)) : null,
      viewerSequencesChecked: operationRecords.filter((r) => r.status === 'measured').length,
      misorderedSequences: misordered.length,
      latencyMs: stats(lat),
    },
    lostObservations: lost,
    duplicatedObservations: dup,
    misorderedSequences: misordered,
    observations,
    viewerSequences: operationRecords,
  });
}

await main();
