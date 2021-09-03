import { App, TAbstractFile, TFile, TFolder } from "obsidian";
import { list, el } from "redom";
import { ContextMenu } from "./ContextMenu";
import { FolderMenu } from "./FolderMenu";

export const hoverSource = "quick-explorer:folder-menu";

declare module "obsidian" {
    interface App {
        dragManager: any
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
    el: HTMLSpanElement = <span draggable class="explorable titlebar-button" />
    update(data: {file: TAbstractFile, path: string}, index: number, items: any[]) {
        const {file, path} = data;
        let name = file.name || path;
        if (index < items.length-1) name += "\u00A0/\u00A0";
        this.el.textContent = name;
        this.el.dataset.parentPath = file.parent?.path ?? "/";
        this.el.dataset.filePath = path;
    }
}

export class Explorer {
    lastFile: TAbstractFile = null;
    lastPath: string = null;
    el: HTMLElement = <div id="quick-explorer" />;
    list = list(this.el, Explorable);

    constructor(public app: App) {
        this.el.on("contextmenu", ".explorable", (event, target) => {
            const { filePath } = target.dataset;
            const file = app.vault.getAbstractFileByPath(filePath);
            new ContextMenu(app, file).cascade(target, event);
        });
        this.el.on("click", ".explorable", (event, target) => {
            this.folderMenu(target, event.isTrusted && event);
        });
        this.el.on('dragstart', ".explorable", (event, target) => {
            startDrag(app, target.dataset.filePath, event);
        });
    }

    folderMenu(opener: HTMLElement = this.el.firstElementChild as HTMLElement, event?: MouseEvent) {
        const { filePath, parentPath } = opener.dataset
        const selected = this.app.vault.getAbstractFileByPath(filePath);
        const folder = this.app.vault.getAbstractFileByPath(parentPath) as TFolder;
        return new FolderMenu(this.app, folder, selected, opener).cascade(opener, event);
    }

    browseVault() {
        return this.folderMenu();
    }

    browseCurrent() {
        return this.folderMenu(this.el.lastElementChild as HTMLDivElement);
    }

    browseFile(file: TAbstractFile) {
        if (file === this.app.workspace.getActiveFile()) return this.browseCurrent();
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

    update(file: TAbstractFile) {
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
