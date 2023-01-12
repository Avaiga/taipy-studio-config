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

import { l10n, Uri, Webview, window, workspace } from "vscode";

export const getNonce = () => {
  const crypto = require("crypto");
  return crypto?.randomBytes(16).toString("base64");
};

export const configFileExt = ".toml";
export const configFilePattern = `**/*${configFileExt}`;

export const getCspScriptSrc = (nonce: string) => {
  return "'nonce-" + nonce + "'" + (process.env.NODE_ENV == "development" ? " 'unsafe-eval'" : "");
};

export const textUriListMime = "text/uri-list";

export const joinPaths = (extensionUri: Uri, ...pathSegments: string[]): Uri => Uri.joinPath(extensionUri, "dist", ...pathSegments);

export const getDefaultConfig = (webview: Webview, extensionUri: Uri) => {
  const bundleName = l10n.uri && l10n.uri.path.split("/").at(-1);
  return { icons: {}, l10nUri: bundleName && webview.asWebviewUri(joinPaths(extensionUri, "l10n", bundleName)).toString() };
};

export const getMainPythonUri = async () => {
  const workspaceConfig = workspace.getConfiguration("taipyStudio.config", workspace.workspaceFolders[0]);
  const mainFile = workspaceConfig.get<string>("mainPythonFile");
  const mainUris = await workspace.findFiles(mainFile, null, 1);
  let mainUri = mainUris.length ? mainUris[0] : undefined;
  if (!mainUri) {
    const pyFiles = await workspace.findFiles("*.py", null, 1);
    mainUri = pyFiles.length ? pyFiles[0] : undefined;
    if (mainUri) {
      workspaceConfig.update("mainPythonFile", workspace.asRelativePath(mainUri));
      window.showInformationMessage(l10n.t("Main module file has been set up as {0} in Workspace settings", workspace.asRelativePath(mainUri)));
    } else {
      console.warn("No symbol detection as there is no python file in workspace.");
    }
  }
  return mainUri || null;
};