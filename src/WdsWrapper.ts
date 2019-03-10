import * as vscode from "vscode";
import { readConfiguration } from "./ConfigurationHelper";
import { requireLocalPkg } from "./requireHelpers";
import * as path from "path";
import * as webpack from "webpack";
import { SimpleTreeDataProvider } from "./SimpleTreeDataProvider";

export interface TreeViewProxy {
    setTarget(t: vscode.TreeDataProvider<TreeViewItem> | undefined): void;
}

export interface WdsWrapper {
    configPath: () => string | undefined;
    stop: () => Promise<void>;
}

export interface DevServer {
    listen(port: number, host: string, cb: (err: any) => void): void;
    close(cb: () => void): void;
}

export interface TreeViewItem {
    children?: TreeViewItem[] | undefined;
    item: vscode.TreeItem;
}

function formatFilePath(filePath: string) {
    const OPTIONS_REGEXP = /^(\s|\S)*!/;
    return filePath.includes("!")
        ? `${filePath.replace(OPTIONS_REGEXP, "")} (${filePath})`
        : `${filePath}`;
}

type ErrorInfo = {
    file: string;
    line?: number;
    character?: number;
    message: string;
};

function extractErrorInfo(e: any, requestShortener: any): ErrorInfo {
    let file = "unknown";
    let message = "unknown";
    let line;
    let character;

    // 'fork-ts-checker' format

    if (typeof e.file === "string") {
        file = e.file;
    }

    if (typeof e.rawMessage === "string") {
        message = e.rawMessage;
    }

    if (typeof e.location === "object") {
        line = e.location.line;
        character = e.location.character;
    }

    // 'webpack.ModuleBuildError' format

    if (typeof e.error === "object" && typeof e.error.loc === "object") {
        line = e.error.loc.line;
        character = e.error.loc.column;
        message = e.error.message;
    }

    if (e.module) {
        file = e.module.resource;
        if (
            typeof file === "string" &&
            typeof message === "string" &&
            message.startsWith(file)
        ) {
            message = message.substring(file.length);
        }
    }

    if (line !== undefined) {
        line--;
    }
    if (character !== undefined) {
        character--;
    }
    return { file, message, line, character };
}

function makeDevServer(
    rootPath: string,
    treeViewProxy: TreeViewProxy,
    reporter: (text: string, color?: vscode.ThemeColor) => void
): { server: DevServer; configPath: string } {
    const { configFileName, host, port } = readConfiguration();
    const devServer = requireLocalPkg(rootPath, "webpack-dev-server");
    const webpack = requireLocalPkg(rootPath, "webpack");
    const configPath = path.join(rootPath, configFileName);
    reporter(`Opening file ${configPath}...`);

    delete require.cache[configPath];
    const webpackConfig = require(configPath);

    const options = {
        clientLogLevel: "info",
        contentBase: "./static",
        filename: "[name].js",
        host,
        hot: true,
        hotOnly: undefined,
        port,
        publicPath: "/"
    };
    devServer.addDevServerEntrypoints(webpackConfig, options);
    const compiler = webpack(webpackConfig) as webpack.Compiler;

    const treeView = new SimpleTreeDataProvider<TreeViewItem>();
    treeViewProxy.setTarget(treeView);

    compiler.hooks.watchRun.tap("vscode-wds", () => {
        reporter("Compiling...");
        treeView.clear();
        treeView.fireChange(null);
    });

    compiler.hooks.done.tap("vscode-wds", (stats: webpack.Stats) => {
        const str = stats.toString();
        reporter(str);

        const errorInfos = stats.compilation.errors.map(x =>
            extractErrorInfo(x, stats.compilation.requestShortener)
        );
        const map = new Map<string, ErrorInfo[]>();

        for (const e of errorInfos) {
            let errors = map.get(e.file);
            if (errors === undefined) {
                errors = [];
                map.set(e.file, errors);
            }
            errors.push(e);
        }

        for (const e of Array.from(map)) {
            const [key, value] = e;
            const item: TreeViewItem = {
                item: {
                    label: path.basename(key),
                    tooltip: key,
                    collapsibleState: vscode.TreeItemCollapsibleState.Expanded
                }
            };
            const children = value.map(m => {
                const options: vscode.TextDocumentShowOptions | undefined =
                    m.line !== undefined
                        ? {
                              selection: new vscode.Range(
                                  m.line,
                                  m.character || 0,
                                  m.line,
                                  m.character || 0
                              )
                          }
                        : undefined;
                return {
                    item: {
                        label: `(${m.line}, ${m.character}):`,
                        description: m.message,
                        tooltip: m.message,
                        command: {
                            title: "open",
                            command: "vscode.open",
                            arguments: [vscode.Uri.file(m.file), options]
                        }
                    },
                    parent: item
                };
            });
            item.children = children;
            treeView.addItem(item);
        }

        treeView.fireChange(null);

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

    const server = new devServer(compiler, options) as DevServer;
    return { server, configPath };
}

function startWdsImpl(
    rootPath: string,
    outputChannel: vscode.OutputChannel,
    treeView: TreeViewProxy,
    resolve: (wds: WdsWrapper) => void,
    reject: (error: any) => void
) {
    const statusBarItem = vscode.window.createStatusBarItem(
        vscode.StatusBarAlignment.Left
    );
    statusBarItem.show();
    statusBarItem.command = "vscode-wds.revealOutput";

    const { host, port } = readConfiguration();

    try {
        process.chdir(rootPath);

        const devServerInstance = makeDevServer(rootPath, treeView, (t, c) => {
            outputChannel.appendLine(t);
            statusBarItem.text = t;
            if (c !== undefined) {
                statusBarItem.color = c;
            }
        });

        outputChannel.appendLine("about to listen...");

        devServerInstance.server.listen(port, host, (err: any) => {
            if (err) {
                outputChannel.appendLine("listen error!");
                reject(err);
                throw err;
            }
            outputChannel.appendLine("listening!");
            let stoppingPromise: Promise<void> | undefined;
            resolve({
                configPath: () => devServerInstance.configPath,
                stop: () => {
                    if (stoppingPromise !== undefined) {
                        return stoppingPromise;
                    }
                    const result = new Promise<void>(resolve => {
                        releaseThread(() => {
                            devServerInstance.server.close(() => {
                                statusBarItem.hide();
                                statusBarItem.dispose();
                                outputChannel.appendLine("Stopped WDS.");
                                statusBarItem.dispose();
                                resolve();
                            });
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
}

function releaseThread(cb: () => void) {
    setTimeout(() => {
        cb();
    }, 0);
}

function makeWdsStartingPromise(
    rootPath: string,
    outputChannel: vscode.OutputChannel,
    treeView: TreeViewProxy
) {
    return new Promise<WdsWrapper>((resolve, reject) => {
        releaseThread(() => {
            startWdsImpl(rootPath, outputChannel, treeView, resolve, reject);
        });
    });
}

export function startWds(
    rootPath: string,
    outputChannel: vscode.OutputChannel,
    treeView: TreeViewProxy,
    startedCb: (err: any) => void
): WdsWrapper {
    let stopPromise: Promise<void> | undefined;
    const startingPromise = makeWdsStartingPromise(
        rootPath,
        outputChannel,
        treeView
    );
    let wdsWrapper: WdsWrapper | undefined;

    startingPromise
        .then(wds => {
            startedCb(undefined);
            wdsWrapper = wds;
        })
        .catch(e => startedCb(e));

    return {
        configPath: () => (wdsWrapper ? wdsWrapper.configPath() : undefined),
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
