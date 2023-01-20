import { commands, DocumentSymbol, l10n, SymbolKind, Uri, window, workspace } from "vscode";


export const getMainPythonUri = async () => {
  const workspaceConfig = workspace.getConfiguration("taipyStudio.config", workspace.workspaceFolders[0]);
  const mainFile = workspaceConfig.get<string>("mainPythonFile");
  const mainUris = await workspace.findFiles(mainFile, null, 1);
  let mainUri = mainUris.length ? mainUris[0] : undefined;
  if (!mainUri) {
    const pyFiles = await workspace.findFiles("*.py", null, 1);
    mainUri = pyFiles.length ? pyFiles[0] : undefined;
    if (mainUri) {
      workspaceConfig.update("mainPythonFile", workspace.asRelativePath(mainUri));
      window.showInformationMessage(l10n.t("Main module file has been set up as {0} in Workspace settings", workspace.asRelativePath(mainUri)));
    } else {
      console.warn("No symbol detection as there is no python file in workspace.");
    }
  }
  return mainUri || null;
};

export const getCreateFunctionOrClassLabel = (isFunction: boolean) => isFunction ? l10n.t("Create a new function") : l10n.t("Create a new class");

export const getModulesAndSymbols = async (isFunction: boolean): Promise<[string[], Record<string, string>]> => {
  const pythonUris = await workspace.findFiles("**/*.py");
  const mainUri = await getMainPythonUri();
  const symbolsByUri = await Promise.all(
    pythonUris.map(
      (uri) =>
        new Promise<{ uri: Uri; symbols: DocumentSymbol[] }>((resolve, reject) => {
          commands.executeCommand("vscode.executeDocumentSymbolProvider", uri).then((symbols: DocumentSymbol[]) => resolve({ uri, symbols }), reject);
        })
    )
  );
  const symbolsWithModule = [] as string[];
  const modulesByUri = pythonUris.reduce((pv, uri) => {
    const uriStr = uri.path;
    if (uriStr === mainUri?.path) {
      pv[uriStr] = "__main__";
    } else {
      const paths = workspace.asRelativePath(uri).split("/");
      const file = paths.at(-1);
      paths.pop();
      const fileMod = `${file.split(".", 2)[0]}`;
      const module = paths.length ? `${paths.join(".")}.${fileMod}` : fileMod;
      pv[uriStr] = module;
    }
    return pv;
  }, {} as Record<string, string>);
  symbolsByUri.forEach((su) => {
    Array.isArray(su.symbols) && su.symbols.forEach((symbol) => {
      if ((isFunction && symbol.kind === SymbolKind.Function) || (!isFunction && symbol.kind === SymbolKind.Class)) {
        symbolsWithModule.push(`${modulesByUri[su.uri.path]}.${symbol.name}`);
      }
    });
  });
  return [symbolsWithModule, modulesByUri];
};