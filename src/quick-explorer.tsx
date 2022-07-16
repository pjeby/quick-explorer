import {MenuItem, Plugin, TFolder} from "obsidian";
import {use} from "ophidian";
import {Explorer, hoverSource} from "./Explorer";

import "./redom-jsx";
import "./styles.scss"

declare module "obsidian" {
    interface Workspace {
        registerHoverLinkSource(source: string, info: {display: string, defaultMod?: boolean}): void
        unregisterHoverLinkSource(source: string): void
    }
    interface Menu {
        sections: string[]
    }
}

export default class QE extends Plugin {
    statusbarItem: HTMLElement

    use = use.plugin(this);
    explorers = this.use(Explorer);

    updateCurrent(leaf = this.app.workspace.activeLeaf, file = this.app.workspace.getActiveFile()) {
        this.explorers.forLeaf(leaf).update(file);
    }

    onload() {
        this.app.workspace.registerHoverLinkSource(hoverSource, {
            display: 'Quick Explorer', defaultMod: true
        });

        this.registerEvent(this.app.workspace.on("file-open", () => this.updateCurrent()));
        this.registerEvent(this.app.workspace.on("active-leaf-change", leaf => this.updateCurrent(leaf)));

        this.app.workspace.onLayoutReady(() => this.updateCurrent());

        this.addCommand({ id: "browse-vault",   name: "Browse vault",          callback: () => { this.explorers.forWindow()?.browseVault(); }, });
        this.addCommand({ id: "browse-current", name: "Browse current folder", callback: () => { this.explorers.forWindow()?.browseCurrent(); }, });

        this.registerEvent(this.app.workspace.on("file-menu", (menu, file, source) => {
            let item: MenuItem
            if (source !== "quick-explorer") menu.addItem(i => {
                i.setIcon("folder").setTitle("Show in Quick Explorer").onClick(e => { this.explorers.forDom(item.dom)?.browseFile(file); });
                item = i;
                item.setSection?.("view");
            })
            if (item) {
                const revealFile = i18next.t(`plugins.file-explorer.action-reveal-file`);
                const idx = menu.items.findIndex(i => i.titleEl?.textContent === revealFile);
                if (idx > -1) {
                    // Remove this once 0.15.3+ is required
                    if (!menu.sections) (menu.dom as HTMLElement).insertBefore(item.dom, menu.items[idx].dom);
                    menu.items.remove(item);
                    menu.items.splice(idx, 0, item);
                }
            }
        }));

        Object.defineProperty(TFolder.prototype, "basename", {get(){ return this.name; }, configurable: true})
    }

    onunload() {
        this.app.workspace.unregisterHoverLinkSource(hoverSource);
    }

}
