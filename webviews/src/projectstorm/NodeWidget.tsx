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

import { useCallback } from "react";
import { DiagramEngine } from "@projectstorm/react-diagrams-core";
import styled from "@emotion/styled";
import { DefaultNodeModel, DefaultPortModel, PortWidget } from "@projectstorm/react-diagrams";

import { IN_PORT_NAME, getNodeContext } from "../utils/diagram";
import { getNodeIcon } from "../utils/config";

namespace S {
  export const Node = styled.div<{ background?: string; selected?: boolean }>`
    background-color: ${(p) => p.background};
    border-radius: 5px;
    color: white;
    border: solid 2px black;
    overflow: visible;
    border: solid 2px ${(p) => (p.selected ? "rgb(0,192,255)" : "black")};
  `;

  export const Title = styled.div`
    background: rgba(0, 0, 0, 0.3);
    display: flex;
    white-space: nowrap;
    justify-items: center;
  `;

  export const TitleName = styled.div`
    flex-grow: 1;
    padding: 5px 5px;
  `;

  export const SubTitleName = styled.span`
    font-size: smaller;
    padding-left: 0.7em;
  `;

  export const TitleIcon = styled.div`
    padding: 5px 0 5px 5px;
  `;

  export const Ports = styled.div`
    display: flex;
    background-image: linear-gradient(rgba(0, 0, 0, 0.1), rgba(0, 0, 0, 0.2));
  `;

  export const PortsContainer = styled.div`
    flex-grow: 1;
    display: flex;
    flex-direction: column;
  `;

  export const OutPortLabel = styled.div`
    display: flex;
    align-items: end;
    justify-content: end;
    & svg {
      display: block;
    }
    & i:hover {
      background: rgb(192, 255, 0);
    }
  `;

  export const InPortLabel = styled.div`
    display: flex;
    align-items: end;
    & svg {
      display: block;
    }
    & i:hover {
      background: rgb(192, 255, 0);
    }
  `;
}

interface NodeProps {
  node: DefaultNodeModel;
  engine: DiagramEngine;
  baseUri: string;
}

const NodeWidget = ({ node, baseUri, engine }: NodeProps) => {
  const generatePort = useCallback(
    (port: DefaultPortModel) =>
      port.getName() === IN_PORT_NAME ? (
        <S.InPortLabel>
          <PortWidget engine={engine} port={port} key={port.getID()}>
            <i className="taipy-icon-input"></i>
          </PortWidget>
        </S.InPortLabel>
      ) : (
        <S.OutPortLabel>
          <PortWidget engine={engine} port={port} key={port.getID()}>
            <i className="taipy-icon-output"></i>
          </PortWidget>
        </S.OutPortLabel>
      ),
    [engine]
  );

  return (
    <S.Node
      data-default-node-name={node.getOptions().name}
      data-vscode-context={getNodeContext(node, baseUri)}
      selected={node.isSelected()}
      background={node.getOptions().color}
    >
      <S.Title>
        <S.TitleIcon className="icon" title={node.getType()}>
          <i className={getNodeIcon(node.getType())}></i>
        </S.TitleIcon>
        <S.TitleName>{node.getOptions().name}</S.TitleName>
      </S.Title>
      <S.Ports>
        <S.PortsContainer>{node.getInPorts().map(generatePort)}</S.PortsContainer>
        <S.PortsContainer>{node.getOutPorts().map(generatePort)}</S.PortsContainer>
      </S.Ports>
    </S.Node>
  );
};

export default NodeWidget;
