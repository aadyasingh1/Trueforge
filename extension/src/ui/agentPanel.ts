import * as vscode from 'vscode';
import type { PanelInboundMessage, PanelOutboundMessage } from '../../../shared/types';

export class AgentPanel {
  private panel: vscode.WebviewPanel;
  private inbound?: (message: PanelInboundMessage) => void;

  constructor(extensionUri: vscode.Uri) {
    this.panel = vscode.window.createWebviewPanel(
      'voltixAgent',
      'Voltix',
      vscode.ViewColumn.Two,
      { enableScripts: true, retainContextWhenHidden: true }
    );
    this.panel.webview.html = this.getHtml();
  }

  setInboundHandler(handler: (message: PanelInboundMessage) => void) {
    this.inbound = handler;
    this.panel.webview.onDidReceiveMessage(message => this.inbound?.(message));
  }

  onDidDispose(listener: () => void) {
    return this.panel.onDidDispose(listener);
  }

  reveal() { this.panel.reveal(vscode.ViewColumn.Two); }

  post(message: PanelOutboundMessage) {
    void this.panel.webview.postMessage(message);
  }

  private getHtml(): string {
    return `<!doctype html>
<html>
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline';">
  <style>
    *{box-sizing:border-box}
    :root{color-scheme:dark}
    body{margin:0;padding:18px;font:13px Consolas,"JetBrains Mono",monospace;color:#5AA5CD;background:#14334A}
    h1,h2,h3,p{margin-top:0}
    h1,h2,h3,.brand-label,button,.panel-section>summary{font-family:"Times New Roman",serif}
    h1{font-size:24px;margin-bottom:14px;color:#27E4EC;letter-spacing:.02em}
    h2{font-size:17px;color:#27E4EC}
    h3{font-size:16px;color:#27E4EC}
    button{font-size:13px;color:#14334A;background:#18A3B7;border:1px solid #27E4EC;border-radius:2px;padding:7px 11px;cursor:pointer}
    button:hover{background:#27E4EC}
    button:disabled{opacity:.55;cursor:default}
    button.secondary{color:#27E4EC;background:#1E536E;border-color:#5AA5CD}
    button.secondary:hover{background:#1E536E;border-color:#27E4EC}
    button.danger{color:#27E4EC;background:transparent;border:1px solid #6F71A1}
    button.danger:hover{background:#6F71A1;color:#14334A}
    button:focus-visible,textarea:focus-visible{outline:2px solid #27E4EC;outline-offset:2px}
    textarea{display:block;width:100%;min-height:78px;resize:vertical;margin:0 0 8px;padding:10px;color:#27E4EC;background:#14334A;border:1px solid #1E536E;font:13px Consolas,"JetBrains Mono",monospace}
    textarea::placeholder{color:#5AA5CD}
    label{display:block;margin-bottom:6px;color:#27E4EC;font-family:"Times New Roman",serif;font-weight:700}
    input,textarea,select{caret-color:#27E4EC}
    code,pre,.diff-row,.unified-row,.activity-preview,.receipt-item pre{font-family:Consolas,"JetBrains Mono",monospace}
    .toolbar{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:12px}
    #status{min-height:20px;margin:8px 0;color:#5AA5CD}
    .error-banner,.result-banner{margin:8px 0;padding:10px;border:1px solid #1E536E;border-left:3px solid #27E4EC;background:#14334A}
    .error-banner{border-left-color:#6F71A1;color:#27E4EC}
    .result-banner.success{border-left-color:#18A3B7}
    .result-banner.failure{border-left-color:#6F71A1}
    .banner-heading{font-weight:600;margin-bottom:4px}
    .banner-list{margin:6px 0 0;padding-left:20px}
    #output{margin:10px 0 14px;white-space:pre-wrap;overflow-wrap:anywhere;padding:12px;border-left:2px solid #1E536E;background:#14334A}
    .panel-section{margin:14px 0;border:1px solid #1E536E;border-radius:2px;background:#14334A}
    .panel-section>summary{cursor:pointer;padding:10px;font-weight:600}
    .receipt-body{padding:0 10px 10px}
    .receipt-summary{color:#5AA5CD;margin:0 0 8px}
    .receipt-item{border-top:1px solid #1E536E;padding:8px 0}
    .receipt-item summary{cursor:pointer;overflow-wrap:anywhere}
    .receipt-item pre{max-height:240px;overflow:auto;white-space:pre-wrap;overflow-wrap:anywhere;padding:8px;background:#14334A;border:1px solid #1E536E;font-size:12px;line-height:1.5}
    #activity-list{margin:0;padding:0;list-style:none}
    .activity-item{padding:8px 10px;border-top:1px solid #1E536E}
    .activity-title{font-weight:600}
    .activity-status,.activity-preview{color:#5AA5CD;margin:4px 0 0}
    .activity-preview{white-space:pre-wrap;overflow-wrap:anywhere;font-size:12px}
    #activity-heading{padding:10px;margin:0;font-size:15px}
    .review-heading{display:flex;align-items:baseline;justify-content:space-between;gap:8px;margin:16px 0 8px}
    .review-heading h2{font-size:15px;margin:0}
    #review-counts{color:#5AA5CD}
    .review-actions{display:flex;gap:6px}
    .review-layout{display:grid;grid-template-columns:minmax(150px,240px) minmax(0,1fr);gap:12px;align-items:start}
    #file-list{display:flex;flex-direction:column;gap:4px}
    .file-nav{width:100%;text-align:left;color:#27E4EC;background:transparent;border:1px solid #1E536E;overflow-wrap:anywhere;font-family:Consolas,"JetBrains Mono",monospace}
    .file-nav:hover,.file-nav[aria-current="true"]{background:#1E536E}
    .file-nav[aria-current="true"]{border-color:#27E4EC;border-left-width:3px}
    .file-nav-path,.file-nav-state{display:block}
    .file-nav-state{margin-top:4px;color:#5AA5CD;font-size:11px}
    #review-detail{min-width:0;min-height:160px;border:1px solid #1E536E}
    .review-empty{padding:18px;color:#5AA5CD}
    .review-header{position:sticky;top:0;z-index:2;padding:12px;background:#14334A;border-bottom:1px solid #1E536E}
    .review-header h3{margin:0 0 5px;overflow-wrap:anywhere}
    .review-reason{margin:0 0 8px;color:#5AA5CD;white-space:pre-wrap;overflow-wrap:anywhere}
    .review-meta{display:flex;flex-wrap:wrap;gap:8px;align-items:center;color:#5AA5CD;margin-bottom:8px}
    .state-badge{display:inline-block;padding:2px 6px;border-radius:8px;background:#1E536E;color:#27E4EC}
    .decision-note{margin:8px 0 0;color:#5AA5CD}
    .diff-mode{margin-left:auto}
    .diff-labels,.diff-row{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr)}
    .diff-labels{background:#14334A;border-bottom:1px solid #1E536E;font-weight:600;color:#27E4EC}
    .diff-labels span{padding:7px 8px}
    .diff-labels span+span,.diff-cell+.diff-cell{border-left:1px solid #1E536E}
    .diff-row,.unified-row{min-width:0;font-size:12px;line-height:1.55}
    .hunk-review-control{display:flex;flex-wrap:wrap;gap:8px;align-items:center;padding:6px 8px;background:#14334A;border-top:1px solid #1E536E}
    .hunk-review-title{flex:1 1 220px;color:#5AA5CD;font-family:Consolas,"JetBrains Mono",monospace}
    .hunk-review-state{color:#27E4EC}
    .diff-cell{display:flex;min-width:0;white-space:pre}
    .line-number{flex:0 0 4em;padding:0 6px;text-align:right;color:#6F71A1;user-select:none}
    .line-content{min-width:0;overflow-x:auto;padding:0 8px}
    .diff-add .diff-cell,.unified-row.diff-add{background:#1E536E;border-left:2px solid #27E4EC}
    .diff-remove .diff-cell,.unified-row.diff-remove{background:#6F71A1;color:#14334A;border-left:2px solid #6F71A1}
    .unified-row{display:flex;white-space:pre}
    .unified-prefix{flex:0 0 1.5em;text-align:center;color:#27E4EC}
    .unified-number{flex:0 0 5em;color:#6F71A1;text-align:right;padding-right:6px}
    .unified-content{min-width:0;overflow-x:auto;padding:0 8px}
    .diff-row+.diff-row,.unified-row+.unified-row{border-top:1px solid #1E536E}
    @media(max-width:640px){.review-layout{grid-template-columns:1fr}.review-heading{align-items:flex-start;flex-wrap:wrap}}
  </style>
</head>
<body>
  <h1>Voltix</h1>
  <form id="prompt-form">
    <label for="input">Describe a task</label>
    <textarea id="input" placeholder="Describe a task..." rows="3"></textarea>
    <div class="toolbar">
      <button id="submit" type="submit">Send</button>
      <button id="cancel" class="secondary" type="button">Cancel</button>
      <button id="apply" type="button" disabled>Apply Accepted</button>
      <button id="discard" class="danger" type="button">Discard All</button>
    </div>
  </form>
  <div id="status" role="status" aria-live="polite"></div>
  <div id="error-area" aria-live="assertive"></div>
  <div id="result-area" aria-live="polite"></div>
  <details id="receipt" class="panel-section">
    <summary>Context Receipt <span id="receipt-count"></span></summary>
    <div id="receipt-body" class="receipt-body"><p class="receipt-summary">No context receipt for this request yet.</p></div>
  </details>
  <section class="panel-section" aria-labelledby="activity-heading">
    <h2 id="activity-heading">Agent activity</h2>
    <ol id="activity-list" aria-live="polite"><li class="activity-item">Observed tool and turn events will appear here.</li></ol>
  </section>
  <section aria-labelledby="response-heading">
    <h2 id="response-heading">Agent response</h2>
    <div id="output" aria-live="polite">The agent response will appear here.</div>
  </section>
  <section aria-labelledby="review-title">
    <div class="review-heading">
      <h2 id="review-title">Proposed files</h2>
      <span id="review-counts">No files to review</span>
      <div class="review-actions" aria-label="Review all files">
        <button id="accept-all" class="secondary" type="button" disabled>Accept All</button>
        <button id="reject-all" class="danger" type="button" disabled>Reject All</button>
      </div>
    </div>
    <div class="review-layout">
      <nav id="file-list" aria-label="Proposed files"></nav>
      <section id="review-detail" aria-live="polite"><div class="review-empty">Proposed changes will appear here.</div></section>
    </div>
  </section>
  <script>
    const vscode = acquireVsCodeApi();
    const state = {
      changes: [],
      selectedId: null,
      decisions: new Map(),
      hunkDecisions: new Map(),
      outcomes: new Map(),
      activities: [],
      diffMode: 'side-by-side',
      busy: false,
      applying: false,
      lastSubmittedText: ''
    };
    const input = document.getElementById('input');
    const output = document.getElementById('output');
    const fileList = document.getElementById('file-list');
    const reviewDetail = document.getElementById('review-detail');
    const reviewCounts = document.getElementById('review-counts');
    const status = document.getElementById('status');
    const errorArea = document.getElementById('error-area');
    const resultArea = document.getElementById('result-area');
    const receiptBody = document.getElementById('receipt-body');
    const receiptCount = document.getElementById('receipt-count');
    const activityList = document.getElementById('activity-list');
    const submitButton = document.getElementById('submit');
    const cancelButton = document.getElementById('cancel');
    const applyButton = document.getElementById('apply');
    const acceptAllButton = document.getElementById('accept-all');
    const rejectAllButton = document.getElementById('reject-all');
    const discardButton = document.getElementById('discard');

    function makeElement(tag, className, text) {
      const element = document.createElement(tag);
      if (className) element.className = className;
      if (text !== undefined && text !== null) element.textContent = String(text);
      return element;
    }

    function clear(element) {
      while (element.firstChild) element.removeChild(element.firstChild);
    }

    function renderActivity() {
      clear(activityList);
      if (state.activities.length === 0) {
        activityList.appendChild(makeElement('li', 'activity-item', 'No tool or turn events have been observed yet.'));
        return;
      }
      state.activities.forEach(activity => {
        const item = makeElement('li', 'activity-item');
        item.appendChild(makeElement('div', 'activity-title', activity.name));
        item.appendChild(makeElement('p', 'activity-status', activity.status));
        if (activity.argsPreview) {
          item.appendChild(makeElement('pre', 'activity-preview', 'Arguments: ' + activity.argsPreview));
        }
        if (activity.resultPreview) {
          item.appendChild(makeElement('pre', 'activity-preview', 'Result preview: ' + activity.resultPreview));
        }
        activityList.appendChild(item);
      });
    }

    function updateActivity(activity) {
      const existing = state.activities.find(item => item.id === activity.id);
      if (existing) Object.assign(existing, activity);
      else state.activities.push(activity);
      renderActivity();
    }

    function setBusy(busy) {
      state.busy = busy;
      submitButton.disabled = busy;
      cancelButton.disabled = !busy;
      if (busy) status.textContent = 'Request in progress...';
      updateReviewSummary();
    }

    function changeState(change) {
      const outcome = state.outcomes.get(change.id);
      if (outcome) return outcome;
      const decision = state.decisions.get(change.id);
      if (decision === 'accept') return 'Acceptance requested locally; application is not confirmed';
      if (decision === 'reject') return 'Rejection requested locally; not applied';
      const acceptedHunks = change.hunks.filter(hunk => state.hunkDecisions.get(hunk.id) === 'accept').length;
      const rejectedHunks = change.hunks.filter(hunk => state.hunkDecisions.get(hunk.id) === 'reject').length;
      if (acceptedHunks || rejectedHunks) {
        return acceptedHunks + ' hunk(s) accepted and ' + rejectedHunks +
          ' rejected locally; application is not confirmed';
      }
      return 'Not reviewed';
    }

    function updateReviewSummary() {
      const counts = { pending: 0, accepted: 0, rejected: 0, acceptedHunks: 0, rejectedHunks: 0, applied: 0, restored: 0, unchanged: 0, conflict: 0, failed: 0, manual: 0, ambiguous: 0 };
      state.changes.forEach(change => {
        const outcome = state.outcomes.get(change.id) || '';
        const decision = state.decisions.get(change.id);
        if (outcome === 'Applied') counts.applied++;
        else if (outcome === 'Restored') counts.restored++;
        else if (outcome === 'Unchanged') counts.unchanged++;
        else if (outcome === 'Conflict') counts.conflict++;
        else if (outcome === 'Failed') counts.failed++;
        else if (outcome === 'Manual recovery required') counts.manual++;
        else if (outcome === 'Ambiguous') counts.ambiguous++;
        else if (decision === 'accept') counts.accepted++;
        else if (decision === 'reject') counts.rejected++;
        else {
          const acceptedHunks = change.hunks.filter(hunk => state.hunkDecisions.get(hunk.id) === 'accept').length;
          const rejectedHunks = change.hunks.filter(hunk => state.hunkDecisions.get(hunk.id) === 'reject').length;
          counts.acceptedHunks += acceptedHunks;
          counts.rejectedHunks += rejectedHunks;
          if (!acceptedHunks && !rejectedHunks) counts.pending++;
        }
      });
      if (state.changes.length === 0) {
        reviewCounts.textContent = 'No files to review';
      } else {
        reviewCounts.textContent = state.changes.length + ' file(s) | ' +
          counts.pending + ' unreviewed | ' + counts.accepted + ' accept requested | ' +
          counts.rejected + ' reject requested | ' + counts.applied + ' applied' +
          (counts.acceptedHunks ? ' | ' + counts.acceptedHunks + ' hunk(s) accept requested' : '') +
          (counts.rejectedHunks ? ' | ' + counts.rejectedHunks + ' hunk(s) reject requested' : '') +
          (counts.restored ? ' | ' + counts.restored + ' restored' : '') +
          (counts.unchanged ? ' | ' + counts.unchanged + ' unchanged' : '') +
          (counts.conflict ? ' | ' + counts.conflict + ' conflict(s)' : '') +
          (counts.failed ? ' | ' + counts.failed + ' failed' : '') +
          (counts.manual ? ' | ' + counts.manual + ' need recovery' : '') +
          (counts.ambiguous ? ' | ' + counts.ambiguous + ' ambiguous' : '');
      }
      const accepted = state.changes.some(change =>
        (state.decisions.get(change.id) === 'accept' ||
          change.hunks.some(hunk => state.hunkDecisions.get(hunk.id) === 'accept')) &&
        !['Applied', 'Restored', 'Manual recovery required', 'Ambiguous'].includes(state.outcomes.get(change.id) || '')
      );
      applyButton.disabled = state.applying || !accepted;
      acceptAllButton.disabled = state.applying || state.changes.length === 0;
      rejectAllButton.disabled = state.applying || state.changes.length === 0;
      discardButton.disabled = state.applying;
      renderFileList();
    }

    function renderFileList() {
      clear(fileList);
      if (state.changes.length === 0) {
        fileList.appendChild(makeElement('p', 'review-empty', 'No proposed files. Submit a task to review changes.'));
        renderSelectedChange();
        return;
      }
      state.changes.forEach(change => {
        const button = makeElement('button', 'file-nav');
        button.type = 'button';
        button.dataset.action = 'select-file';
        button.dataset.changeId = change.id;
        button.setAttribute('aria-current', change.id === state.selectedId ? 'true' : 'false');
        button.appendChild(makeElement('span', 'file-nav-path', change.path));
        button.appendChild(makeElement('span', 'file-nav-state', changeState(change)));
        fileList.appendChild(button);
      });
      renderSelectedChange();
    }

    function diffRows(change) {
      const splitLines = content => {
        if (!content) return [];
        const lines = String(content).split(/\\r?\\n/);
        if (lines[lines.length - 1] === '') lines.pop();
        return lines;
      };
      const original = splitLines(change.originalContent || '');
      const proposed = splitLines(change.proposedContent || '');
      const hunks = Array.isArray(change.hunks) ? change.hunks : [];
      const rows = [];
      let oldIndex = 0;
      let newIndex = 0;
      const addRow = (type, oldLine, newLine, oldNumber, newNumber, hunkId) => {
        rows.push({ type, oldLine, newLine, oldNumber, newNumber, hunkId });
      };
      const appendGap = (oldTarget, newTarget) => {
        while (oldIndex < oldTarget || newIndex < newTarget) {
          if (oldIndex < oldTarget && newIndex < newTarget) {
            addRow('context', original[oldIndex], proposed[newIndex], oldIndex + 1, newIndex + 1);
            oldIndex++;
            newIndex++;
          } else if (oldIndex < oldTarget) {
            addRow('remove', original[oldIndex], null, oldIndex + 1, null);
            oldIndex++;
          } else {
            addRow('add', null, proposed[newIndex], null, newIndex + 1);
            newIndex++;
          }
        }
      };

      if (hunks.length === 0 && String(change.originalContent || '') !== String(change.proposedContent || '')) {
        original.forEach((line, index) => addRow('remove', line, null, index + 1, null));
        proposed.forEach((line, index) => addRow('add', null, line, null, index + 1));
        return rows;
      }

      hunks.forEach(hunk => {
        const oldTarget = Math.min(original.length, Math.max(oldIndex, hunk.originalStart > 0 ? hunk.originalStart - 1 : 0));
        const newTarget = Math.min(proposed.length, Math.max(newIndex, hunk.proposedStart > 0 ? hunk.proposedStart - 1 : 0));
        appendGap(oldTarget, newTarget);
        (Array.isArray(hunk.lines) ? hunk.lines : []).forEach(line => {
          if (line.type === 'context') {
            addRow('context', line.content, line.content, oldIndex + 1, newIndex + 1, hunk.id);
            oldIndex++;
            newIndex++;
          } else if (line.type === 'remove') {
            addRow('remove', line.content, null, oldIndex + 1, null, hunk.id);
            oldIndex++;
          } else if (line.type === 'add') {
            addRow('add', null, line.content, null, newIndex + 1, hunk.id);
            newIndex++;
          }
        });
      });
      appendGap(original.length, proposed.length);
      return rows;
    }

    function renderDiff(change, container) {
      const rows = diffRows(change);
      const added = rows.filter(row => row.type === 'add').length;
      const removed = rows.filter(row => row.type === 'remove').length;
      const meta = container.querySelector('.review-meta');
      meta.appendChild(makeElement('span', '', '+' + added + ' additions'));
      meta.appendChild(makeElement('span', '', '-' + removed + ' deletions'));

      const modeButton = makeElement('button', 'secondary diff-mode', state.diffMode === 'side-by-side' ? 'Unified view' : 'Side-by-side view');
      modeButton.type = 'button';
      modeButton.dataset.action = 'toggle-diff';
      meta.appendChild(modeButton);
      const diff = makeElement('div', 'diff-content');
      diff.setAttribute('aria-label', 'Complete original and proposed file comparison');
      let renderedHunkId = null;
      const appendHunkControl = hunkId => {
        const hunk = change.hunks.find(item => item.id === hunkId);
        if (!hunk) return;
        const control = makeElement('div', 'hunk-review-control');
        control.appendChild(makeElement('span', 'hunk-review-title', hunk.header));
        const decision = state.hunkDecisions.get(hunk.id);
        control.appendChild(makeElement('span', 'hunk-review-state',
          decision === 'accept' ? 'Acceptance requested locally' :
            decision === 'reject' ? 'Rejection requested locally' : 'Not reviewed'));
        const accept = makeElement('button', 'secondary', 'Accept Hunk');
        accept.type = 'button';
        accept.dataset.action = 'accept-hunk';
        accept.dataset.changeId = change.id;
        accept.dataset.hunkId = hunk.id;
        accept.disabled = state.outcomes.get(change.id) === 'Applied' || state.applying;
        const reject = makeElement('button', 'secondary', 'Reject Hunk');
        reject.type = 'button';
        reject.dataset.action = 'reject-hunk';
        reject.dataset.changeId = change.id;
        reject.dataset.hunkId = hunk.id;
        reject.disabled = state.outcomes.get(change.id) === 'Applied' || state.applying;
        control.appendChild(accept);
        control.appendChild(reject);
        diff.appendChild(control);
      };
      const appendHunkControlForRow = row => {
        if (row.hunkId && row.hunkId !== renderedHunkId) appendHunkControl(row.hunkId);
        renderedHunkId = row.hunkId || null;
      };
      if (state.diffMode === 'side-by-side') {
        const labels = makeElement('div', 'diff-labels');
        labels.appendChild(makeElement('span', '', 'Original'));
        labels.appendChild(makeElement('span', '', 'Proposed'));
        diff.appendChild(labels);
        rows.forEach(row => {
          appendHunkControlForRow(row);
          const rowElement = makeElement('div', 'diff-row diff-' + row.type);
          rowElement.appendChild(createSideCell(row.oldNumber, row.oldLine));
          rowElement.appendChild(createSideCell(row.newNumber, row.newLine));
          diff.appendChild(rowElement);
        });
      } else {
        rows.forEach(row => {
          appendHunkControlForRow(row);
          const rowElement = makeElement('div', 'unified-row diff-' + row.type);
          const prefix = row.type === 'add' ? '+' : row.type === 'remove' ? '-' : ' ';
          const number = row.type === 'add' ? row.newNumber : row.oldNumber;
          rowElement.appendChild(makeElement('span', 'unified-prefix', prefix));
          rowElement.appendChild(makeElement('span', 'unified-number', number === null ? '' : number));
          rowElement.appendChild(makeElement('span', 'unified-content', row.type === 'remove' ? row.oldLine : row.newLine));
          diff.appendChild(rowElement);
        });
      }
      container.appendChild(diff);
    }

    function createSideCell(number, content) {
      const cell = makeElement('div', 'diff-cell');
      cell.appendChild(makeElement('span', 'line-number', number === null ? '' : number));
      cell.appendChild(makeElement('span', 'line-content', content === null ? '' : content));
      return cell;
    }

    function renderSelectedChange() {
      clear(reviewDetail);
      const change = state.changes.find(item => item.id === state.selectedId);
      if (!change) {
        reviewDetail.appendChild(makeElement('div', 'review-empty',
          state.changes.length === 0 ? 'Proposed changes will appear here.' : 'Select a file to review its complete changes.'));
        return;
      }
      const header = makeElement('div', 'review-header');
      header.appendChild(makeElement('h3', '', change.path));
      header.appendChild(makeElement('p', 'review-reason', change.reason || 'No change summary provided.'));
      const meta = makeElement('div', 'review-meta');
      meta.appendChild(makeElement('span', 'state-badge', changeState(change)));
      header.appendChild(meta);
      const actions = makeElement('div', 'toolbar');
      const accept = makeElement('button', '', 'Accept File');
      accept.type = 'button';
      accept.dataset.action = 'accept-file';
      accept.dataset.changeId = change.id;
      accept.disabled = state.outcomes.get(change.id) === 'Applied' || state.applying;
      const reject = makeElement('button', 'secondary', 'Reject File');
      reject.type = 'button';
      reject.dataset.action = 'reject-file';
      reject.dataset.changeId = change.id;
      reject.disabled = state.outcomes.get(change.id) === 'Applied' || state.applying;
      actions.appendChild(accept);
      actions.appendChild(reject);
      header.appendChild(actions);
      if (state.decisions.has(change.id) && !state.outcomes.has(change.id)) {
        header.appendChild(makeElement('p', 'decision-note',
          'This is local review feedback. The extension has not confirmed the decision; application is confirmed only by its result.'));
      }
      reviewDetail.appendChild(header);
      renderDiff(change, reviewDetail);
    }

    function renderReceipt(receipt) {
      clear(receiptBody);
      const items = Array.isArray(receipt.items) ? receipt.items : [];
      receiptCount.textContent = items.length ? '(' + items.length + ' selected)' : '(no files selected)';
      const summaryParts = [
        items.length + ' selected',
        (receipt.excluded || 0) + ' matched candidates excluded by budget',
        (receipt.totalTokens || 0) + ' of ' + (receipt.budget || 0) + ' estimated tokens'
      ];
      receiptBody.appendChild(makeElement('p', 'receipt-summary', summaryParts.join(' | ')));
      const excludedItems = Array.isArray(receipt.excludedItems) ? receipt.excludedItems : [];
      if (excludedItems.length) {
        const excluded = makeElement('details', 'receipt-item');
        excluded.appendChild(makeElement('summary', '', 'Excluded files (' + excludedItems.length + ')'));
        excludedItems.forEach(item => {
          const reason = item.reason === 'context_budget'
            ? 'Excluded because the context token budget was insufficient'
            : 'Exclusion reason not provided';
          excluded.appendChild(makeElement('p', 'receipt-summary', (item.path || 'Unknown file') + ' - ' + reason));
        });
        receiptBody.appendChild(excluded);
      } else {
        receiptBody.appendChild(makeElement('p', 'receipt-summary',
          'Excluded file names and exclusion reasons: not provided by the context backend.'));
      }
      receiptBody.appendChild(makeElement('p', 'receipt-summary',
        'These are the automatically selected snippets included with the request. Later tool reads and their observed results are listed separately in Agent activity.'));
      receiptBody.appendChild(makeElement('p', 'receipt-summary',
        'Estimated: token counts and relevance scores are estimates. Verified: no backend-verified context field is available beyond the assembled snippets shown below.'));
      if (Array.isArray(receipt.queryTerms) && receipt.queryTerms.length) {
        receiptBody.appendChild(makeElement('p', 'receipt-summary', 'Query terms: ' + receipt.queryTerms.join(', ')));
      }
      if (!items.length) {
        receiptBody.appendChild(makeElement('p', 'receipt-summary', 'No workspace files were selected as context for this request.'));
        return;
      }
      items.forEach(item => {
        const details = makeElement('details', 'receipt-item');
        details.appendChild(makeElement('summary', '', item.path || 'Unknown file'));
        const info = [
          'Lines ' + (Number(item.startLine || 0) + 1) + '-' + (Number(item.endLine || 0) + 1),
          (item.tokenEstimate || 0) + ' estimated tokens',
          'Score ' + (item.score || 0),
          'Signals: ' + ((Array.isArray(item.signals) && item.signals.length) ? item.signals.join(', ') : 'none reported')
        ];
        details.appendChild(makeElement('p', 'receipt-summary', info.join(' | ')));
        details.appendChild(makeElement('pre', '', item.content || 'No excerpt provided.'));
        receiptBody.appendChild(details);
      });
    }

    function showError(message, recoverable) {
      clear(errorArea);
      const banner = makeElement('div', 'error-banner');
      banner.setAttribute('role', 'alert');
      banner.appendChild(makeElement('div', 'banner-heading', recoverable ? 'Request failed - you can try again' : 'Request failed'));
      banner.appendChild(makeElement('p', '', message || 'An unexpected error occurred.'));
      const dismiss = makeElement('button', 'secondary', 'Dismiss');
      dismiss.type = 'button';
      dismiss.dataset.action = 'dismiss-error';
      banner.appendChild(dismiss);
      errorArea.appendChild(banner);
    }

    function showApplyResult(result) {
      const applied = Array.isArray(result.applied) ? result.applied : [];
      const restored = Array.isArray(result.restored) ? result.restored : [];
      const unchanged = Array.isArray(result.unchanged) ? result.unchanged : [];
      const manualRecovery = Array.isArray(result.manualRecovery) ? result.manualRecovery : [];
      const failed = Array.isArray(result.failed) ? result.failed : [];
      const conflicts = Array.isArray(result.conflicts) ? result.conflicts : [];
      const resultPaths = new Set([...applied, ...restored, ...unchanged, ...manualRecovery, ...conflicts, ...failed]);
      resultPaths.forEach(path => {
        const matchingChanges = state.changes.filter(change => change.path === path);
        const outcome = manualRecovery.indexOf(path) !== -1 ? 'Manual recovery required' :
          applied.indexOf(path) !== -1 ? 'Applied' :
          restored.indexOf(path) !== -1 ? 'Restored' :
          unchanged.indexOf(path) !== -1 ? 'Unchanged' :
          conflicts.indexOf(path) !== -1 ? 'Conflict' : 'Failed';
        matchingChanges.forEach(change => {
          state.outcomes.set(change.id, matchingChanges.length === 1 ? outcome : 'Ambiguous');
        });
      });
      clear(resultArea);
      const banner = makeElement('div', 'result-banner ' + (result.success ? 'success' : 'failure'));
      banner.setAttribute('role', 'status');
      const hasIssues = failed.length > 0 || conflicts.length > 0 || manualRecovery.length > 0;
      banner.appendChild(makeElement('div', 'banner-heading',
        result.success ? (applied.length ? 'Changes applied successfully' : 'Apply completed; no files were applied') :
          (hasIssues ? 'Some changes could not be applied' : 'Apply did not complete successfully')));
      appendPathList(banner, 'Applied', applied);
      appendPathList(banner, 'Restored after a failed batch', restored);
      appendPathList(banner, 'Left unchanged', unchanged);
      appendPathList(banner, 'Conflicts - the file changed since the proposal', conflicts);
      appendPathList(banner, 'Failed', failed);
      appendPathList(banner, 'Manual recovery required - files or temporary data may need attention', manualRecovery);
      if (state.changes.some(change => state.outcomes.get(change.id) === 'Ambiguous')) {
        banner.appendChild(makeElement('p', 'decision-note',
          'Some results identify only a file path shared by multiple proposals. Those proposal-level outcomes are ambiguous.'));
      }
      resultArea.appendChild(banner);
      state.applying = false;
      updateReviewSummary();
    }

    function appendPathList(container, title, paths) {
      if (!paths.length) return;
      container.appendChild(makeElement('div', 'banner-heading', title));
      const list = makeElement('ul', 'banner-list');
      paths.forEach(path => list.appendChild(makeElement('li', '', path)));
      container.appendChild(list);
    }

    document.getElementById('prompt-form').addEventListener('submit', event => {
      event.preventDefault();
      if (state.busy) return;
      state.lastSubmittedText = input.value;
      clear(errorArea);
      clear(resultArea);
      output.textContent = '';
      state.activities = [];
      renderActivity();
      setBusy(true);
      vscode.postMessage({ type: 'submit', text: input.value });
      input.value = '';
    });

    cancelButton.addEventListener('click', () => {
      if (!state.busy) return;
      status.textContent = 'Cancellation requested; waiting for the agent response.';
      vscode.postMessage({ type: 'cancel' });
    });

    applyButton.addEventListener('click', () => {
      if (state.applying || applyButton.disabled) return;
      state.applying = true;
      clear(resultArea);
      status.textContent = 'Applying accepted files...';
      updateReviewSummary();
      vscode.postMessage({ type: 'apply_accepted' });
    });

    acceptAllButton.addEventListener('click', () => {
      if (acceptAllButton.disabled) return;
      state.changes.forEach(change => {
        state.decisions.set(change.id, 'accept');
        change.hunks.forEach(hunk => state.hunkDecisions.delete(hunk.id));
        state.outcomes.delete(change.id);
        vscode.postMessage({ type: 'accept_file', changeId: change.id });
      });
      updateReviewSummary();
    });

    rejectAllButton.addEventListener('click', () => {
      if (rejectAllButton.disabled) return;
      state.changes.forEach(change => {
        state.decisions.set(change.id, 'reject');
        change.hunks.forEach(hunk => state.hunkDecisions.delete(hunk.id));
        state.outcomes.delete(change.id);
        vscode.postMessage({ type: 'reject_file', changeId: change.id });
      });
      updateReviewSummary();
    });

    document.getElementById('discard').addEventListener('click', () => {
      if (state.applying) return;
      vscode.postMessage({ type: 'discard_all' });
      state.changes = [];
      state.selectedId = null;
      state.decisions.clear();
      state.hunkDecisions.clear();
      state.outcomes.clear();
      state.applying = false;
      clear(resultArea);
      updateReviewSummary();
    });

    document.addEventListener('click', event => {
      const target = event.target instanceof Element ? event.target.closest('button[data-action]') : null;
      if (!target) return;
      const action = target.dataset.action;
      const changeId = target.dataset.changeId;
      if (action === 'dismiss-error') {
        clear(errorArea);
      } else if (action === 'select-file' && changeId) {
        state.selectedId = changeId;
        renderFileList();
      } else if (action === 'toggle-diff') {
        state.diffMode = state.diffMode === 'side-by-side' ? 'unified' : 'side-by-side';
        renderSelectedChange();
      } else if (action === 'accept-file' && changeId) {
        state.decisions.set(changeId, 'accept');
        const change = state.changes.find(item => item.id === changeId);
        if (change) change.hunks.forEach(hunk => state.hunkDecisions.delete(hunk.id));
        state.outcomes.delete(changeId);
        vscode.postMessage({ type: 'accept_file', changeId });
        updateReviewSummary();
      } else if (action === 'reject-file' && changeId) {
        state.decisions.set(changeId, 'reject');
        const change = state.changes.find(item => item.id === changeId);
        if (change) change.hunks.forEach(hunk => state.hunkDecisions.delete(hunk.id));
        state.outcomes.delete(changeId);
        vscode.postMessage({ type: 'reject_file', changeId });
        updateReviewSummary();
      } else if ((action === 'accept-hunk' || action === 'reject-hunk') && changeId && target.dataset.hunkId) {
        const decision = action === 'accept-hunk' ? 'accept' : 'reject';
        const change = state.changes.find(item => item.id === changeId);
        const previousDecision = state.decisions.get(changeId);
        if (change && previousDecision) {
          change.hunks.forEach(hunk => state.hunkDecisions.set(hunk.id, previousDecision));
        }
        state.decisions.delete(changeId);
        state.hunkDecisions.set(target.dataset.hunkId, decision);
        state.outcomes.delete(changeId);
        vscode.postMessage({
          type: action === 'accept-hunk' ? 'accept_hunk' : 'reject_hunk',
          changeId,
          hunkId: target.dataset.hunkId,
        });
        updateReviewSummary();
      }
    });

    window.addEventListener('message', event => {
      const message = event.data;
      if (!message || typeof message.type !== 'string') return;
      if (message.type === 'text_delta') {
        if (output.textContent === 'The agent response will appear here.') output.textContent = '';
        output.textContent += message.content || '';
      } else if (message.type === 'tool_start') {
        updateActivity({
          id: message.id,
          name: message.name || 'Tool request',
          status: message.status === 'approval_required' ? 'Approval required' : 'Tool request observed',
          argsPreview: message.argsPreview || '',
        });
      } else if (message.type === 'tool_done') {
        updateActivity({
          id: message.id,
          name: message.name || state.activities.find(item => item.id === message.id)?.name || 'Tool response',
          status: message.isError === true ? 'Tool reported an error' :
            message.isError === false ? 'Explicit tool success result received' :
            'Tool response received; success or failure not provided',
          resultPreview: message.resultPreview || '',
        });
      } else if (message.type === 'text_done') {
        output.textContent = message.fullContent || '';
      } else if (message.type === 'turn_done') {
        setBusy(false);
        status.textContent = message.status === 'cancelled' ? 'Turn cancelled.' :
          message.status === 'error' ? 'The turn ended with an error.' : 'Turn complete.';
        updateActivity({
          id: 'terminal-' + state.activities.length,
          name: 'Agent turn',
          status: message.message || (message.status === 'done' ? 'Turn completed' :
            message.status === 'cancelled' ? 'Turn cancelled' : 'Turn ended with an error'),
        });
      } else if (message.type === 'error') {
        setBusy(false);
        if (!input.value && state.lastSubmittedText) input.value = state.lastSubmittedText;
        showError(message.message, message.recoverable);
        updateActivity({ id: 'error-' + state.activities.length, name: 'Request error', status: message.message || 'Request failed' });
      } else if (message.type === 'context_receipt') {
        renderReceipt(message.receipt || {});
      } else if (message.type === 'pending_change' && message.change && message.change.id) {
        const index = state.changes.findIndex(change => change.id === message.change.id);
        if (index === -1) state.changes.push(message.change);
        else state.changes[index] = message.change;
        if (!state.selectedId) state.selectedId = message.change.id;
        clear(resultArea);
        updateReviewSummary();
      } else if (message.type === 'change_removed') {
        const removedChange = state.changes.find(change => change.id === message.changeId);
        if (removedChange) removedChange.hunks.forEach(hunk => state.hunkDecisions.delete(hunk.id));
        state.changes = state.changes.filter(change => change.id !== message.changeId);
        state.decisions.delete(message.changeId);
        state.outcomes.delete(message.changeId);
        if (state.selectedId === message.changeId) state.selectedId = state.changes.length ? state.changes[0].id : null;
        updateReviewSummary();
      } else if (message.type === 'apply_result') {
        showApplyResult(message);
      }
    });

    cancelButton.disabled = true;
    updateReviewSummary();
  </script>
</body>
</html>`;
  }
}
