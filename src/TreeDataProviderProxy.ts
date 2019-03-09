import { LinkedList } from "./LinkedList";
import { dummySubscription } from "./extension";
import * as vscode from "vscode";

export class TreeDataProviderProxy<T> implements vscode.TreeDataProvider<T> {
    private target: vscode.TreeDataProvider<T> | undefined;
    private targetSubscriptions = dummySubscription;
    private changeSubscriptions = new LinkedList<{
        listener: (e: T | null | undefined) => any;
        thisArgs?: any;
    }>();
    public setTarget(t: vscode.TreeDataProvider<T> | undefined) {
        if (this.target) {
            this.targetSubscriptions.dispose();
            this.targetSubscriptions = dummySubscription;
        }
        this.target = t;
        if (this.target && this.target.onDidChangeTreeData) {
            this.targetSubscriptions = this.target.onDidChangeTreeData(e =>
                this.fireChange(e)
            );
        }
        this.fireChange(null);
    }
    private fireChange = (e: T | null | undefined) => {
        this.changeSubscriptions.forEach(i => i.listener.call(i.thisArgs, e));
    };
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
    }
    public getTreeItem(
        element: T
    ): vscode.TreeItem | Thenable<vscode.TreeItem> {
        if (this.target === undefined) {
            return new vscode.TreeItem("No items here...");
        } else {
            return this.target.getTreeItem(element);
        }
    }
    public getChildren(element?: T | undefined): vscode.ProviderResult<T[]> {
        if (this.target === undefined) {
            [];
        } else {
            return this.target.getChildren(element);
        }
    }
}

export interface WithChildrenAndItem<T> {
    item: vscode.TreeItem;
    children?: T[];
}

export class SimpleTreeDataProvider<T extends WithChildrenAndItem<T>>
    implements vscode.TreeDataProvider<T> {
    private changeSubscriptions = new LinkedList<{
        listener: (e: T | null | undefined) => any;
        thisArgs?: any;
    }>();
    private items:T[] = [];

    public fireChange(e: T | null | undefined) {
        this.changeSubscriptions.forEach(i => i.listener.call(i.thisArgs, e));
    };

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
    }
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

    public addItem(item: T){
        this.items.push(item);
    }

    public clear() {
        this.items.splice(0, this.items.length);
    }
}
