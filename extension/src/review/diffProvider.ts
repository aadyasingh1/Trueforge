import * as vscode from 'vscode';

export class TrueForgeDiffProvider implements vscode.TextDocumentContentProvider {
  private readonly documents = new Map<string, string>();
  provideTextDocumentContent(uri: vscode.Uri): string {
    return this.documents.get(uri.toString()) ?? '';
  }
  set(id: string, content: string): vscode.Uri {
    const uri = vscode.Uri.parse(`trueforge:${encodeURIComponent(id)}.txt`);
    this.documents.set(uri.toString(), content);
    return uri;
  }
}
