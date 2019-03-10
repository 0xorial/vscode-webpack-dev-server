import * as vscode from "vscode";
import { WdsWrapper, startWds, TreeViewItem } from "./WdsWrapper";
import { TreeDataProviderProxy } from "./TreeDataProviderProxy";
import { asThenable } from "./async";

export const dummySubscription: vscode.Disposable = { dispose() {} };

export function activate(context: vscode.ExtensionContext) {
    let wds: WdsWrapper | undefined;

    function autoDispose<T extends vscode.Disposable>(t: T) {
        context.subscriptions.push(t);
        return t;
    }

    const outputChannel = autoDispose(
        vscode.window.createOutputChannel("Webpack")
    );

    const dataProxy = new TreeDataProviderProxy<TreeViewItem>();

    autoDispose(
        vscode.window.registerTreeDataProvider("vscode-wds.errors", dataProxy)
    );

    const treeView = autoDispose(
        vscode.window.createTreeView<TreeViewItem>("vscode-wds.errors", {
            treeDataProvider: dataProxy
        })
    );

    autoDispose(
        vscode.commands.registerCommand("vscode-wds.startDevServer", () => {
            if (wds) {
                vscode.window.showErrorMessage("Already running.");
            }

            const rootPath = vscode.workspace.rootPath;
            if (rootPath === undefined) {
                vscode.window.showInformationMessage(
                    "Cannot locate workspace root. It is needed to resolve webpack-dev-server location."
                );
                return;
            }

            return vscode.window.withProgress(
                {
                    location: vscode.ProgressLocation.Window,
                    title: "Starting webpack-dev-server..."
                },
                () => {
                    return new Promise((resolve, reject) => {
                        wds = startWds(
                            rootPath,
                            outputChannel,
                            dataProxy,
                            err => {
                                if (err) {
                                    vscode.window.showErrorMessage(
                                        "Could not start webpack-dev-server. See output window for details."
                                    );
                                    reject(err);
                                } else {
                                    resolve();
                                }
                            }
                        );
                    });
                }
            );
        })
    );

    autoDispose(
        vscode.commands.registerCommand("vscode-wds.stopDevServer", () => {
            if (!wds) {
                vscode.window.showInformationMessage("Not running");
                return;
            }

            const localWds = wds;
            return vscode.window.withProgress(
                {
                    location: vscode.ProgressLocation.Window,
                    title: "Stopping webpack-dev-server..."
                },
                () => {
                    return localWds.stop().then(() => (wds = undefined));
                }
            );
        })
    );

    autoDispose(
        vscode.commands.registerCommand("vscode-wds.revealOutput", () => {
            asThenable(dataProxy.getChildren(undefined)).then(items => {
                if (items && items.length > 0) {
                    treeView.reveal(items[0]);
                }
            });
        })
    );

    autoDispose(
        vscode.workspace.onDidSaveTextDocument(e => {
            if (wds && e.fileName === wds.configPath()) {
                vscode.window.showInformationMessage(
                    "Detected webpack config file change. Restarting WDS."
                );
                vscode.commands
                    .executeCommand("vscode-wds.stopDevServer")
                    .then(() => {
                        vscode.commands.executeCommand(
                            "vscode-wds.startDevServer"
                        );
                    });
            }
        })
    );
}

// this method is called when your extension is deactivated
export function deactivate() {}
