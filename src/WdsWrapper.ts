import * as vscode from "vscode";
import { readConfiguration } from "./ConfigurationHelper";
import { requireLocalPkg } from "./requireHelpers";
import * as path from "path";
import * as webpack from "webpack";
import { SimpleTreeDataProvider } from "./TreeDataProviderProxy";
import { formatLocation } from "./formatLocation";

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
    children: TreeViewItem[];
    item: vscode.TreeItem;
}

function formatFilePath(filePath: string) {
    const OPTIONS_REGEXP = /^(\s|\S)*!/;
    return filePath.includes("!")
        ? `${filePath.replace(OPTIONS_REGEXP, "")} (${filePath})`
        : `${filePath}`;
}

function extractErorrInfo(e: any): { file: string; message: string } {
    let file;
    let message;
    if (typeof e.file === "string") {
        file = e.file;
    } else {
        file = "unknonw";
    }

    if (typeof e.rawMessage === "string") {
        message = e.rawMessage;
    } else {
        message = "unknown";
    }

    return { file, message };
}

function formatError(
    e: any,
    requestShortener: any,
    showErrorDetails = true,
    showModuleTrace = true
) {
    let text = "";
    if (typeof e === "string") {
        e = { message: e };
    }
    if (e.chunk) {
        text += `chunk ${e.chunk.name || e.chunk.id}${
            e.chunk.hasRuntime()
                ? " [entry]"
                : e.chunk.canBeInitial()
                ? " [initial]"
                : ""
        }\n`;
    }
    if (e.file) {
        text += `${e.file}\n`;
    }
    if (
        e.module &&
        e.module.readableIdentifier &&
        typeof e.module.readableIdentifier === "function"
    ) {
        text += formatFilePath(e.module.readableIdentifier(requestShortener));
        if (typeof e.loc === "object") {
            const locInfo = formatLocation(e.loc);
            if (locInfo) {
                text += ` ${locInfo}`;
            }
        }
        text += "\n";
    }
    text += e.message;
    if (showErrorDetails && e.details) {
        text += `\n${e.details}`;
    }
    if (showErrorDetails && e.missing) {
        text += e.missing.map((item: any) => `\n[${item}]`).join("");
    }
    if (showModuleTrace && e.origin) {
        text += `\n @ ${formatFilePath(
            e.origin.readableIdentifier(requestShortener)
        )}`;
        if (typeof e.originLoc === "object") {
            const locInfo = formatLocation(e.originLoc);
            if (locInfo) {
                text += ` ${locInfo}`;
            }
        }
        if (e.dependencies) {
            for (const dep of e.dependencies) {
                if (!dep.loc) {
                    continue;
                }
                if (typeof dep.loc === "string") {
                    continue;
                }
                const locInfo = formatLocation(dep.loc);
                if (!locInfo) {
                    continue;
                }
                text += ` ${locInfo}`;
            }
        }
        let current = e.origin;
        while (current.issuer) {
            current = current.issuer;
            text += `\n @ ${current.readableIdentifier(requestShortener)}`;
        }
    }
    return text;
}

function makeDevServer(
    rootPath: string,
    treeViewProxy: TreeViewProxy,
    reporter: (text: string, color?: vscode.ThemeColor) => void
): { server: DevServer; configPath: string } {
    const {configFileName, host, port } = readConfiguration();
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

        const errorInfos = stats.compilation.errors.map(e =>
            extractErorrInfo(e)
        );
        for (const e of errorInfos) {
            treeView.addItem({
                item: {
                    label: e.file,
                    description: e.message,
                    tooltip: e.message
                },
                children: []
            });
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
    outputChannel.show(true);
    const statusBarItem = vscode.window.createStatusBarItem(
        vscode.StatusBarAlignment.Left
    );
    statusBarItem.command = "vscode-wds.revealOutput";
    statusBarItem.show();

    const { host, port } = readConfiguration();

    try {
        process.chdir(rootPath);

        const devServerInstance = makeDevServer(
            rootPath,
            treeView,
            (t, c) => {
                outputChannel.appendLine(t);
                statusBarItem.text = t;
                if (c !== undefined) {
                    statusBarItem.color = c;
                }
            }
        );

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
        // release main thread
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
