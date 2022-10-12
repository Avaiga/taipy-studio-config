import { commands, ExtensionContext, Range, TextDocument, TextEditorRevealType, TreeDataProvider, TreeItem, TreeView, Uri, window, workspace } from "vscode";
import { parse } from "@iarna/toml";

import { ConfigFilesView } from "./views/ConfigFilesView";
import { refreshPerspectiveDocumentCmd, revealConfigNodeCmd, selectConfigFileCmd, selectConfigNodeCmd } from "./commands";
import { CONFIG_DETAILS_ID, TaipyStudioSettingsName } from "./constants";
import { ConfigDetailsView } from "./providers/ConfigDetails";
import { configFileExt } from "./utils";
import {
  ConfigItem,
  ConfigNodesProvider,
  DataNodeItem,
  getCommandIdFromType,
  getTreeViewIdFromType,
  PipelineItem,
  ScenarioItem,
  TaskItem,
  TreeNodeCtor,
} from "./providers/ConfigNodesProvider";
import {
  PerspectiveContentProvider,
  PerspectiveScheme,
  isUriEqual,
  getOriginalUri,
  getPerspectiveUri,
} from "./contentProviders/PerpectiveContentProvider";
import { ConfigEditorProvider } from "./editors/ConfigEditor";
import { getTomlError } from "./l10n";

const configNodeKeySort = ([a]: [string, unknown], [b]: [string, unknown]) => (a == b ? 0 : a == "default" ? -1 : b == "default" ? 1 : a > b ? 1 : -1);

interface NodeSelectionCache {
  fileUri?: string;
  [key: string]: string;
}

export class Context {
  static create(vsContext: ExtensionContext): void {
    new Context(vsContext);
  }
  private static readonly cacheName = "taipy.selectedNodes.cache";

  private configFileUri: Uri | null = null;
  private configContent: object = null;
  private configFilesView: ConfigFilesView;
  private treeProviders: ConfigNodesProvider<ConfigItem>[] = [];
  private treeViews: TreeView<TreeItem>[] = [];
  private configDetailsView: ConfigDetailsView;
  private selectionCache: NodeSelectionCache;
  private perspectiveContentProvider: PerspectiveContentProvider;

  private constructor(private readonly vsContext: ExtensionContext) {
    this.selectionCache = vsContext.workspaceState.get(Context.cacheName, {} as NodeSelectionCache);
    // Configuration files
    this.configFilesView = new ConfigFilesView(this, "taipy-configs", this.selectionCache.fileUri);
    commands.registerCommand("taipy.refreshConfigs", this.configFilesView.refresh, this.configFilesView);
    commands.registerCommand(selectConfigFileCmd, this.selectUri, this);
    // global Commands
    commands.registerCommand(selectConfigNodeCmd, this.selectConfigNode, this);
    commands.registerCommand(revealConfigNodeCmd, this.revealConfigNodeInEditors, this);
    commands.registerCommand("taipy.show.perpective", this.showPerspective, this);
    commands.registerCommand("taipy.show.perpective.from.diagram", this.showPerspectiveFromDiagram, this);
    // Perspective Provider
    this.perspectiveContentProvider = new PerspectiveContentProvider();
    vsContext.subscriptions.push(workspace.registerTextDocumentContentProvider(PerspectiveScheme, this.perspectiveContentProvider));
    commands.registerCommand(refreshPerspectiveDocumentCmd, this.refreshPerspectiveDocument, this);
    // Create Tree Views
    this.treeViews.push(this.createTreeView(DataNodeItem));
    this.treeViews.push(this.createTreeView(TaskItem));
    this.treeViews.push(this.createTreeView(PipelineItem));
    this.treeViews.push(this.createTreeView(ScenarioItem));
    // Dispose when finished
    vsContext.subscriptions.push(...this.treeViews);
    // Details
    this.configDetailsView = new ConfigDetailsView(vsContext?.extensionUri);
    vsContext.subscriptions.push(window.registerWebviewViewProvider(CONFIG_DETAILS_ID, this.configDetailsView));
    // Document change listener
    workspace.onDidChangeTextDocument(
      (e) => {
        if (isUriEqual(this.configFileUri, e.document.uri)) {
          this.refreshProviders(e.document);
        }
      },
      this,
      vsContext.subscriptions
    );

    // file system watcher
    const fileSystemWatcher = workspace.createFileSystemWatcher(`**/*${configFileExt}`);
    fileSystemWatcher.onDidChange(this.onFileChange, this);
    fileSystemWatcher.onDidCreate(this.onFileCreateDelete, this);
    fileSystemWatcher.onDidDelete(this.onFileCreateDelete, this);
    vsContext.subscriptions.push(fileSystemWatcher);
  }

  private createTreeView<T extends ConfigItem>(nodeCtor: TreeNodeCtor<T>) {
    const provider = new ConfigNodesProvider(this, nodeCtor);
    const nodeType = provider.getNodeType();
    commands.registerCommand(getCommandIdFromType(nodeType), () => provider.refresh(this, this.configFileUri), this);
    this.treeProviders.push(provider);
    const treeView = window.createTreeView(getTreeViewIdFromType(nodeType), { treeDataProvider: provider, dragAndDropController: provider });
    return treeView;
  }

  private revealConfigNodesInTrees() {
    this.treeProviders.forEach((p, idx) => {
      const nodeType = p.getNodeType();
      const lastSelectedUri = this.selectionCache[nodeType];
      if (lastSelectedUri) {
        const self = this;
        setTimeout(() => {
          const item = p.getNodeForUri(lastSelectedUri);
          if (item && this.treeViews[idx].visible) {
            this.treeViews[idx].reveal(item, { select: true });
            self.selectConfigNode(nodeType, item.label as string, item.getNode(), item.resourceUri);
          }
        }, 1);
      }
    });
  }
  private async onFileChange(uri: Uri): Promise<void> {
    if (uri && this.configFileUri?.toString() == uri.toString()) {
      this.readConfig(await this.getDocFromUri(uri));
      this.treeProviders.forEach((p) => p.refresh(this, uri));
    }
  }

  private async onFileCreateDelete(uri: Uri): Promise<void> {
    this.configFilesView.refresh(this.selectUri?.toString());
  }

  getConfigUri() {
    return this.configFileUri;
  }

  getConfigNodes(nodeType: string): Array<[string, any]> {
    const configNodes = this.configContent ? this.configContent[nodeType] : null;
    // Sort keys so that 'default' is always the first entry.
    return Object.entries(configNodes || {})
      .sort(configNodeKeySort)
      .map((a) => a);
  }

  async selectUri(uri: Uri): Promise<void> {
    if (isUriEqual(uri, this.configFileUri)) {
      return;
    }
    this.refreshProviders(await this.getDocFromUri(uri));
  }

  private getDocFromUri(uri: Uri): Thenable<TextDocument> {
    return workspace.openTextDocument(getOriginalUri(uri));
  }

  private async refreshProviders(doc: TextDocument) {
    this.configFileUri = doc.uri;
    this.readConfig(doc);
    this.treeProviders.forEach((p) => p.refresh(this, doc.uri));
    if (this.selectionCache.fileUri != doc.uri.toString()) {
      this.selectionCache.fileUri = doc.uri.toString();
      this.vsContext.workspaceState.update(Context.cacheName, this.selectionCache);
    }
    this.revealConfigNodesInTrees();
  }

  private async selectConfigNode(nodeType: string, name: string, configNode: object, uri: Uri, reveal = true): Promise<void> {
    this.configDetailsView.setConfigNodeContent(nodeType, name, configNode);
    if (this.selectionCache[nodeType] != uri.toString()) {
      this.selectionCache[nodeType] = uri.toString();
      this.vsContext.workspaceState.update(Context.cacheName, this.selectionCache);
    }
    if (reveal) {
      this.revealConfigNodeInEditors(uri, nodeType, name);
    }
  }

  private revealConfigNodeInEditors(docUri: Uri, nodeType: string, name: string) {
    if (!workspace.getConfiguration(TaipyStudioSettingsName).get("editor.reveal.enabled", true)) {
      return;
    }
    if (isUriEqual(docUri, this.configFileUri)) {
      const providerIndex = this.treeProviders.findIndex((p) => p.getNodeType() == nodeType);
      if (providerIndex > -1) {
        const item = this.treeProviders[providerIndex].getItem(name);
        if (item) {
          this.treeViews[providerIndex].reveal(item, { select: true });
          this.selectConfigNode(nodeType, name, item.getNode(), docUri, false);
        }
      }
    }
    const editors = window.visibleTextEditors.filter((te) => isUriEqual(docUri, te.document.uri));
    if (editors.length) {
      const doc = editors[0].document;
      const section = nodeType + "." + name;
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

  private refreshPerspectiveDocument(uri: Uri) {
    this.perspectiveContentProvider.onDidChangeEmitter.fire(uri);
  }

  private showPerspectiveFromDiagram(item: { baseUri: string; perspective: string }) {
    commands.executeCommand("vscode.openWith", getPerspectiveUri(Uri.parse(item.baseUri, true), item.perspective), ConfigEditorProvider.viewType);
  }

  private readConfig(doc: TextDocument) {
    if (doc) {
      try {
        this.configContent = parse(doc.getText());
      } catch (e) {
        const sbi = window.createStatusBarItem(CONFIG_DETAILS_ID);
        sbi.text = getTomlError(doc.uri.path);
        sbi.tooltip = e.message;
        sbi.show();
      }
    } else {
      this.configContent = null;
    }
  }
}
