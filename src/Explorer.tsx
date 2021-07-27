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
            const { parentPath, filePath } = target.dataset;
            const folder = app.vault.getAbstractFileByPath(parentPath);
            const selected = app.vault.getAbstractFileByPath(filePath);
            new FolderMenu(app, folder as TFolder, selected, target).cascade(target, event.isTrusted && event);
        });
        this.el.on('dragstart', ".explorable", (event, target) => {
            startDrag(app, target.dataset.filePath, event);
        });
    }

    browseVault() {
        (this.el.firstElementChild as HTMLDivElement).click();
    }

    browseCurrent() {
        (this.el.lastElementChild as HTMLDivElement).click();
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
