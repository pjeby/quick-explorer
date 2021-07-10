import { TAbstractFile, TFile, TFolder, Keymap, Notice, App } from "obsidian";
import { hoverSource, startDrag } from "./Explorer";
import { PopupMenu, MenuParent } from "./menus";
import { ContextMenu } from "./ContextMenu";

declare module "obsidian" {
    export const Keymap: any
    interface App {
        viewRegistry: {
            isExtensionRegistered(ext: string): boolean
            getTypeByExtension(ext: string): string
        }
    }
}

const previewIcons: Record<string, string> = {
    markdown: "document",
    image: "image-file",
    audio: "audio-file",
    pdf: "pdf-file",
}

const viewtypeIcons: Record<string, string> = {
    ...previewIcons,
    // ass third-party plugins
    excalidraw: "excalidraw-icon",
};


function fileIcon(app: App, file: TAbstractFile) {
    if (file instanceof TFolder) return "folder";
    if (file instanceof TFile) {
        const viewType = app.viewRegistry.getTypeByExtension(file.extension);
        if (viewType) return viewtypeIcons[viewType] ?? "document";
    }
}

export class FolderMenu extends PopupMenu {

    parentFolder: TFolder = this.parent instanceof FolderMenu ? this.parent.folder : null;
    lastOver: HTMLElement = null;

    constructor(public parent: MenuParent, public folder: TFolder, public selected?: TAbstractFile) {
        super(parent);
        this.loadFiles(folder);

        const { dom } = this;
        dom.style.setProperty(
            // Allow popovers (hover preview) to overlay this menu
            "--layer-menu", "" + (parseInt(getComputedStyle(document.body).getPropertyValue("--layer-popover")) - 1)
        );

        const menuItem = ".menu-item[data-file-path]";
        dom.on("click",       menuItem, this.onItemClick, true);
        dom.on("contextmenu", menuItem, this.onItemMenu );
        dom.on('mouseover'  , menuItem, this.onItemHover);
        dom.on('dragstart',   menuItem, (event, target) => {
            startDrag(this.app, target.dataset.filePath, event);
        });
    }

    loadFiles(folder: TFolder) {
        const {children, parent} = folder;
        // XXX sort children by name
        const folders = children.filter(f => f instanceof TFolder);
        const files   = children.filter(f => f instanceof TFile);   // XXX && (allFiles || fileIcon(f))
        if (parent) folders.unshift(parent);
        folders.map(this.addFile, this);
        if (folders.length && files.length) this.addSeparator();
        files.map(  this.addFile, this);
    }

    addFile(file: TAbstractFile) {
        const icon = fileIcon(this.app, file);
        this.addItem(i => {
            i.setTitle((file === this.folder.parent) ? ".." : file.name);
            i.dom.dataset.filePath = file.path;
            i.dom.setAttr("draggable", "true");
            if (icon) i.setIcon(icon);
            if (file instanceof TFile) {
                i.setTitle(file.basename);
                if (file.extension !== "md") i.dom.createDiv({text: file.extension, cls: "nav-file-tag"});
            }
            if (file === this.selected) i.dom.addClass("is-active");
        });
    }

    onItemHover = (event: MouseEvent, targetEl: HTMLDivElement) => {
        const { filePath } = targetEl.dataset;
        const file = this.app.vault.getAbstractFileByPath(filePath);
        if (!file) return;
        if (targetEl != this.lastOver) {
            this.setChildMenu();  // close submenu
            this.lastOver = targetEl;
        }
        if (file instanceof TFile && previewIcons[this.app.viewRegistry.getTypeByExtension(file.extension)]) {
            this.app.workspace.trigger('hover-link', {
                event, source: hoverSource, hoverParent: this.dom, targetEl, linktext: filePath
            });
        }
    }

    onItemClick = (event: MouseEvent, target: HTMLDivElement) => {
        const { filePath } = target.dataset;
        const file = this.app.vault.getAbstractFileByPath(filePath);
        this.lastOver = target;
        if (!file) return;

        if (file instanceof TFile) {
            if (this.app.viewRegistry.isExtensionRegistered(file.extension)) {
                this.app.workspace.openLinkText(file.path, "", Keymap.isModifier(event, "Mod"));
                return;
            } else {
                new Notice(`.${file.extension} files cannot be opened in Obsidian; Use "Open in Default App" to open them externally`);
                // fall through
            }
        } else if (file === this.parentFolder) {
            this.hide();
        } else {
            const folderMenu = new FolderMenu(this, file as TFolder, this.folder);
            folderMenu.cascade(target, event);
        }

        // Keep current menu tree open
        event.stopPropagation();
        event.preventDefault();
        return false;
    }

    onItemMenu = (event: MouseEvent, target: HTMLDivElement) => {
        const { filePath } = target.dataset;
        const file = this.app.vault.getAbstractFileByPath(filePath);
        if (file) {
            this.lastOver = target;
            new ContextMenu(this, file).cascade(target, event);
            // Keep current menu tree open
            event.stopPropagation();
        }
    }
}
