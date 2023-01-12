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

import { DisplayModel } from "./diagram";

export const NoDetailsId = "NoDetails";
export interface NoDetailsProps {
  message: string;
}

export const DataNodeDetailsId = "DataNodeDetails";
export interface DataNodeDetailsProps {
  nodeType: string;
  nodeName: string;
  node: Record<string, string | string[]>;
}

export const ConfigEditorId = "ConfigEditor";

export interface ConfigEditorProps {
  displayModel: DisplayModel;
  perspectiveId: string;
  baseUri: string;
  extraEntities?: string;
  isDirty?: boolean;
}

export const perspectiveRootId = "__root__";

export const webviewsLibraryDir = "webviews";
export const webviewsLibraryName = "taipy-webviews.js";
export const containerId = "taipy-web-root";
