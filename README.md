# TrueForge VS Code Extension

TrueForge is a transparent VS Code coding agent with context receipts, hunk-level review, conflict detection, and explicit command approval.

## Setup

```bash
cd extension
npm install
npm run compile
npm test
```

Open this repository in VS Code and press `F5` to launch the Extension Development Host.

The extension starts its MCP listener on `127.0.0.1:7891` after VS Code startup. Start TrueForge locally on port `8790`, then register `http://127.0.0.1:7891/mcp` as the `vscode-workspace` MCP connector in TrueForge Settings. Configure the server URL in VS Code settings:

- `trueforge.baseUrl`: `http://localhost:8790`
- `trueforge.model`: model name
- `trueforge.contextTokenBudget`: `8000`

## Commands

- `Ctrl/Cmd+Shift+A`: open the agent panel
- `Ctrl/Cmd+Shift+I`: run inline edit on the current selection
- `TrueForge: Apply Accepted Changes`
- `TrueForge: Discard All Changes`
