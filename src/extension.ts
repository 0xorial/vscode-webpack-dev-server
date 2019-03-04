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
    statusBarItem.command = "vscode-wds.revealOutput";

    function startWds(rootPath: string, cb: (err: Error | undefined) => void) {
        outputChannel.show(true);
        isTransitioning = true;

        try {
            const config = vscode.workspace.getConfiguration("vscode-wds");
            const port = config.get<number>("port") || "8080";
            const host = config.get<string>("host") || "localhost";
            const configFileName =
                config.get<string>("configFileName") || "webpack.config.js";

            const devServer = requireLocalPkg(rootPath, "webpack-dev-server");
            const webpack = requireLocalPkg(rootPath, "webpack");
            const configPath = path.join(rootPath, configFileName);
            outputChannel.appendLine(`Opening file ${configPath}...`);
            const webpackConfig = require(configPath);
            const compiler = webpack(webpackConfig) as webpack.Compiler;

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
                    statusBarItem.color = new vscode.ThemeColor(
                        "errorForeground"
                    );
                } else {
                    statusBarItem.text = `${
                        stats.compilation.errors.length
                    } errors`;
                    statusBarItem.color = new vscode.ThemeColor("foreground");
                }
            });

            devServerInstance = new devServer(compiler);
            outputChannel.appendLine("about to listen...");

            devServerInstance.listen(port, host, (err: any) => {
                cb(err);
                if (err) {
                    outputChannel.appendLine("listen error!");
                    throw err;
                }
                outputChannel.appendLine("listening!");
                isTransitioning = false;
            });
        } catch (e) {
            outputChannel.appendLine(JSON.stringify(e));
            isTransitioning = false;
            cb(e);
        }
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
                    return new Promise((resolve, reject) => {
                        startWds(rootPath, err => {
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

    const revealCommand = vscode.commands.registerCommand(
        "vscode-wds.revealOutput",
        () => {
            outputChannel.show(true);
        }
    );

    context.subscriptions.push(initCommand);
    context.subscriptions.push(disposeCommand);
    context.subscriptions.push(revealCommand);
}

// this method is called when your extension is deactivated
export function deactivate() {}
