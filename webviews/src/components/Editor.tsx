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

import { MouseEvent, useEffect, useRef } from "react";
import { CanvasWidget } from "@projectstorm/react-canvas-core";
import DomToImage from "dom-to-image-more";
import * as deepEqual from "fast-deep-equal";
import * as l10n from "@vscode/l10n";

import { ConfigEditorProps, perspectiveRootId } from "../../../shared/views";
import { postGetNodeName, postSaveAsPngUrl, postRefreshMessage, postSaveMessage, postSetExtraEntities } from "../utils/messaging";
import { applyPerspective, getNodeTypes } from "../utils/nodes";
import { EditorAddNodeMessage } from "../../../shared/messages";
import { getNodeIcon } from "../utils/config";
import { diagramListener, initDiagram, populateModel, relayoutDiagram, setBaseUri, showNode } from "../utils/diagram";
import { TaipyDiagramModel } from "../projectstorm/models";
import { applySmallChanges } from "../utils/smallModelChanges";
import { DisplayModel } from "../../../shared/diagram";

const [engine, dagreEngine] = initDiagram();

const relayout = () => relayoutDiagram(engine, dagreEngine);

const onCreateNode = (evt: MouseEvent<HTMLDivElement>) => {
  const nodeType = evt.currentTarget.dataset.nodeType;
  nodeType && postGetNodeName(nodeType);
};

const filter4Print = (node: Node) => node.nodeName !== "DIV" || !(node as HTMLDivElement).dataset.printIgnore;

const saveAsPng = () => DomToImage.toPng(document.body, { filter: filter4Print }).then(postSaveAsPngUrl).catch(console.warn);

const zoomToFit = () => engine.zoomToFit();

const Editor = ({ displayModel: propsDisplayModel, perspectiveId, baseUri, extraEntities: propsExtraEntities, isDirty }: ConfigEditorProps) => {
  const oldDisplayModel = useRef<DisplayModel>();
  const oldPerspId = useRef<string>();

  setBaseUri(engine, baseUri);

  const [displayModel, extraEntities] = applyPerspective(propsDisplayModel, perspectiveId, propsExtraEntities);

  useEffect(() => {
    propsExtraEntities && extraEntities && extraEntities !== propsExtraEntities && postSetExtraEntities(extraEntities);
  }, [propsExtraEntities, extraEntities]);

  useEffect(() => {
    // Manage Post Message reception
    const messageListener = (event: MessageEvent) => {
      event.data?.editorMessage && showNode(engine, event.data as EditorAddNodeMessage);
    };
    window.addEventListener("message", messageListener);
    return () => window.removeEventListener("message", messageListener);
  }, []);

  useEffect(() => {
    if (!displayModel || (perspectiveId === oldPerspId.current && deepEqual(displayModel.current, displayModel))) {
      return;
    }
    if (perspectiveId === oldPerspId.current && applySmallChanges(engine.getModel(), displayModel, oldDisplayModel.current)) {
      oldDisplayModel.current = displayModel;
      return;
    }

    oldDisplayModel.current = displayModel;
    oldPerspId.current = perspectiveId;

    // clear model
    const model = new TaipyDiagramModel();
    // populate model
    const needsPositions = populateModel(displayModel, model);
    // add listener to Model
    model.registerListener(diagramListener);

    if (needsPositions) {
      setTimeout(relayout, 500);
    }
    engine.setModel(model);
  }, [displayModel, baseUri]);

  return (
    <div className="diagram-root">
      <div className="diagram-icon-group" data-print-ignore>
        <div className="diagram-button icon" title={l10n.t("Re-layout")} onClick={relayout}>
          <i className="taipy-icon-relayout"></i>
        </div>
        <div className="diagram-button icon" title={l10n.t("Refresh")} onClick={postRefreshMessage}>
          <i className="codicon codicon-refresh"></i>
        </div>
        {perspectiveId !== perspectiveRootId ? (
          <div className="diagram-button icon" title={isDirty ? l10n.t("Save") : l10n.t("File saved")} {...(isDirty ? { onClick: postSaveMessage } : {})}>
            <i className={"codicon codicon-" + (isDirty ? "circle-filled" : "circle-outline")}></i>
          </div>
        ) : null}
        <div className="diagram-button icon" title={l10n.t("Save as PNG")} onClick={saveAsPng}>
          <i className="codicon codicon-save-as"></i>
        </div>
        <div className="diagram-button icon" title={l10n.t("Zoom to fit")} onClick={zoomToFit}>
          <i className="codicon codicon-zap"></i>
        </div>
      </div>
      <div>{perspectiveId !== perspectiveRootId ? <h2>{perspectiveId}</h2> : ""}</div>
      <div className="diagram-icon-group" data-print-ignore>
        {getNodeTypes(perspectiveId).map((nodeType) => (
          <div className={"diagram-button icon " + nodeType.toLowerCase()} title={l10n.t("Add {0}", nodeType)} key={nodeType} data-node-type={nodeType} onClick={onCreateNode}>
            <i className={getNodeIcon(nodeType) + "-add"}></i>
          </div>
        ))}
      </div>
      <div className="diagram-widget">
        <CanvasWidget engine={engine} />
      </div>
    </div>
  );
};

export default Editor;
