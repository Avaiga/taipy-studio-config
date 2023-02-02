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

import { readFile } from "fs";
import { ExtensionContext, commands, Uri } from "vscode";
import { Context } from "./context";
import { getLog } from "./utils/logging";

export async function activate(vsContext: ExtensionContext) {
    commands.executeCommand('setContext', 'taipy.numberOfConfigs', 0);
    Context.create(vsContext);
    readFile(Uri.joinPath(vsContext.extensionUri, 'package.json').fsPath, {encoding: 'utf-8'}, (err, data) => {
        if (!err) {
            try {
                const pkg = JSON.parse(data);
                getLog().info(`${pkg.displayName}: ${pkg.version} from ${vsContext.extensionPath}`);
            } catch (e) {
                getLog().error("Can't parse package.json from", vsContext.extensionPath, e);
            }
        } else {
            getLog().error("Can't read package.json from", vsContext.extensionPath, err);
        }
    });
}

// Extension is deactivated
export function deactivate() {}
