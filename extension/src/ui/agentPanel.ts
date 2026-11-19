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
      body{font:13px -apple-system,BlinkMacSystemFont,sans-serif;color:var(--vscode-editor-foreground);background:var(--vscode-editor-background);padding:12px}textarea{width:100%;min-height:70px;box-sizing:border-box;background:var(--vscode-input-background);color:var(--vscode-input-foreground);border:1px solid var(--vscode-input-border)}button{margin:4px 4px 4px 0;padding:6px 10px}#output{white-space:pre-wrap;margin:14px 0}#receipt,#changes{margin-top:12px}.change{border:1px solid var(--vscode-panel-border);padding:8px;margin:8px 0}.hunk{font-family:monospace;white-space:pre-wrap;color:var(--vscode-descriptionForeground);margin:8px 0}.toolbar{display:flex}#status{margin-top:8px;padding:8px;white-space:pre-wrap}.badge{display:inline-block;margin-left:8px;padding:2px 6px;border-radius:4px}
    </style></head><body><h2>TrueForge</h2><textarea id="input" placeholder="Describe a task..."></textarea><div class="toolbar"><button id="submit">Send</button><button id="cancel">Cancel</button><button id="apply">Apply Accepted</button><button id="discard">Discard All</button></div><div id="status"></div><div id="receipt"></div><div id="output"></div><div id="changes"></div>
    <script>
      const vscode=acquireVsCodeApi();
      const output=document.getElementById('output'), changes=document.getElementById('changes'), receipt=document.getElementById('receipt'), status=document.getElementById('status');
      const changePaths=Object.create(null);
      function makeButton(label,onClick){const button=document.createElement('button');button.textContent=label;button.addEventListener('click',onClick);return button;}
      function showStatus(text,ok){status.textContent=text;status.style.backgroundColor=ok?'var(--vscode-testing-iconPassed, #2e7d32)':'var(--vscode-testing-iconFailed, #b71c1c)';status.style.color='#fff';}
      document.getElementById('submit').addEventListener('click',()=>{const input=document.getElementById('input');if(!input.value.trim())return;output.textContent='';status.textContent='';status.style.backgroundColor='transparent';vscode.postMessage({type:'submit',text:input.value});input.value='';});
      document.getElementById('cancel').addEventListener('click',()=>vscode.postMessage({type:'cancel'}));
      document.getElementById('apply').addEventListener('click',()=>vscode.postMessage({type:'apply_accepted'}));
      document.getElementById('discard').addEventListener('click',()=>{vscode.postMessage({type:'discard_all'});showStatus('All proposed changes discarded. No files were modified.',true);});
      window.addEventListener('message',event=>{
        const m=event.data;
        if(m.type==='text_delta') output.textContent+=m.content;
        if(m.type==='text_done') output.textContent=m.fullContent;
        if(m.type==='turn_done') output.textContent+='\\n'+(m.message||m.status);
        if(m.type==='error'){output.textContent+='\\n'+m.message;showStatus('Error: '+m.message,false);}
        if(m.type==='apply_result'){
          const parts=[];
          if(m.applied.length)parts.push('Applied: '+m.applied.join(', '));
          if(m.conflicts.length)parts.push('Conflict (file changed since the diff was made): '+m.conflicts.join(', '));
          if(m.failed.length)parts.push('Failed: '+m.failed.join(', '));
          const text=parts.length?parts.join('\\n'):'Nothing to apply. Accept a hunk or file first.';
          showStatus(text,m.success&&m.applied.length>0);
          Object.keys(changePaths).forEach(id=>{if(m.applied.includes(changePaths[id])){document.getElementById('change-'+id)?.remove();delete changePaths[id];}});
        }
        if(m.type==='context_receipt'){
          receipt.replaceChildren();
          const title=document.createElement('b');title.textContent='Context Receipt';receipt.appendChild(title);
          m.receipt.items.forEach(i=>{const item=document.createElement('div');item.textContent=i.path+' — '+i.signals.join(', ');receipt.appendChild(item);});
        }
        if(m.type==='pending_change') renderChange(m.change);
        if(m.type==='change_removed'){document.getElementById('change-'+m.changeId)?.remove();delete changePaths[m.changeId];}
      });
      function renderChange(c){
        const el=document.createElement('div');el.id='change-'+c.id;el.className='change';
        changePaths[c.id]=c.path;
        const title=document.createElement('b');title.textContent=c.path;el.appendChild(title);
        const fileBadge=document.createElement('span');fileBadge.className='badge';el.appendChild(fileBadge);
        const reason=document.createElement('p');reason.textContent=c.reason;el.appendChild(reason);
        const hunkBadges=[];
        c.hunks.forEach(h=>{
          const d=document.createElement('div');d.className='hunk';
          d.textContent=h.header+'\\n'+h.lines.map(l=>(l.type==='add'?'+':l.type==='remove'?'-':' ')+l.content).join('\\n');
          const badge=document.createElement('span');badge.className='badge';hunkBadges.push(badge);
          const actions=document.createElement('div');
          actions.appendChild(makeButton('Accept',()=>{vscode.postMessage({type:'accept_hunk',changeId:c.id,hunkId:h.id});setBadge(badge,true);}));
          actions.appendChild(makeButton('Reject',()=>{vscode.postMessage({type:'reject_hunk',changeId:c.id,hunkId:h.id});setBadge(badge,false);}));
          actions.appendChild(badge);d.appendChild(actions);el.appendChild(d);
        });
        el.appendChild(makeButton('Accept File',()=>{vscode.postMessage({type:'accept_file',changeId:c.id});setBadge(fileBadge,true);hunkBadges.forEach(b=>setBadge(b,true));}));
        el.appendChild(makeButton('Reject File',()=>{vscode.postMessage({type:'reject_file',changeId:c.id});setBadge(fileBadge,false);hunkBadges.forEach(b=>setBadge(b,false));}));
        document.getElementById('change-'+c.id)?.remove();changes.appendChild(el);
      }
      function setBadge(badge,accepted){badge.textContent=accepted?'✓ Accepted':'✗ Rejected';badge.style.color=accepted?'#1b5e20':'#b71c1c';badge.style.backgroundColor=accepted?'#c8e6c9':'#ffcdd2';}
    </script></body></html>`;
  }
}
