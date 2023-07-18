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

import { AbstractReactFactory, GenerateModelEvent, GenerateWidgetEvent, AbstractModelFactory } from "@projectstorm/react-canvas-core";
import { DiagramEngine } from "@projectstorm/react-diagrams-core";
import { DefaultNodeModel } from "@projectstorm/react-diagrams";
import { TaipyPortModel } from "./models";
import NodeWidget from "./NodeWidget";

export class TaipyNodeFactory extends AbstractReactFactory<DefaultNodeModel, DiagramEngine> {
  private perspective: string;
  constructor(nodeType: string) {
    super(nodeType);
    this.perspective = "";
  }

  setSettings(perspective: string) {
    this.perspective = perspective;
  }

  generateReactWidget(event: GenerateWidgetEvent<DefaultNodeModel>): JSX.Element {
    return <NodeWidget engine={this.engine} node={event.model} perspective={this.perspective} />;
  }

  generateModel(_: GenerateModelEvent): DefaultNodeModel {
    return new DefaultNodeModel();
  }
}

export class TaipyPortFactory extends AbstractModelFactory<TaipyPortModel, DiagramEngine> {
  constructor() {
    super("taipy-port");
  }

  generateModel(_: GenerateModelEvent): TaipyPortModel {
    return new TaipyPortModel({ type: "taipy-port", name: "fred" });
  }
}
