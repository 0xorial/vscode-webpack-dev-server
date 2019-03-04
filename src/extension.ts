import * as vscode from "vscode";
import { requireLocalPkg } from "./requireHelpers";
import * as path from "path";
import { outputChannel } from "./outputChannel";
import * as webpack from "webpack";

export function activate(context: vscode.ExtensionContext) {
    let devServerInstance: any;
    let isTransitioning = false;
    let statusBarItem = vscode.window.createStatusBarItem(
        vscode.StatusBarAlignment.Left
    );

    function startWds(rootPath: string, cb: () => void) {
        outputChannel.show(true);
        isTransitioning = true;

        const devServer = requireLocalPkg(rootPath, "webpack-dev-server");
        const webpack = requireLocalPkg(rootPath, "webpack");
        const configPath = path.join(rootPath, "webpack.dev.config.js");
        outputChannel.appendLine(`Opening file ${configPath}...`);
        const config = require(configPath);
        const compiler = webpack(config) as webpack.Compiler;

        statusBarItem.show();

        // let p;
        compiler.hooks.watchRun.tap("vscode-wds", () => {
            statusBarItem.text = `Compiling...`;
            outputChannel.appendLine("Compiling...");

        });

        compiler.hooks.done.tap("vscode-wds", (stats: webpack.Stats) => {
            const str = stats.toString();
            outputChannel.appendLine(str);
            if (stats.compilation.errors.length !== 0) {
                statusBarItem.text = `${
                    stats.compilation.errors.length
                } errors`;
                statusBarItem.color = new vscode.ThemeColor("errorForeground");
            } else {
                statusBarItem.text = `${
                    stats.compilation.errors.length
                } errors`;
                statusBarItem.color = new vscode.ThemeColor("foreground");
            }
        });



        devServerInstance = new devServer(compiler);
        outputChannel.appendLine("about to listen...");

        devServerInstance.listen(8080, "localhost", (err: any) => {
            cb();
            if (err) {
                outputChannel.appendLine("listen error!");
                throw err;
            }
            outputChannel.appendLine("listening!");
            isTransitioning = false;
        });
    }

    const initCommand = vscode.commands.registerCommand(
        "vscode-wds.startDevServer",
        () => {
            if (isTransitioning) {
                vscode.window.showInformationMessage(
                    "Still doing something..."
                );
                outputChannel.show();
                return;
            }

            if (devServerInstance) {
                vscode.window.showInformationMessage("Already running");
                outputChannel.show();
                return;
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
                    return new Promise(resolve => {
                        startWds(rootPath, resolve);
                    });
                }
            );
        }
    );

    const disposeCommand = vscode.commands.registerCommand(
        "vscode-wds.stopDevServer",
        () => {
            if (isTransitioning) {
                vscode.window.showInformationMessage(
                    "Still doing something..."
                );
                outputChannel.show();
                return;
            }

            if (!devServerInstance) {
                vscode.window.showInformationMessage("Not running");
                return;
            }
            isTransitioning = true;

            vscode.window.withProgress(
                {
                    location: vscode.ProgressLocation.Window,
                    title: "Stopping webpack-dev-server..."
                },
                () => {
                    return new Promise(resolve => {
                        devServerInstance.close(() => {
                            devServerInstance = undefined;
                            isTransitioning = false;
                            statusBarItem.hide();
                            outputChannel.appendLine("Stopped WDS.");
                            resolve();
                        });
                    });
                }
            );
        }
    );

    context.subscriptions.push(initCommand);
    context.subscriptions.push(disposeCommand);
}

// this method is called when your extension is deactivated
export function deactivate() {}
