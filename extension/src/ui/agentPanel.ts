import * as vscode from 'vscode';
import type { PanelInboundMessage, PanelOutboundMessage } from '../../../shared/types';

export class AgentPanel {
  private panel: vscode.WebviewPanel;
  private inbound?: (message: PanelInboundMessage) => void;

  constructor(extensionUri: vscode.Uri) {
    this.panel = vscode.window.createWebviewPanel(
      'trueforgeAgent',
      'TrueForge',
      vscode.ViewColumn.Two,
      { enableScripts: true, retainContextWhenHidden: true }
    );
    this.panel.webview.html = this.getHtml();
  }

  setInboundHandler(handler: (message: PanelInboundMessage) => void) {
    this.inbound = handler;
    this.panel.webview.onDidReceiveMessage(message => this.inbound?.(message));
  }

  reveal() { this.panel.reveal(vscode.ViewColumn.Two); }

  post(message: PanelOutboundMessage) {
    void this.panel.webview.postMessage(message);
  }

  private getHtml(): string {
    return `<!doctype html><html><head><meta charset="UTF-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline';"><style>
      body{font:13px -apple-system,BlinkMacSystemFont,sans-serif;color:var(--vscode-editor-foreground);background:var(--vscode-editor-background);padding:12px}textarea{width:100%;min-height:70px;box-sizing:border-box;background:var(--vscode-input-background);color:var(--vscode-input-foreground);border:1px solid var(--vscode-input-border)}button{margin:4px 4px 4px 0;padding:6px 10px}#output{white-space:pre-wrap;margin:14px 0}#receipt,#changes{margin-top:12px}.change{border:1px solid var(--vscode-panel-border);padding:8px;margin:8px 0}.hunk{font-family:monospace;white-space:pre-wrap;color:var(--vscode-descriptionForeground)}.toolbar{display:flex}
    </style></head><body><h2>TrueForge</h2><textarea id="input" placeholder="Describe a task..."></textarea><div class="toolbar"><button id="submit">Send</button><button id="cancel">Cancel</button><button id="apply">Apply Accepted</button><button id="discard">Discard All</button></div><div id="receipt"></div><div id="output"></div><div id="changes"></div>
    <script>
      const vscode=acquireVsCodeApi();
      const output=document.getElementById('output'), changes=document.getElementById('changes'), receipt=document.getElementById('receipt');
      document.getElementById('submit').onclick=()=>{const input=document.getElementById('input');vscode.postMessage({type:'submit',text:input.value});input.value='';};
      document.getElementById('cancel').onclick=()=>vscode.postMessage({type:'cancel'});
      document.getElementById('apply').onclick=()=>vscode.postMessage({type:'apply_accepted'});
      document.getElementById('discard').onclick=()=>vscode.postMessage({type:'discard_all'});
      window.addEventListener('message',event=>{
        const m=event.data;
        if(m.type==='text_delta') output.textContent+=m.content;
        if(m.type==='text_done') output.textContent=m.fullContent;
        if(m.type==='turn_done'||m.type==='error') output.textContent+='\\n'+(m.message||m.status||m.message);
        if(m.type==='context_receipt') receipt.innerHTML='<b>Context Receipt</b><br>'+m.receipt.items.map(i=>i.path+' — '+i.signals.join(', ')).join('<br>');
        if(m.type==='pending_change') renderChange(m.change);
        if(m.type==='change_removed') document.getElementById('change-'+m.changeId)?.remove();
      });
      function renderChange(c){
        let el=document.getElementById('change-'+c.id)||document.createElement('div');el.id='change-'+c.id;el.className='change';
        el.innerHTML='<b>'+c.path+'</b><p>'+c.reason+'</p>';
        c.hunks.forEach(h=>{const d=document.createElement('div');d.className='hunk';d.textContent=h.header+'\\n'+h.lines.map(l=>(l.type==='add'?'+':l.type==='remove'?'-':' ')+l.content).join('\\n');d.innerHTML+='<br><button onclick="acceptHunk('+JSON.stringify(c.id)+','+JSON.stringify(h.id)+')">Accept</button><button onclick="rejectHunk('+JSON.stringify(c.id)+','+JSON.stringify(h.id)+')">Reject</button>';el.appendChild(d);});
        el.innerHTML+='<button onclick="acceptFile('+JSON.stringify(c.id)+')">Accept File</button><button onclick="rejectFile('+JSON.stringify(c.id)+')">Reject File</button>';
        if(!el.isConnected)changes.appendChild(el);
      }
      function acceptHunk(changeId,hunkId){vscode.postMessage({type:'accept_hunk',changeId,hunkId});}
      function rejectHunk(changeId,hunkId){vscode.postMessage({type:'reject_hunk',changeId,hunkId});}
      function acceptFile(changeId){vscode.postMessage({type:'accept_file',changeId});}
      function rejectFile(changeId){vscode.postMessage({type:'reject_file',changeId});}
    </script></body></html>`;
  }
}
