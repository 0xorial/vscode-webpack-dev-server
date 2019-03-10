import { LinkedList } from "./LinkedList";
import * as vscode from "vscode";

export interface WithChildrenAndItem<T> {
    item: vscode.TreeItem;
    children?: T[];
    parent?: T;
}

export class SimpleTreeDataProvider<T extends WithChildrenAndItem<T>>
    implements vscode.TreeDataProvider<T> {
    private changeSubscriptions = new LinkedList<{
        listener: (e: T | null | undefined) => any;
        thisArgs?: any;
    }>();
    private items: T[] = [];
    public fireChange(e: T | null | undefined) {
        this.changeSubscriptions.forEach(i => i.listener.call(i.thisArgs, e));
    }
    public onDidChangeTreeData = (
        listener: (e: T | null | undefined) => any,
        thisArgs?: any,
        disposables?: vscode.Disposable[]
    ): vscode.Disposable => {
        const node = this.changeSubscriptions.add({
            listener,
            thisArgs
        });
        const result = {
            dispose: () => {
                node.detachSelf();
            }
        };
        if (disposables) {
            disposables.push(result);
        }
        return result;
    };
    public getTreeItem(
        element: T
    ): vscode.TreeItem | Thenable<vscode.TreeItem> {
        return element.item;
    }
    public getChildren(element?: T | undefined): vscode.ProviderResult<T[]> {
        if (!element) {
            return this.items;
        }
        return element.children;
    }
    public getParent(element: T) {
        return element.parent;
    }

    public addItem(item: T) {
        this.items.push(item);
    }
    public clear() {
        this.items.splice(0, this.items.length);
    }
}
