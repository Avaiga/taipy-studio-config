/*
 * Copyright 2023 Avaiga Private Limited
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with
 * the License. You may obtain a copy of the License at
 *
 *        http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software distributed under the License is distributed on
 * an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the License for the
 * specific language governing permissions and limitations under the License.
 */

import {
  commands,
  DocumentSymbol,
  ExtensionContext,
  l10n,
  Position,
  Range,
  TextDocument,
  TextDocumentChangeEvent,
  TextEdit,
  TextEditorRevealType,
  TreeItem,
  TreeView,
  Uri,
  window,
  workspace,
  WorkspaceEdit,
} from "vscode";
import { JsonMap } from "@iarna/toml";

import { ConfigFilesView } from "./views/ConfigFilesView";
import { revealConfigNodeCmd, selectConfigFileCmd, selectConfigNodeCmd } from "./utils/commands";
import { CONFIG_DETAILS_ID, TAIPY_STUDIO_SETTINGS_NAME } from "./utils/constants";
import { ConfigDetailsView } from "./providers/ConfigDetails";
import { configFilePattern } from "./utils/utils";
import {
  ConfigItem,
  ConfigNodesProvider,
  DataNodeItem,
  getCreateCommandIdFromType,
  getRefreshCommandIdFromType,
  getTreeViewIdFromType,
  PipelineItem,
  ScenarioItem,
  TaskItem,
  TreeNodeCtor,
} from "./providers/ConfigNodesProvider";
import { PerspectiveContentProvider, PERSPECTIVE_SCHEME, isUriEqual, getOriginalUri, getPerspectiveUri } from "./providers/PerpectiveContentProvider";
import { ConfigEditorProvider } from "./editors/ConfigEditor";
import { cleanDocumentDiagnostics, reportInconsistencies } from "./utils/errors";
import { ValidateFunction } from "ajv/dist/2020";
import { getValidationFunction } from "./schema/validation";
import { getDescendantProperties, getParentType, getSymbol, getSymbolArrayValue, getUnsuffixedName } from "./utils/symbols";
import { PythonCodeActionProvider } from "./providers/PythonCodeActionProvider";
import { PythonLinkProvider } from "./providers/PythonLinkProvider";
import { getNodeNameValidationFunction } from "./utils/pythonSymbols";

const configNodeKeySort = (a: DocumentSymbol, b: DocumentSymbol) => (a === b ? 0 : a.name === "default" ? -1 : b.name === "default" ? 1 : a.name > b.name ? 1 : -1);

interface NodeSelectionCache {
  fileUri?: string;
  lastView?: string;
  [key: string]: string;
}

export class Context {
  static create(vsContext: ExtensionContext): void {
    new Context(vsContext);
  }
  private static readonly cacheName = "taipy.selectedNodes.cache";

  private configFileUri?: Uri;
  private readonly configFilesView: ConfigFilesView;
  private readonly treeProviders: ConfigNodesProvider<ConfigItem>[] = [];
  private readonly treeViews: TreeView<TreeItem>[] = [];
  private readonly configDetailsView: ConfigDetailsView;
  private readonly selectionCache: NodeSelectionCache;
  // original Uri => symbols
  private readonly symbolsByUri: Record<string, Array<DocumentSymbol>> = {};
  // docChanged listeners
  private readonly docChangedListener: Array<[ConfigEditorProvider, (document: TextDocument) => void]> = [];
  // editors
  private readonly configEditorProvider: ConfigEditorProvider;
  // Json Schema Validator
  private validateSchema: ValidateFunction<JsonMap>;

  private constructor(private readonly vsContext: ExtensionContext) {
    this.selectionCache = vsContext.workspaceState.get(Context.cacheName, {} as NodeSelectionCache);
    // Configuration files
    this.configFilesView = new ConfigFilesView(this, "taipy-configs", this.selectionCache.fileUri);
    commands.registerCommand("taipy.config.refresh", this.configFilesView.refresh, this.configFilesView);
    commands.registerCommand(selectConfigFileCmd, this.selectConfigUri, this);
    // global Commands
    commands.registerCommand(selectConfigNodeCmd, this.selectConfigNode, this);
    commands.registerCommand(revealConfigNodeCmd, this.revealConfigNodeInEditors, this);
    commands.registerCommand("taipy.perspective.show", this.showPerspective, this);
    commands.registerCommand("taipy.perspective.showFromDiagram", this.showPerspectiveFromDiagram, this);
    commands.registerCommand("taipy.details.showLink", this.showPropertyLink, this);
    commands.registerCommand("taipy.config.renameNode", this.renameNode, this);
    // Perspective Provider
    vsContext.subscriptions.push(workspace.registerTextDocumentContentProvider(PERSPECTIVE_SCHEME, new PerspectiveContentProvider()));
    // Create Tree Views
    this.treeViews.push(this.createTreeView(DataNodeItem));
    this.treeViews.push(this.createTreeView(TaskItem));
    this.treeViews.push(this.createTreeView(PipelineItem));
    this.treeViews.push(this.createTreeView(ScenarioItem));
    // Dispose when finished
    vsContext.subscriptions.push(...this.treeViews);
    // Config editor
    this.configEditorProvider = ConfigEditorProvider.register(vsContext, this);
    // Details
    this.configDetailsView = new ConfigDetailsView(vsContext, this);
    vsContext.subscriptions.push(window.registerWebviewViewProvider(CONFIG_DETAILS_ID, this.configDetailsView));
    // Document change listener
    workspace.onDidChangeTextDocument(this.onDocumentChanged, this, vsContext.subscriptions);
    // file system watcher
    const fileSystemWatcher = workspace.createFileSystemWatcher(configFilePattern);
    fileSystemWatcher.onDidChange(this.onFileChange, this);
    fileSystemWatcher.onDidCreate(this.onFileCreate, this);
    fileSystemWatcher.onDidDelete(this.onFileDelete, this);
    vsContext.subscriptions.push(fileSystemWatcher);
    // directory watcher
    const directoriesWatcher = workspace.createFileSystemWatcher("**/");
    directoriesWatcher.onDidChange(this.onFileChange, this);
    directoriesWatcher.onDidCreate(this.onFileCreate, this);
    directoriesWatcher.onDidDelete(this.onFileDelete, this);
    vsContext.subscriptions.push(directoriesWatcher);
    // Json schema validator
    getValidationFunction()
      .then((fn) => (this.validateSchema = fn))
      .catch(console.warn);
    // Quick fix
    PythonCodeActionProvider.register(vsContext);
    // python links
    PythonLinkProvider.register(vsContext, this);
  }

  private async onDocumentChanged(e: TextDocumentChangeEvent) {
    if (this.symbolsByUri[getOriginalUri(e.document.uri).toString()]) {
      await this.refreshSymbols(e.document);
      this.docChangedListener.forEach(([t, l]) => l.call(t, e.document));
    }
    if (isUriEqual(this.configFileUri, e.document.uri)) {
      this.treeProviders.forEach((p) => p.refresh(this, e.document.uri));
      this.revealConfigNodesInTrees();
    }
  }

  registerDocChangeListener(listener: (document: TextDocument) => void, thisArg: any) {
    this.docChangedListener.push([thisArg, listener]);
  }
  unregisterDocChangeListener(listener: (document: TextDocument) => void, thisArg: any) {
    const idx = this.docChangedListener.findIndex(([t, l]) => t === thisArg && l === listener);
    idx > -1 && this.docChangedListener.splice(idx, 1);
  }

  private createNewElement(nodeType: string) {
    this.configEditorProvider.createNewElement(this.configFileUri, nodeType);
  }

  private createTreeView<T extends ConfigItem>(nodeCtor: TreeNodeCtor<T>) {
    const provider = new ConfigNodesProvider(this, nodeCtor);
    const nodeType = provider.getNodeType();
    commands.registerCommand(getRefreshCommandIdFromType(nodeType), () => provider.refresh(this, this.configFileUri), this);
    commands.registerCommand(getCreateCommandIdFromType(nodeType), () => this.createNewElement(nodeType), this);
    this.treeProviders.push(provider);
    const treeView = window.createTreeView(getTreeViewIdFromType(nodeType), { treeDataProvider: provider, dragAndDropController: provider });
    return treeView;
  }

  private revealConfigNodesInTrees() {
    this.unselectConfigNode();
    this.treeProviders.forEach((p, idx) => {
      if (!this.treeViews[idx].visible) {
        return;
      }
      const nodeType = p.getNodeType();
      const self = this;
      setTimeout(() => {
        const nodeName = this.selectionCache[nodeType];
        const item = p.getItem(nodeName);
        if (item) {
          self.treeViews[idx].reveal(item, { select: true });
          self.selectConfigNode(nodeType, item.label as string, item.getNode(), item.resourceUri, false);
        }
      }, 1);
    });
  }

  private async onFileChange(uri: Uri): Promise<void> {
    if (uri && this.configFileUri?.toString() === uri.toString()) {
      if (await this.readSymbols(await this.getDocFromUri(uri))) {
        this.treeProviders.forEach((p) => p.refresh(this, uri));
      }
    }
  }

  private async onFileCreate(uri: Uri): Promise<void> {
    this.configFilesView.refresh(this.configFileUri?.toString());
  }

  private async onFileDelete(uri: Uri): Promise<void> {
    if (isUriEqual(uri, this.configFileUri)) {
      this.configFileUri = undefined;
      this.treeProviders.forEach((p) => p.refresh(this));
    }
    this.configFilesView.refresh(this.configFileUri?.toString());
  }

  getConfigUri() {
    return this.configFileUri;
  }

  getConfigNodes(nodeType: string): Array<DocumentSymbol> {
    const symbols = this.getSymbols(this.configFileUri?.toString());
    const typeSymbol = getSymbol(symbols, nodeType);
    // Sort keys so that 'default' is always the first entry.
    return (typeSymbol && typeSymbol.children.sort(configNodeKeySort)) || [];
  }

  async selectConfigUri(uri: Uri): Promise<void> {
    if (isUriEqual(uri, this.configFileUri)) {
      return;
    }
    this.configFileUri = uri;
    if (!this.symbolsByUri[uri.toString()]) {
      await this.readSymbols(await this.getDocFromUri(uri));
    }
    this.treeProviders.forEach((p) => p.refresh(this, uri));
    this.revealConfigNodesInTrees();

    if (this.selectionCache.fileUri !== uri.toString()) {
      this.selectionCache.fileUri = uri.toString();
      this.vsContext.workspaceState.update(Context.cacheName, this.selectionCache);
    }
  }

  getDocFromUri(uri: Uri): Thenable<TextDocument> {
    return workspace.openTextDocument(getOriginalUri(uri));
  }

  private async unselectConfigNode(): Promise<void> {
    this.configDetailsView.setEmptyContent();
  }

  updateSelectionCache(nodeType: string, oldNodeName: string, nodeName: string) {
    if (this.selectionCache[nodeType] === oldNodeName) {
      this.selectionCache[nodeType] = nodeName;
      this.vsContext.workspaceState.update(Context.cacheName, this.selectionCache);
    }
  }

  private async selectConfigNode(nodeType: string, name: string, configNode: object, uri: Uri, reveal = true, fromInEditor = true): Promise<void> {
    let updateCache = false;
    if (reveal || this.selectionCache.lastView === nodeType) {
      this.configDetailsView.setConfigNodeContent(nodeType, name, configNode, uri);
    }
    if (this.selectionCache[nodeType] !== name) {
      this.selectionCache[nodeType] = name;
      updateCache = true;
    }
    if (reveal && this.selectionCache.lastView !== nodeType) {
      this.selectionCache.lastView = nodeType;
      updateCache = true;
    }
    if (updateCache) {
      this.vsContext.workspaceState.update(Context.cacheName, this.selectionCache);
    }
    if (reveal && fromInEditor) {
      this.revealConfigNodeInEditors(uri, nodeType, name);
    }
  }

  private revealConfigNodeInEditors(docUri: Uri, nodeType: string, name: string) {
    if (!workspace.getConfiguration(TAIPY_STUDIO_SETTINGS_NAME).get("editor.reveal.enabled", true)) {
      return;
    }
    if (isUriEqual(docUri, this.configFileUri)) {
      const providerIndex = this.treeProviders.findIndex((p) => p.getNodeType() === nodeType);
      if (providerIndex > -1) {
        const item = this.treeProviders[providerIndex].getItem(name);
        if (item) {
          this.treeViews[providerIndex].reveal(item, { select: true });
          this.selectConfigNode(nodeType, name, item.getNode(), docUri, true, false);
        }
      }
    }
    const editors = window.visibleTextEditors.filter((te) => isUriEqual(docUri, te.document.uri) && te !== window.activeTextEditor); // don't reveal in the active editor
    if (editors.length) {
      const doc = editors[0].document;
      const section = `[${nodeType}.${name}`;
      for (let i = 0; i < doc.lineCount; i++) {
        const line = doc.lineAt(i);
        const p = line.text.indexOf(section);
        if (p > -1) {
          const range = new Range(line.range.start.translate(0, p), line.range.start.translate(0, p + section.length));
          editors.forEach((editor) => {
            editor.revealRange(range, TextEditorRevealType.InCenter);
          });
          return;
        }
      }
    }
  }

  private showPerspective(item: TreeItem) {
    commands.executeCommand("vscode.openWith", item.resourceUri, ConfigEditorProvider.viewType);
  }

  private showPerspectiveFromDiagram(item: { baseUri: string; perspective: string }) {
    commands.executeCommand("vscode.openWith", getPerspectiveUri(Uri.parse(item.baseUri, true), item.perspective), ConfigEditorProvider.viewType);
  }

  private showPropertyLink(item: { baseUri: string; }) {
    commands.executeCommand("vscode.open", Uri.parse(item.baseUri, true));
  }

  private async renameNode(item: TreeItem) {
    this.configDetailsView.doRenameNode(getOriginalUri(item.resourceUri), item.contextValue, item.label as string);
  }

  getSymbols(uri: string) {
    return (uri && this.symbolsByUri[uri]) || [];
  }

  async refreshSymbols(document: TextDocument) {
    const uri = document.uri.toString();
    if (this.symbolsByUri[uri]) {
      await this.readSymbols(document);
    }
  }

  async readSymbolsIfNeeded(document: TextDocument) {
    const uri = document.uri.toString();
    if (!this.symbolsByUri[uri]) {
      await this.readSymbols(document);
    }
  }

  private async readSymbols(document: TextDocument) {
    cleanDocumentDiagnostics(document.uri);
    const symbols = (await commands.executeCommand("vscode.executeDocumentSymbolProvider", document.uri)) as DocumentSymbol[];
    this.symbolsByUri[document.uri.toString()] = symbols;
    reportInconsistencies(document, symbols, null);
    return true;
  }
}
