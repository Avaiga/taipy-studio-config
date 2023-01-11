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

import { NoDetailsProps } from "../../../shared/views";
import Button from "./Button";

const NoDetails = ({ message }: NoDetailsProps) => {
  return (
    <div className="taipy-panel">
      <div className="icon">
        <i className="codicon codicon-clippy"></i> clippy
      </div>
      <div>
        <span className="taipy-panel-info">{message}</span>
      </div>
      <Button></Button>
      <div className="icon" draggable>
        <i className="codicon codicon-note"></i> note
      </div>
    </div>
  );
};

export default NoDetails;
