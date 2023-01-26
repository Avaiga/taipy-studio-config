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

import { Fragment, MouseEvent, useCallback } from "react";
import * as l10n from "@vscode/l10n";

import { postEditNodeName, postEditProperty } from "../utils/messaging";
import { DataNodeDetailsProps, WebDiag } from "../../../shared/views";

const getAsString = (val: string | string[]) => (Array.isArray(val) ? (val as string[]).join(", ") : typeof val === "string" ? val : JSON.stringify(val));

const getDiagContext = (diag: WebDiag) =>
  JSON.stringify({
    webviewSection: "taipy.property",
    baseUri: diag.uri,
  });

const getDiagStyle = (diag: WebDiag) =>
  (diag.severity !== undefined
    ? {
        textDecorationLine: "underline",
        textDecorationStyle: "wavy",
        textDecorationColor:
          diag.severity === 0
            ? "var(--vscode-editorError-foreground)"
            : diag.severity === 1
            ? "var(--vscode-editorWarning-foreground)"
            : "var(--vscode-editorInfo-foreground)",
      }
    : { textDecorationLine: "underline" }) as React.CSSProperties;

const DataNodePanel = ({ nodeType, nodeName, node, diagnostics }: DataNodeDetailsProps) => {
  const editPropertyValue = useCallback(
    (evt: MouseEvent<HTMLDivElement>) => {
      const propertyName = evt.currentTarget.dataset.propertyName;
      postEditProperty(nodeType, nodeName, propertyName, propertyName && node[propertyName]);
    },
    [nodeType, nodeName, node]
  );

  const editNodeName = useCallback(() => postEditNodeName(nodeType, nodeName), [nodeType, nodeName]);

  return (
    <div className="taipy-datanode-panel">
      <div className="property-grid">
        <h2>{nodeType}</h2>
        <h2>{nodeName}</h2>
        <div className="panel-button icon" title={l10n.t("edit")} onClick={editNodeName}>
          <i className="codicon codicon-edit"></i>
        </div>
        {Object.entries(node).map(([k, n]) => {
          const valProps =
            diagnostics && diagnostics[k]
              ? { title: diagnostics[k].message, "data-vscode-context": getDiagContext(diagnostics[k]), style: getDiagStyle(diagnostics[k]) }
              : {};
          return (
            <Fragment key={k}>
              <div {...valProps}>{k}</div>
              <div {...valProps}>{getAsString(n)}</div>
              <div className="panel-button icon" data-property-name={k} title={l10n.t("edit")} onClick={editPropertyValue}>
                <i className="codicon codicon-edit"></i>
              </div>
            </Fragment>
          );
        })}
        <div>{l10n.t("New Property")}</div>
        <div></div>
        <div className="panel-button icon" title={l10n.t("edit")} onClick={editPropertyValue}>
          <i className="codicon codicon-edit"></i>
        </div>
      </div>
    </div>
  );
};

export default DataNodePanel;
