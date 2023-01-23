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
  WebviewViewProvider,
  WebviewView,
  Webview,
  Uri,
  window,
  ExtensionContext,
  QuickPickItem,
  workspace,
  Range,
  TextEdit,
  WorkspaceEdit,
  TextDocument,
  l10n,
  languages,
  commands,
  DocumentLink,
  QuickPickItemKind,
} from "vscode";

import { getCspScriptSrc, getDefaultConfig, getNonce, getPositionFragment, joinPaths } from "../utils/utils";
import {
  DataNodeDetailsId,
  NoDetailsId,
  webviewsLibraryDir,
  webviewsLibraryName,
  containerId,
  DataNodeDetailsProps,
  NoDetailsProps,
  WebDiag,
} from "../../shared/views";
import { Action, EditProperty, Refresh } from "../../shared/commands";
import { ViewMessage } from "../../shared/messages";
import { Context } from "../context";
import { getOriginalUri, isUriEqual } from "./PerpectiveContentProvider";
import { getEnum, getEnumProps, getProperties, calculatePythonSymbols, isFunction, isClass } from "../schema/validation";
import { getDescendantProperties, getNodeFromSymbol, getPythonSuffix, getSectionName, getSymbol, getUnsuffixedName } from "../utils/symbols";
import { getChildType } from "../../shared/childtype";
import { stringify } from "@iarna/toml";
import { getCreateFunctionOrClassLabel, getModulesAndSymbols } from "../utils/pythonSymbols";

export class ConfigDetailsView implements WebviewViewProvider {
  private _view: WebviewView;
  private readonly extensionUri: Uri;
  private configUri: Uri;
  private nodeType: string;
  private nodeName: string;

  constructor(private readonly context: ExtensionContext, private readonly taipyContext: Context) {
    this.extensionUri = context.extensionUri;
    this.setEmptyContent();
  }

  setEmptyContent(): void {
    this._view?.webview.postMessage({
      viewId: NoDetailsId,
      props: { message: l10n.t("No selected element.") } as NoDetailsProps,
    } as ViewMessage);
  }

  setConfigNodeContent(nodeType: string, name: string, node: any, uri: Uri): void {
    this.configUri = getOriginalUri(uri);
    this.nodeType = nodeType;
    this.nodeName = name;
    this.getNodeDiagnosticsAndLinks(node).then((diags) => {
      this._view?.webview.postMessage({
        viewId: DataNodeDetailsId,
        props: { nodeType, nodeName: name, node, diagnostics: Object.keys(diags).length ? diags : undefined } as DataNodeDetailsProps,
      } as ViewMessage);
    });
  }

  private async getNodeDiagnosticsAndLinks(node: any) {
    const diags = languages.getDiagnostics(this.configUri);
    const links = (await commands.executeCommand("vscode.executeLinkProvider", this.configUri)) as DocumentLink[];
    if (diags.length || links.length) {
      const symbols = this.taipyContext.getSymbols(this.configUri.toString());
      return Object.keys(node).reduce((obj, key) => {
        const symbol = getSymbol(symbols, this.nodeType, this.nodeName, key);
        if (symbol) {
          const diag = diags.find((d) => !!d.range.intersection(symbol.range));
          if (diag) {
            obj[key] = {
              message: diag.message,
              severity: diag.severity,
              uri: this.configUri.with({ fragment: getPositionFragment(diag.range.start) }).toString(),
            };
          }
          const link = links.find((l) => !!l.range.intersection(symbol.range));
          if (link) {
            obj[key] = obj[key] || { uri: "" };
            obj[key].uri = link.target?.toString();
            obj[key].link = true;
          }
        }
        return obj;
      }, {} as Record<string, WebDiag>);
    }
    return {};
  }

  //called when a view first becomes visible
  resolveWebviewView(webviewView: WebviewView): void | Thenable<void> {
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.extensionUri],
      enableCommandUris: true,
    };
    webviewView.webview.html = this.getHtmlForWebview(webviewView.webview);
    this._view = webviewView;
    this._view.webview.onDidReceiveMessage(
      (e) => {
        switch (e.command) {
          case "SHOW_WARNING_LOG":
            window.showWarningMessage(e.data.message);
            break;
          case Refresh:
            this.setEmptyContent();
            break;
          case Action:
            window.showErrorMessage("Action from webview", e.id, e.msg);
            break;
          case EditProperty:
            this.editProperty(e.nodeType, e.nodeName, e.propertyName, e.propertyValue);
            break;
          default:
            break;
        }
      },
      this,
      this.context.subscriptions
    );

    this.taipyContext.registerDocChangeListener(this.docListener, this);
    this._view.onDidDispose(() => {
      this.taipyContext.unregisterDocChangeListener(this.docListener, this);
    });
  }

  private docListener(textDocument: TextDocument) {
    if (isUriEqual(this.configUri, textDocument.uri)) {
      const symbols = this.taipyContext.getSymbols(this.configUri.toString());
      if (!symbols) {
        this.setEmptyContent();
      }
      const nameSymbol = getSymbol(symbols, this.nodeType, this.nodeName);
      const node = getNodeFromSymbol(textDocument, nameSymbol);
      this._view?.webview.postMessage({
        viewId: DataNodeDetailsId,
        props: { nodeType: this.nodeType, nodeName: this.nodeName, node: node } as DataNodeDetailsProps,
      } as ViewMessage);
    }
  }

  private async editProperty(nodeType: string, nodeName: string, propertyName?: string, propertyValue?: string | string[]) {
    const symbols = this.taipyContext.getSymbols(this.configUri.toString());
    if (!symbols) {
      return;
    }
    const insert = !propertyName;
    let propertyRange: Range;
    if (insert) {
      const nameSymbol = getSymbol(symbols, nodeType, nodeName);
      propertyRange = nameSymbol.range;
      const currentProps = nameSymbol.children.map((s) => s.name.toLowerCase());
      const properties = (await getProperties(nodeType)).filter((p) => !currentProps.includes(p.toLowerCase()));
      propertyName = await window.showQuickPick(properties, { canPickMany: false, title: l10n.t("Select property for {0}.", nodeType) });
      if (!propertyName) {
        return;
      }
    } else {
      propertyRange = getSymbol(symbols, nodeType, nodeName, propertyName).range;
    }
    let newVal: string | string[];
    const linksProp = getDescendantProperties(nodeType).find((p) => p.toLowerCase() === propertyName?.toLowerCase());
    if (linksProp) {
      const childType = getChildType(nodeType);
      const values = ((propertyValue || []) as string[]).map((v) => getUnsuffixedName(v.toLowerCase()));
      const childNames = getSymbol(symbols, childType).children.map(
        (s) => ({ label: getSectionName(s.name), picked: values.includes(getUnsuffixedName(s.name.toLowerCase())) } as QuickPickItem)
      );
      if (!childNames.length) {
        window.showInformationMessage(l10n.t("No {0} entity in toml.", childType));
        return;
      }
      const res = await window.showQuickPick(childNames, {
        canPickMany: true,
        title: l10n.t("Select {0} entities for {1}.{2}", childType, nodeType, propertyName),
      });
      if (!res) {
        return;
      }
      newVal = res.map((q) => q.label);
    } else {
      await calculatePythonSymbols();
      const isFn = isFunction(propertyName);
      if (isFn || isClass(propertyName)) {
        const [symbolsWithModule, modulesByUri] = await getModulesAndSymbols(isFn);
        const currentModule = propertyValue && (propertyValue as string).split(".", 2)[0];
        let resMod: string;
        let resUri: string;
        if (Object.keys(modulesByUri).length) {
          const items = Object.entries(modulesByUri).map(
            ([uri, module]) => ({ label: module, picked: module === currentModule, uri: uri } as QuickPickItem & { uri?: string; create?: boolean })
          );
          items.push({ label: "", kind: QuickPickItemKind.Separator });
          items.push({ label: l10n.t("New module name"), create: true });
          const item = await window.showQuickPick(items, { canPickMany: false, title: l10n.t("Select Python module for {0}.{1}", nodeType, propertyName) });
          if (!item) {
            return;
          }
          if (!item.create) {
            resMod = item.label;
            resUri = item.uri;
          }
        }
        if (!resMod) {
          resMod = await window.showInputBox({ title: l10n.t("Enter Python module for {0}.{1}", nodeType, propertyName), value: currentModule });
          if (resMod) {
            resMod = resMod.trim();
            resUri = Object.keys(modulesByUri).find((u) => modulesByUri[u] === resMod);
          }
        }
        if (!resMod) {
          return;
        }
        const symbols = symbolsWithModule.filter((s) => s.split(".", 2)[0] === resMod);
        let resFunc: string;
        if (symbols.length) {
          const currentfunc = propertyValue && propertyValue.includes(".") && `${resMod}.${(propertyValue as string).split(".", 2)[1]}`;
          const items = symbols.map((fn) => ({ label: fn, picked: fn === currentfunc } as QuickPickItem & { create?: boolean }));
          items.push({ label: "", kind: QuickPickItemKind.Separator });
          items.push({ label: getCreateFunctionOrClassLabel(isFn), create: true });
          const item = await window.showQuickPick(items, {
            canPickMany: false,
            title: l10n.t("Select Python {0} for {1}.{2}", getPythonSuffix(isFn), nodeType, propertyName),
          });
          if (!item) {
            return;
          }
          if (!item.create) {
            resFunc = item.label;
          }
        }
        if (!resFunc) {
          resFunc = await window.showInputBox({
            title: l10n.t("Enter Python {0} name for {1}.{2}", getPythonSuffix(isFn), nodeType, propertyName),
            value: `${resMod}.${getPythonSuffix(isFn)}`,
            valueSelection: [resMod.length + 1, resMod.length + 1 + getPythonSuffix(isFn).length],
          });
        }
        if (!resFunc) {
          return;
        }
        newVal = `${resFunc}:${getPythonSuffix(isFn)}`;
      } else {
        const enumProps = await getEnumProps();
        const enumProp = enumProps.find((p) => p.toLowerCase() === propertyName?.toLowerCase());
        const res = enumProp
          ? await window.showQuickPick(
              getEnum(enumProp).map((v) => ({ label: v, picked: v === propertyValue })),
              { canPickMany: false, title: l10n.t("Select value for {0}.{1}", nodeType, propertyName) }
            )
          : await window.showInputBox({ title: l10n.t("Enter value for {0}.{1}", nodeType, propertyName), value: propertyValue as string });
        if (res === undefined) {
          return;
        }
        newVal = typeof res === "string" ? res : res.label;
      }
    }
    if (insert) {
      propertyRange = propertyRange.with({ end: propertyRange.end.with({ character: 0 }) });
    }
    const we = new WorkspaceEdit();
    we.set(this.configUri, [
      insert
        ? TextEdit.insert(propertyRange.end, `${propertyName} = ${stringify.value(newVal).trim()}\n`)
        : TextEdit.replace(propertyRange, stringify.value(newVal).trim()),
    ]);
    return workspace.applyEdit(we);
  }

  private getHtmlForWebview(webview: Webview) {
    // Get the local path to main script run in the webview, then convert it to a uri we can use in the webview.
    // Script to handle user action
    const scriptUri = webview.asWebviewUri(joinPaths(this.extensionUri, webviewsLibraryDir, webviewsLibraryName));
    // CSS file to handle styling
    const styleUri = webview.asWebviewUri(joinPaths(this.extensionUri, webviewsLibraryDir, "config-panel.css"));

    const codiconsUri = webview.asWebviewUri(joinPaths(this.extensionUri, "@vscode/codicons", "dist", "codicon.css"));

    // Use a nonce to only allow a specific script to be run.
    const nonce = getNonce();
    return `<html>
                <head>
                    <meta charSet="utf-8"/>
                    <meta http-equiv="Content-Security-Policy" 
                                content="default-src 'none';
                                img-src vscode-resource: https:;
                                font-src ${webview.cspSource};
                                style-src ${webview.cspSource} 'unsafe-inline';
                                script-src ${getCspScriptSrc(nonce)};">             
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                    <link href="${styleUri}" rel="stylesheet" />
                    <link href="${codiconsUri}" rel="stylesheet" />
                    <script nonce="${nonce}" defer type="text/javascript" src="${scriptUri}"></script>
          <script nonce="${nonce}" type="text/javascript">window.taipyConfig=${JSON.stringify(getDefaultConfig(webview, this.extensionUri))};</script>
                </head>
                <body>
                    <div id="${containerId}"></div>
                </body>
      </html>`;
  }
}
