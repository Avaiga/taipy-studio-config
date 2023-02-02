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

import { exec } from "child_process";
import { join } from "path";
import { l10n, Position, Uri, Webview, workspace } from "vscode";
import { getLog } from "./logging";

export const getNonce = () => {
  const crypto = require("crypto");
  return crypto?.randomBytes(16).toString("base64");
};

export const configFileExt = ".toml";
export const configFilePattern = `**/*${configFileExt}`;

export const getCspScriptSrc = (nonce: string) => {
  return "'nonce-" + nonce + "'" + (process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : "");
};

export const textUriListMime = "text/uri-list";

export const joinPaths = (extensionUri: Uri, ...pathSegments: string[]): Uri => Uri.joinPath(extensionUri, "dist", ...pathSegments);

export const getDefaultConfig = (webview: Webview, extensionUri: Uri) => {
  const bundleName = l10n.uri && l10n.uri.path.split("/").at(-1);
  return { icons: {}, l10nUri: bundleName && webview.asWebviewUri(joinPaths(extensionUri, "l10n", bundleName)).toString() };
};

export const getPositionFragment = (pos: Position) => `L${pos.line + 1}C${pos.character}`;

export const getFilesFromPythonPackages = (file: string, packages: string[]) => {
  const config = workspace.getConfiguration("python");
  const pythonPath = config.get("pythonPath", "python");
  getLog().info("Using python interpreter:", pythonPath);
  return new Promise<Record<string, string>>((resolve, reject) => {
    const cmd = `"${pythonPath}" "${join(__dirname, "python", "find_file_in_package.py")}" "${file}" "${packages.join('" "')}"`;
    exec(cmd, (error, stdout, stderr) => {
      if (error) {
        getLog().warn(cmd, '=>', error);
        stderr && getLog().warn(stderr);
        return reject(error.code);
      }
      return resolve(JSON.parse(stdout));
    });
  });
};