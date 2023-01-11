/*
 * Copyright 2022 Avaiga Private Limited
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

import { postEditProperty } from "../utils/messaging";
import { DataNodeDetailsProps } from "../../../shared/views";

const getAsString = (val: string | string[]) => (Array.isArray(val) ? (val as string[]).join(", ") : typeof val === "string" ? val : JSON.stringify(val));

const DataNodePanel = ({ nodeType, nodeName, node }: DataNodeDetailsProps) => {

  const editPropertyValue = useCallback((evt: MouseEvent<HTMLDivElement>) => {
    const propertyName = evt.currentTarget.dataset.propertyName;
    postEditProperty(nodeType, nodeName, propertyName, propertyName && node[propertyName]);
  }, [nodeType, nodeName, node]);

  return (
    <div className="taipy-datanode-panel">
      <h2>
        {nodeType}: {nodeName}
      </h2>
      <div className="property-grid">
        {Object.entries(node).map(([k, n]) => (
          <Fragment key={k}>
            <div>{k}</div>
            <div>{getAsString(n)}</div>
            <div className="panel-button icon" data-property-name={k} title={l10n.t("edit")} onClick={editPropertyValue}>
              <i className="codicon codicon-edit"></i>
            </div>
          </Fragment>
        ))}
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
