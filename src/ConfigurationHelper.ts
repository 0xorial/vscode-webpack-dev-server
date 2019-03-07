import { workspace } from "vscode";

export function readConfiguration() {
    const config = workspace.getConfiguration("vscode-wds");
    const port = config.get<number>("port") || 8080;
    const host = config.get<string>("host") || "localhost";
    const configFileName =
        config.get<string>("configFileName") || "webpack.config.js";
    return { port, host, configFileName };
}
