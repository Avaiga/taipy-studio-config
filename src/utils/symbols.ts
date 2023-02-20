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

import { DocumentSymbol, SymbolKind, TextDocument, workspace } from "vscode";

import { DisplayModel, Link, LinkName, Nodes, Positions } from "../../shared/diagram";
import { DataNode, Pipeline, Scenario, Task } from "../../shared/names";
import { getChildType } from "../../shared/childtype";
import { TAIPY_STUDIO_SETTINGS_NAME } from "./constants";

const TASK_INPUTS = "inputs";
const TASK_OUTPUTS = "outputs";
const PIPELINE_TASKS = "tasks";
const SCENARIO_PIPELINES = "pipelines";

const descendantProperties: Record<string, [string, string]> = {
  [Scenario]: ["", SCENARIO_PIPELINES],
  [Pipeline]: ["", PIPELINE_TASKS],
  [Task]: [TASK_INPUTS, TASK_OUTPUTS],
};
export const getDescendantProperties = (nodeType: string) => descendantProperties[nodeType] || ["", ""];

const dropByTypes: Record<string, string[]> = {
  [DataNode]: [TASK_INPUTS, TASK_OUTPUTS],
  [Task]: [PIPELINE_TASKS],
  [Pipeline]: [SCENARIO_PIPELINES],
};
export const getPropertyToDropType = (nodeType: string) => dropByTypes[nodeType] || [];

const parentType: Record<string, string> = {
  [DataNode]: Task,
  [Task]: Pipeline,
  [Pipeline]: Scenario,
};
export const getParentType = (nodeType: string) => parentType[nodeType] || "";

export const getSymbol = (symbols: DocumentSymbol[], ...names: string[]): DocumentSymbol => {
  if (!symbols) {
    return undefined;
  }
  if (!names || names.length === 0) {
    return symbols[0];
  }
  return names.reduce((o, n) => o?.children?.find((s) => s.name === n), { children: symbols } as DocumentSymbol);
};

const supportedNodeTypes = {
  [DataNode.toLowerCase()]: true,
  [Task.toLowerCase()]: true,
  [Pipeline.toLowerCase()]: true,
  [Scenario.toLowerCase()]: true,
};
const ignoredNodeNames = {
  default: true,
};

export const getNodeFromSymbol = (doc: TextDocument, symbol: DocumentSymbol) => {
  const node = {};
  symbol && symbol.children.forEach((s) => (node[s.name] = s.kind === SymbolKind.Array ? getSymbolArrayValue(doc, s) : getSymbolValue(doc, s)));
  return node;
};

const EXTRACT_STRINGS_RE = /['"]\s*,\s*["']/s;
const EXTRACT_ARRAY_INNER_CONTENT = /^\s*\[\s*['"](.*)['"]\s*,?\s*\]\s*$/s;

export const getArrayFromText = (text: string) => {
  if (text.trim()) {
    const res = EXTRACT_ARRAY_INNER_CONTENT.exec(text);
    if (res?.length === 2) {
      return res[1].split(EXTRACT_STRINGS_RE).filter(v => v);
    }
  }
  return [];
};

export const getSymbolArrayValue = (doc: TextDocument, symbol: DocumentSymbol, prop?: string) => getSymbolValue(doc, symbol, prop) as string[] || [];

const getSymbolValue = <T>(doc: TextDocument, symbol: DocumentSymbol, prop?: string) => {
  const propSymbol = prop ? symbol?.children.find((s) => s.name === prop) : symbol;
  if (propSymbol) {
    if (propSymbol.kind === SymbolKind.Array) {
      return getArrayFromText(doc.getText(propSymbol.range));
    } else if (propSymbol.kind === SymbolKind.String) {
      return doc.getText(propSymbol.range).trim().slice(1, -1);
    } else {
      return doc.getText(propSymbol.range);
    }
  }
  return undefined;
};

export const toDisplayModel = (doc: TextDocument, symbols: DocumentSymbol[], positions?: Positions): DisplayModel => {
  const nodes = {} as Nodes;
  const links = [] as Link[];
  symbols.forEach((typeSymbol) => {
    if (!supportedNodeTypes[typeSymbol.name.toLowerCase()]) {
      return;
    }
    nodes[typeSymbol.name] = {};
    const [inputProp, outputProp] = getDescendantProperties(typeSymbol.name);
    const childType = getChildType(typeSymbol.name);
    typeSymbol.children.forEach((nameSymbol) => {
      if (ignoredNodeNames[nameSymbol.name.toLowerCase()]) {
        return;
      }
      nodes[typeSymbol.name][nameSymbol.name] = {};
      const nodeId = `${typeSymbol.name}.${nameSymbol.name}`;
      positions && positions[nodeId] && positions[nodeId].length && (nodes[typeSymbol.name][nameSymbol.name].position = positions[nodeId][0]);
      if (childType) {
        if (outputProp) {
          getSymbolArrayValue(doc, nameSymbol, outputProp).forEach((childName: string) =>
            links.push(getLink([typeSymbol.name, nameSymbol.name, childType, getUnsuffixedName(childName)] as LinkName, positions))
          );
        }
        if (inputProp) {
          getSymbolArrayValue(doc, nameSymbol, inputProp).forEach((childName: string) =>
            links.push(getLink([childType, getUnsuffixedName(childName), typeSymbol.name, nameSymbol.name] as LinkName, positions))
          );
        }
      }
    });
  });
  return { nodes, links };
};

const getLink = (linkName: LinkName, positions?: Positions) => {
  const linkId = ["LINK", ...linkName].join(".");
  return [linkName, { positions: positions && positions[linkId] ? positions[linkId] : [] }] as Link;
};

const defaultContents: Record<string, Record<string, string | string[]>> = {
  // eslint-disable-next-line @typescript-eslint/naming-convention
  [DataNode]: { storage_type: "", scope: "" },
  [Task]: { [TASK_INPUTS]: [], [TASK_OUTPUTS]: [], function: "", skippable: "" },
  [Pipeline]: { [PIPELINE_TASKS]: [] },
  [Scenario]: { [SCENARIO_PIPELINES]: [] },
};
export const getDefaultContent = (nodeType: string, nodeName: string) => ({ [nodeType]: { [nodeName]: defaultContents[nodeType] || {} } });

export const getUnsuffixedName = (name: string) => {
  const p = name.lastIndexOf(":");
  if (p === -1) {
    return name;
  }
  return name.substring(0, p);
};

export const getSectionName = (name: string, withSection?: boolean, sectionName = "SECTION") => {
  if (withSection === undefined) {
    withSection = workspace.getConfiguration(TAIPY_STUDIO_SETTINGS_NAME).get("editor.type.suffix.enabled", true);
  }
  name = getUnsuffixedName(name);
  return withSection ? name + ":" + sectionName : name;
};

export const getPythonSuffix = (isFunction: boolean) => (isFunction ? "function" : "class");

export const extractModule = (modSmb: string) => {
  if (modSmb) {
    const p = modSmb.lastIndexOf(".");
    if (p > -1) {
      return modSmb.substring(0, p);
    }
  }
  return "";
};