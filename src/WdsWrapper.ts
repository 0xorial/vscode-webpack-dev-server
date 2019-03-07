import * as vscode from "vscode";
import { readConfiguration } from "./ConfigurationHelper";
import { requireLocalPkg } from "./requireHelpers";
import * as path from "path";
import * as webpack from "webpack";

export interface WdsWrapper {
    stop: () => Promise<void>;
}

export interface DevServer {
    listen(port: number, host: string, cb: (err: any) => void): void;
    close(cb: () => void): void;
}

function makeDevServer(
    rootPath: string,
    configFileName: string,
    reporter: (text: string, color?: vscode.ThemeColor) => void
): DevServer {
    const devServer = requireLocalPkg(rootPath, "webpack-dev-server");
    const webpack = requireLocalPkg(rootPath, "webpack");
    const configPath = path.join(rootPath, configFileName);
    reporter(`Opening file ${configPath}...`);
    delete require.cache[configPath];
    const webpackConfig = require(configPath);
    const compiler = webpack(webpackConfig) as webpack.Compiler;

    compiler.hooks.watchRun.tap("vscode-wds", () => {
        reporter("Compiling...");
    });

    compiler.hooks.done.tap("vscode-wds", (stats: webpack.Stats) => {
        const str = stats.toString();
        reporter(str);
        if (stats.compilation.errors.length !== 0) {
            reporter(
                `${stats.compilation.errors.length} errors`,
                new vscode.ThemeColor("errorForeground")
            );
        } else {
            reporter(
                `${stats.compilation.errors.length} errors`,
                new vscode.ThemeColor("foreground")
            );
        }
    });

    return new devServer(compiler);
}

function startWdsAsync(rootPath: string, outputChannel: vscode.OutputChannel) {
    return new Promise<WdsWrapper>((resolve, reject) => {
        outputChannel.show(true);
        const statusBarItem = vscode.window.createStatusBarItem(
            vscode.StatusBarAlignment.Left
        );
        statusBarItem.command = "vscode-wds.revealOutput";
        statusBarItem.show();

        const { configFileName, host, port } = readConfiguration();

        try {
            const devServerInstance = makeDevServer(
                rootPath,
                configFileName,
                (t, c) => {
                    outputChannel.appendLine(t);
                    statusBarItem.text = t;
                    if (c !== undefined) {
                        statusBarItem.color = c;
                    }
                }
            );

            outputChannel.appendLine("about to listen...");

            devServerInstance.listen(port, host, (err: any) => {
                if (err) {
                    outputChannel.appendLine("listen error!");
                    reject(err);
                    throw err;
                }
                outputChannel.appendLine("listening!");
                let stoppingPromise: Promise<void> | undefined;
                resolve({
                    stop: () => {
                        if (stoppingPromise !== undefined) {
                            return stoppingPromise;
                        }
                        const result = new Promise<void>(resolve => {
                            devServerInstance.close(() => {
                                statusBarItem.hide();
                                statusBarItem.dispose();
                                outputChannel.appendLine("Stopped WDS.");
                                resolve();
                            });
                        });
                        stoppingPromise = result;
                        return result;
                    }
                });
            });
        } catch (e) {
            outputChannel.appendLine(JSON.stringify(e));
            reject(e);
        }
    });
}

export function startWds(
    rootPath: string,
    outputChannel: vscode.OutputChannel,
    startedCb: (err: any) => void
): WdsWrapper {
    let stopPromise: Promise<void> | undefined;
    const startingPromise = startWdsAsync(rootPath, outputChannel);

    startingPromise.then(() => startedCb(undefined)).catch(e => startedCb(e));

    return {
        stop: () => {
            if (stopPromise) {
                return stopPromise;
            }
            stopPromise = new Promise(resolve => {
                startingPromise.then(wds => {
                    wds.stop().then(() => resolve());
                });
            });
            return stopPromise;
        }
    };
}
