import { TAbstractFile, TFile, TFolder, Keymap, Notice, App, Menu } from "obsidian";
import { hoverSource, startDrag } from "./Explorer";
import { PopupMenu, MenuParent } from "./menus";
import { ContextMenu } from "./ContextMenu";

declare module "obsidian" {
    interface App {
        viewRegistry: {
            isExtensionRegistered(ext: string): boolean
            getTypeByExtension(ext: string): string
        }
    }
    interface Vault {
        getConfig(option: string): any
        getConfig(option:"showUnsupportedFiles"): boolean
    }
}

const alphaSort = new Intl.Collator(undefined, {usage: "sort", sensitivity: "base", numeric: true}).compare;

const previewIcons: Record<string, string> = {
    markdown: "document",
    image: "image-file",
    audio: "audio-file",
    pdf: "pdf-file",
}

const viewtypeIcons: Record<string, string> = {
    ...previewIcons,
    // add third-party plugins
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

    constructor(public parent: MenuParent, public folder: TFolder, public selectedFile?: TAbstractFile, public opener?: HTMLElement) {
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
        dom.on("mousedown",   menuItem, e => {e.stopPropagation()}, true);  // Fix drag cancelling
        dom.on('dragstart',   menuItem, (event, target) => {
            startDrag(this.app, target.dataset.filePath, event);
        });
    }

    onArrowLeft(): boolean | undefined {
        return super.onArrowLeft() ?? this.openBreadcrumb(this.opener?.previousElementSibling);
    }

    openBreadcrumb(element: Element) {
        if (element && this.rootMenu() === this) {
            const prevExplorable = this.opener.previousElementSibling;
            this.hide();
            (element as HTMLDivElement).click()
            return false;
        }
    }

    onArrowRight(): boolean | undefined {
        const targetEl = this.items[this.selected]?.dom;
        const { filePath } = targetEl?.dataset;
        const file = filePath && this.app.vault.getAbstractFileByPath(filePath);
        if (file instanceof TFolder && file !== this.selectedFile) {
            this.onClickFile(file, targetEl);
            return false;
        }
        return this.openBreadcrumb(this.opener?.nextElementSibling);
    }

    loadFiles(folder: TFolder) {
        const allFiles = this.app.vault.getConfig("showUnsupportedFiles");
        const {children, parent} = folder;
        const items = children.slice().sort((a: TAbstractFile, b: TAbstractFile) => alphaSort(a.name, b.name))
        const folders = items.filter(f => f instanceof TFolder) as TFolder[];
        const files   = items.filter(f => f instanceof TFile && (allFiles || fileIcon(this.app, f))) as TFile[];
        folders.sort((a, b) => alphaSort(a.name, b.name));
        files.sort((a, b) => alphaSort(a.basename, b.basename));
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
            i.onClick(e => this.onClickFile(file, i.dom))
            if (file === this.selectedFile) {
                i.dom.addClass("selected"); // < 0.12.12
                this.select(this.items.length-1);
            }
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
        if (!this.onClickFile(file, target)) {
            // Keep current menu tree open
            event.stopPropagation();
            event.preventDefault();
            return false;
        }
    }

    onClickFile(file: TAbstractFile, target: HTMLDivElement, event?: MouseEvent|KeyboardEvent) {
        if (file instanceof TFile) {
            if (this.app.viewRegistry.isExtensionRegistered(file.extension)) {
                this.app.workspace.openLinkText(file.path, "", event && Keymap.isModifier(event, "Mod"));
                // Close the entire menu tree
                this.rootMenu().hide();
                return true;
            } else {
                new Notice(`.${file.extension} files cannot be opened in Obsidian; Use "Open in Default App" to open them externally`);
                // fall through
            }
        } else if (file === this.parentFolder) {
            // We're a child menu and selected "..": just return to previous menu
            this.hide();
        } else if (file === this.folder.parent) {
            // Not a child menu, but selected "..": go to previous breadcrumb
            this.onArrowLeft();
        } else if (file === this.selectedFile) {
            // Targeting the initially-selected subfolder: go to next breadcrumb
            this.openBreadcrumb(this.opener?.nextElementSibling);
        } else {
            // Otherwise, pop a new menu for the subfolder
            const folderMenu = new FolderMenu(this, file as TFolder, this.folder);
            folderMenu.cascade(target, event instanceof MouseEvent ? event : undefined);
        }
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
