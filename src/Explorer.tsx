import { App, FileView, Notice, Plugin, requireApiVersion, TAbstractFile, TFile, TFolder } from "obsidian";
import { list, el, mount, unmount } from "redom";
import { ContextMenu } from "./ContextMenu";
import { FolderMenu } from "./FolderMenu";
import { PerWindowComponent, statusBarItem } from "@ophidian/core";

export const hoverSource = "quick-explorer:folder-menu";

declare module "obsidian" {
    interface App {
        dragManager: any
        getAppTitle(prefix?: string): string;
    }
}

export function startDrag(app: App, path: string, event: DragEvent) {
    if (!path || path === "/") return;
    const file = app.vault.getAbstractFileByPath(path);
    if (!file) return;
    const { dragManager } = app;
    const dragData = file instanceof TFile ? dragManager.dragFile(event, file) : dragManager.dragFolder(event, file);
    dragManager.onDragStart(event, dragData);
}

class Explorable {
    nameEl = <span class="explorable-name"/>;
    sepEl = <span class="explorable-separator"/>;
    el = <span draggable class="explorable titlebar-button">{this.nameEl}{this.sepEl}</span>;
    update(data: {file: TAbstractFile, path: string}, index: number, items: any[]) {
        const {file, path} = data;
        let name = file.name || path;
        this.sepEl.toggle(index < items.length-1);
        this.nameEl.textContent = name;
        this.el.dataset.parentPath = file.parent?.path ?? "/";
        this.el.dataset.filePath = path;
    }
}

export class Explorer extends PerWindowComponent {
    lastFile: TAbstractFile = null;
    lastPath: string = null;
    el: HTMLElement = <div id="quick-explorer" />;
    list = list(this.el, Explorable);
    isOpen = 0
    app = app;

    onload() {
        if (requireApiVersion("0.15.6")) {
            const originalTitleEl = this.win.document.body.find(".titlebar .titlebar-inner .titlebar-text");
            const titleEl = originalTitleEl?.cloneNode(true) as HTMLElement;
            if (titleEl) { // CPHATB plugin might have removed/replaced the original
                titleEl.addClass("qe-replacement");
                titleEl.textContent = app.getAppTitle?.() ?? this.win.document.title;
                originalTitleEl.replaceWith(titleEl);
                this.register(() => titleEl.replaceWith(originalTitleEl));
            }
        }

        if (requireApiVersion("0.16.0")) this.win.document.body.addClass("obsidian-themepocalypse");

        const buttonContainer = this.win.document.body.find(
            "body:not(.is-hidden-frameless) .titlebar .titlebar-button-container.mod-left"
        ) || statusBarItem(this, this.win, "left-region");

        this.register(() => unmount(buttonContainer, this));
        mount(buttonContainer, this);

        if (this.isCurrent()) {
            this.update(this.app.workspace.getActiveFile());
        } else {
            const leaf = app.workspace.getMostRecentLeaf(this.container);
            const file = (leaf?.view instanceof FileView) && leaf.view.file;
            if (file) this.update(file);
        }

        this.registerEvent(this.app.vault.on("rename", this.onFileChange, this));
        this.registerEvent(this.app.vault.on("delete", this.onFileDelete, this));

        this.el.on("contextmenu", ".explorable", (event, target) => {
            const { filePath } = target.dataset;
            const file = this.app.vault.getAbstractFileByPath(filePath);
            new ContextMenu(this.app, file).cascade(target, event);
        });
        this.el.on("click", ".explorable", (event, target) => {
            this.folderMenu(target, event.isTrusted && event);
        });
        this.el.on('dragstart', ".explorable", (event, target) => {
            startDrag(this.app, target.dataset.filePath, event);
        });
    }

    onFileChange(file: TAbstractFile) {
        if (file === this.lastFile) this.update(file);
    }

    onFileDelete(file: TAbstractFile) {
        if (file === this.lastFile) this.update();
    }

    folderMenu(opener: HTMLElement = this.el.firstElementChild as HTMLElement, event?: MouseEvent) {
        const { filePath, parentPath } = opener.dataset
        const selected = this.app.vault.getAbstractFileByPath(filePath);
        const folder = this.app.vault.getAbstractFileByPath(parentPath) as TFolder;
        this.isOpen++;
        return new FolderMenu(this.app, folder, selected, opener).cascade(opener, event, () => {
            this.isOpen--;
            if (!this.isOpen && this.isCurrent()) this.update(this.app.workspace.getActiveFile());
        });
    }

    browseVault() {
        return this.folderMenu();
    }

    browseCurrent() {
        return this.folderMenu(this.el.lastElementChild as HTMLDivElement);
    }

    browseFile(file: TAbstractFile) {
        if (file === this.lastFile) return this.browseCurrent();
        let menu: FolderMenu;
        let opener: HTMLElement = this.el.firstElementChild as HTMLElement;
        const path = [], parts = file.path.split("/").filter(p=>p);
        while (opener && parts.length) {
            path.push(parts[0]);
            if (opener.dataset.filePath !== path.join("/")) {
                menu = this.folderMenu(opener);
                path.pop();
                break
            }
            parts.shift();
            opener = opener.nextElementSibling as HTMLElement;
        }
        while (menu && parts.length) {
            path.push(parts.shift());
            const idx = menu.itemForPath(path.join("/"));
            if (idx == -1) break
            menu.select(idx);
            if (parts.length || file instanceof TFolder) {
                menu.onArrowRight();
                menu = menu.child as FolderMenu;
            }
        }
        return menu;
    }

    isCurrent() {
        return this === this.use(Explorer).forLeaf(app.workspace.activeLeaf);
    }

    update(file?: TAbstractFile) {
        if (this.isOpen) return;
        file ??= this.app.vault.getAbstractFileByPath("/");
        if (file == this.lastFile && file.path == this.lastPath) return;
        this.lastFile = file;
        this.lastPath = file.path;
        const parts = [];
        while (file) {
            parts.unshift({ file, path: file.path });
            file = file.parent;
        }
        if (parts.length > 1) parts.shift();
        this.list.update(parts);
    }

}
