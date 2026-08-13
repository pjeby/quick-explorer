import {MenuItem, Plugin, TFolder} from "./obsidian.ts";
import {app, use, command, addCommands, isLeafAttached, StyleSettings, o} from "@ophidian/core";
import {Explorer, getActiveLeaf, hoverSource} from "./Explorer.tsx";

import "./redom-jsx";
import "./styles.scss"
import { navigateFile } from "./file-info.ts";
import { ContextMenu } from "./ContextMenu.ts";
import { around } from "monkey-around";
import { DEFAULT_SETTINGS, normalizeSettings, QESettingTab, QESettings } from "./settings.ts";

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
    explorers = this.use(Explorer).watch();
    ss = this.use(StyleSettings);
    settings: QESettings = {...DEFAULT_SETTINGS};

    updateCurrent(leaf = getActiveLeaf(this.app), file = this.app.workspace.getActiveFile()) {
        if (isLeafAttached(leaf)) this.explorers.forLeaf(leaf).update(file);
    }

    async onload() {
        await this.loadSettings();
        this.addSettingTab(new QESettingTab(this.app, this));

        this.app.workspace.registerHoverLinkSource(hoverSource, {
            display: 'Quick Explorer', defaultMod: true
        });

        this.registerEvent(this.app.workspace.on("file-open", () => this.updateCurrent()));
        this.registerEvent(this.explorers.onLeafChange(leaf => this.updateCurrent(leaf)));

        this.addCommand({ id: "browse-vault",   name: "Browse vault",          callback: () => { this.explorers.forWindow()?.browseVault(); }, });
        this.addCommand({ id: "browse-current", name: "Browse current folder", callback: () => { this.explorers.forWindow()?.browseCurrent(); }, });

        addCommands(this);

        this.registerEvent(this.app.workspace.on("file-menu", (menu, file) => {
            let item: MenuItem
            if (!(menu instanceof ContextMenu)) menu.addItem(i => {
                i.setIcon("folder").setTitle(`Show in ${"Quick Explorer"}`).onClick(e => { this.explorers.forDom(item.dom)?.browseFile(file); });
                item = i;
                item.setSection?.("system")
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

        Object.defineProperty(TFolder.prototype, "basename", {get(this: TFolder){ return this.name; }, configurable: true})
    }

    [command("go-next",  "Go to next file in folder")]     () { return this.goFile( 1, true); }
    [command("go-prev",  "Go to previous file in folder")] () { return this.goFile(-1, true); }
    [command("go-first", "Go to first file in folder")]    () { return this.goFile(-1, false); }
    [command("go-last",  "Go to last file in folder")]     () { return this.goFile( 1, false); }

    goFile(dir: number, relative: boolean) {
        return () => {
            const curFile = app.workspace.getActiveFile();
            const goFile = curFile && navigateFile(curFile, dir, relative, this.settings.noteTitleProperty);
            if (goFile && goFile !== curFile) void app.workspace.getLeaf().openFile(goFile);
        }
    }

    async loadSettings() {
        this.settings = normalizeSettings(await this.loadData());
    }

    async setNoteTitleProperty(value: string) {
        this.settings.noteTitleProperty = value.trim();
        await this.saveData(this.settings);
    }

    onunload() {
        this.app.workspace.unregisterHoverLinkSource(hoverSource);
    }

    browseAfterModal(fileOrFolder: o.TAbstractFile, openDialog: () => Promise<unknown>) {
        // Trap closing of the rename dialog so we can explore the folder afterwards
        let opened = false;
        const self = (() => this)()
        const remove = around(o.Modal.prototype, {
            open(old) { return function() { opened = true; return old.call(this); } },
            close(old) {
                return function() {
                    remove();
                    self.explorers.forWindow()?.browseFile(fileOrFolder, false);
                    return old.call(this);
                }
            }
        })
        void (async () => {
            try { await openDialog(); } finally { void (opened || remove()); }
        })()
    }
}
