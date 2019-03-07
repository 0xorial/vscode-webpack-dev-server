import * as vscode from "vscode";
import { WdsWrapper, startWds } from "./WdsWrapper";

export function activate(context: vscode.ExtensionContext) {
    let wds: WdsWrapper | undefined;

    function autoDispose<T extends vscode.Disposable>(t: T) {
        context.subscriptions.push(t);
        return t;
    }

    const outputChannel = autoDispose(
        vscode.window.createOutputChannel("Webpack")
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

            vscode.window.withProgress(
                {
                    location: vscode.ProgressLocation.Window,
                    title: "Starting webpack-dev-server..."
                },
                () => {
                    return new Promise((resolve, reject) => {
                        wds = startWds(rootPath, outputChannel, err => {
                            if (err) {
                                vscode.window.showErrorMessage(
                                    "Could not start webpack-dev-server. See output window for details."
                                );
                                reject(err);
                            } else {
                                resolve();
                            }
                        });
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
            vscode.window.withProgress(
                {
                    location: vscode.ProgressLocation.Window,
                    title: "Stopping webpack-dev-server..."
                },
                () => {
                    return localWds.stop();
                }
            );
        })
    );

    autoDispose(
        vscode.commands.registerCommand("vscode-wds.revealOutput", () => {
            outputChannel.show(true);
        })
    );
}

// this method is called when your extension is deactivated
export function deactivate() {}
