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

import { DataNode, Sequence, Scenario, Task } from "../../../shared/names";
import { perspectiveRootId } from "../../../shared/views";

const nodeColor: Record<string, string> = {
  [DataNode]: "var(--taipy-datanode-color)",
  [Task]: "var(--taipy-task-color)",
  [Sequence]: "var(--taipy-sequence-color)",
  [Scenario]: "var(--taipy-scenario-color)",
};
export const getNodeColor = (nodeType: string) => nodeColor[nodeType] || "pink";

const nodeIcon: Record<string, string> = {
  [DataNode]: window.taipyConfig?.icons?.datanode,
  [Task]: window.taipyConfig?.icons?.task,
  [Sequence]: window.taipyConfig?.icons?.sequence,
  [Scenario]: window.taipyConfig?.icons?.scenario,
};
export const getNodeIcon = (nodeType: string) => nodeIcon[nodeType];

export const nodeTypes = [DataNode, Scenario, Task];

export const isRoot = (perspId: string) => perspId === perspectiveRootId;

