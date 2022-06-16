import {MenuItem, Plugin, TAbstractFile, TFolder} from "obsidian";
import {Explorer, hoverSource} from "./Explorer";
import {WindowManager} from "./PerWindowComponent";

import "./redom-jsx";
import "./styles.scss"

declare module "obsidian" {
    interface Workspace {
        registerHoverLinkSource(source: string, info: {display: string, defaultMod?: boolean}): void
        unregisterHoverLinkSource(source: string): void
    }
}

export default class QE extends Plugin {
    statusbarItem: HTMLElement
    explorers = new WindowManager(this, Explorer);

    get explorer(): Explorer {
        return this.explorers.forWindow();
    }

    updateCurrent(leaf = this.app.workspace.activeLeaf, file = this.app.workspace.getActiveFile()) {
        this.explorers.forLeaf(leaf).update(file);
    }

    onload() {
        this.app.workspace.registerHoverLinkSource(hoverSource, {
            display: 'Quick Explorer', defaultMod: true
        });

        this.registerEvent(this.app.workspace.on("file-open", () => this.updateCurrent()));
        this.registerEvent(this.app.workspace.on("active-leaf-change", leaf => this.updateCurrent(leaf)));

        this.addCommand({ id: "browse-vault",   name: "Browse vault",          callback: () => { this.explorer?.browseVault(); }, });
        this.addCommand({ id: "browse-current", name: "Browse current folder", callback: () => { this.explorer?.browseCurrent(); }, });

        this.registerEvent(this.app.workspace.on("file-menu", (menu, file, source) => {
            let item: MenuItem
            if (source !== "quick-explorer") menu.addItem(i => {
                i.setIcon("folder").setTitle("Show in Quick Explorer").onClick(e => { this.explorer?.browseFile(file); });
                item = i;
            })
            if (item) {
                const revealFile = i18next.t(`plugins.file-explorer.action-reveal-file`);
                const idx = menu.items.findIndex(i => i.titleEl.textContent === revealFile);
                (menu.dom as HTMLElement).insertBefore(item.dom, menu.items[idx+1].dom);
                menu.items.remove(item);
                menu.items.splice(idx+1, 0, item);
            }
        }));

        Object.defineProperty(TFolder.prototype, "basename", {get(){ return this.name; }, configurable: true})
    }

    onunload() {
        this.app.workspace.unregisterHoverLinkSource(hoverSource);
    }

}
