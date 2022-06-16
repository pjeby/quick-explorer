import { around } from "monkey-around";
import { Component, Plugin, View, WorkspaceItem } from "obsidian";

/**
 * Component that belongs to a plugin + window. e.g.:
 *
 *     class TitleWidget extends PerWindowComponent<MyPlugin> {
 *         onload() {
 *             // do stuff with this.plugin and this.win ...
 *         }
 *     }
 */
export class PerWindowComponent<P extends Plugin = Plugin> extends Component {
    constructor(public plugin: P, public win: Window) {
        super();
    }
}

/**
 * Plugin component to manage per-window components; should be added as an initializer,
 * e.g.:
 *
 *     class MyPlugin extends Plugin {
 *         titleWidgets = new WindowManager(this, TitleWidget);
 *         ...
 *     }
 *
 * This will automatically create a title widget for each window as it's opened, and
 * on plugin load.
 */
export class WindowManager<T extends PerWindowComponent<P>, P extends Plugin = Plugin> extends Component {
    instances = new WeakMap<Window, T>();

    constructor (
        public plugin: P,
        public factory: new (plugin: P, win: Window) => T,  // The class of thing to manage
        public autocreate = true  // create all items at start and monitor new window creation
    ) {
        super();
        plugin.addChild(this);
    }

    onload() {
        const {workspace} = this.plugin.app;
        if (this.autocreate) workspace.onLayoutReady(() => {
            const self = this;
            // Monitor new window creation
            if (workspace.floatingSplit) this.register(around(workspace.floatingSplit, {
                insertChild(old) {
                    return function(pos, item, resize) {
                        setImmediate(() => self.forLeaf(item, true));
                        return old.call(this, pos, item, resize);
                    }
                }
            }));
            this.forAll();  // Autocreate all instances
        });
    }

    forWindow(win: Window = window.activeWindow ?? window, create = true): T | undefined {
        let inst = this.instances.get(win);
        if (!inst && create) {
            inst = new this.factory(this.plugin, win);
            if (inst) {
                this.instances.set(win, inst);
                inst.registerDomEvent(win, "beforeunload", () => {
                    this.removeChild(inst);
                    this.instances.delete(win);
                });
                this.addChild(inst);
            }
        }
        return inst || undefined;
    }

    forLeaf(leaf: WorkspaceItem, create = true) {
        let win: Window = leaf ? window : undefined;
        for (let item = leaf; item; item = item.parentSplit) {
            if (item.win) win = item.win;
        }
        return this.forWindow(win, create);
    }

    forView(view: View, create = true) {
        return this.forLeaf(view.leaf, create);
    }

    forAll(create = true) {
        return [this.forWindow(window, create)].concat(
            this.plugin.app.workspace.floatingSplit?.children.map(split => this.forWindow(split.win, create)) ?? []
        );
    }
}


declare global {
    // Backward compatibility for single-window Obsidian (<0.15)
    interface Window {
        activeWindow?: Window
    }
}

declare module "obsidian" {
    interface Workspace {
        floatingSplit?: WorkspaceSplit;
    }
    interface WorkspaceItem {
        win?: Window;
        parentSplit?: WorkspaceSplit;
    }
    interface WorkspaceSplit {
        children: WorkspaceItem[];
        insertChild(pos: number, item: WorkspaceItem, resize?: boolean): void;
    }
}
