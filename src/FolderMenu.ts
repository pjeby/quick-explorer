import { TAbstractFile, TFile, TFolder, Keymap, Notice, HoverParent, debounce, WorkspaceSplit, HoverPopover, FileView, MarkdownView } from "obsidian";
import { hoverSource, startDrag } from "./Explorer";
import { PopupMenu, MenuParent } from "./menus";
import { ContextMenu } from "./ContextMenu";
import { around } from "monkey-around";

declare module "obsidian" {
    interface HoverPopover {
        hide(): void
        hoverEl: HTMLDivElement
        onHover: boolean
    }
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
    interface Workspace {
        iterateLeaves(callback: (item: WorkspaceLeaf) => any, item: WorkspaceParent): boolean;
    }
}

interface HoverEditor extends HoverPopover {
    rootSplit: WorkspaceSplit;
    togglePin(pinned?: boolean): void;
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


// Global auto preview mode
let autoPreview = true

export class FolderMenu extends PopupMenu implements HoverParent {

    parentFolder: TFolder = this.parent instanceof FolderMenu ? this.parent.folder : null;

    constructor(public parent: MenuParent, public folder: TFolder, public selectedFile?: TAbstractFile, public opener?: HTMLElement) {
        super(parent);
        this.loadFiles(folder, selectedFile);
        this.scope.register([],        "Tab",   this.togglePreviewMode.bind(this));
        this.scope.register(["Mod"],   "Enter", this.onEnter.bind(this));
        this.scope.register(["Alt"],   "Enter", this.onKeyboardContextMenu.bind(this));
        this.scope.register([],        "\\",    this.onKeyboardContextMenu.bind(this));
        this.scope.register([],        "F2",    this.doRename.bind(this));
        this.scope.register(["Shift"], "F2",    this.doMove.bind(this));

        // Scroll preview window up and down
        this.scope.register([],       "PageUp", this.doScroll.bind(this, -1, false));
        this.scope.register([],     "PageDown", this.doScroll.bind(this,  1, false));
        this.scope.register(["Mod"],    "Home", this.doScroll.bind(this,  0, true));
        this.scope.register(["Mod"],     "End", this.doScroll.bind(this,  1, true));

        const { dom } = this;
        const menuItem = ".menu-item[data-file-path]";
        dom.on("click",       menuItem, this.onItemClick, true);
        dom.on("contextmenu", menuItem, this.onItemMenu );
        dom.on('mouseover'  , menuItem, this.onItemHover);
        dom.on("mousedown",   menuItem, e => {e.stopPropagation()}, true);  // Fix drag cancelling
        dom.on('dragstart',   menuItem, (event, target) => {
            startDrag(this.app, target.dataset.filePath, event);
        });

        // When we unload, reactivate parent menu's hover, if needed
        this.register(() => { autoPreview && this.parent instanceof FolderMenu && this.parent.showPopover(); })

        // Make obsidian.Menu think mousedowns on our popups are happening
        // on us, so we won't close before an actual click occurs
        const menu = this;
        around(this.dom, {contains(prev){ return function(target: Node) {
            const ret = prev.call(this, target) || menu._popover?.hoverEl.contains(target);
            return ret;
        }}});
    }

    onArrowLeft() {
        super.onArrowLeft();
        if (this.rootMenu() === this) this.openBreadcrumb(this.opener?.previousElementSibling);
        return false;
    }

    onKeyboardContextMenu() {
        const target = this.items[this.selected]?.dom, file = target && this.fileForDom(target);
        if (file) new ContextMenu(this, file).cascade(target);
        return false;
    }

    doScroll(direction: number, toEnd: boolean, event: KeyboardEvent) {
        const preview = this.hoverPopover?.hoverEl.find(".markdown-preview-view, .cm-scroller");
        if (preview) {
            preview.style.scrollBehavior = toEnd ? "auto": "smooth";
            const oldTop = preview.scrollTop;
            const newTop = (toEnd ? 0 : preview.scrollTop) + direction * (toEnd ? preview.scrollHeight : preview.clientHeight);
            preview.scrollTop = newTop;
            if (!toEnd) {
                // Paging past the beginning or end
                if (newTop >= preview.scrollHeight) {
                    this.onArrowDown(event);
                } else if (newTop < 0) {
                    if (oldTop > 0) preview.scrollTop = 0; else this.onArrowUp(event);
                }
            }
        } else {
            if (!autoPreview) { autoPreview = true; this.showPopover(); }
            // No preview, just go to next or previous item
            else if (direction > 0) this.onArrowDown(event); else this.onArrowUp(event);
        }
        return false;
    }

    doRename() {
        const file = this.currentFile()
        if (file) this.app.fileManager.promptForFileRename(file);
        return false;
    }

    doMove() {
        const explorerPlugin = this.app.internalPlugins.plugins["file-explorer"];
        if (!explorerPlugin.enabled) {
            new Notice("File explorer core plugin must be enabled to move files or folders");
            return false;
        }
        const modal = explorerPlugin.instance.moveFileModal;
        modal.setCurrentFile(this.currentFile());
        modal.open()
        return false;
    }

    currentItem() {
        return this.items[this.selected];
    }

    currentFile() {
        return this.fileForDom(this.currentItem()?.dom)
    }

    fileForDom(targetEl: HTMLDivElement) {
        const { filePath } = targetEl?.dataset;
        if (filePath) return this.app.vault.getAbstractFileByPath(filePath);
    }

    itemForPath(filePath: string) {
        return this.items.findIndex(i => i.dom.dataset.filePath === filePath);
    }

    openBreadcrumb(element: Element) {
        if (element && this.rootMenu() === this) {
            const prevExplorable = this.opener.previousElementSibling;
            (element as HTMLDivElement).click()
            return false;
        }
    }

    onArrowRight() {
        const file = this.currentFile();
        if (file instanceof TFolder) {
            if (file !== this.selectedFile) {
                this.onClickFile(file, this.currentItem().dom);
            } else {
                this.openBreadcrumb(this.opener?.nextElementSibling);
            }
        } else if (file instanceof TFile) {
            const pop = this.hoverPopover;
            if (pop && pop.rootSplit) {
                this.app.workspace.iterateLeaves(leaf => {
                    if (leaf.view instanceof FileView && leaf.view.file === file) {
                        pop.togglePin(true);  // Ensure the popup won't close
                        this.onEscape();      // when we close
                        if (leaf.view instanceof MarkdownView) {
                            // Switch to edit mode -- keyboard's not much good without it!
                            leaf.setViewState({
                                type: leaf.view.getViewType(),
                                state: { file: file.path, mode: "source"}
                            }).then(() => this.app.workspace.setActiveLeaf(leaf, false, true));
                        } else {
                            // Something like Kanban or Excalidraw, might not support focus flag,
                            // so make sure the current pane doesn't hang onto it
                            (document.activeElement as HTMLElement)?.blur();
                            this.app.workspace.setActiveLeaf(leaf, false, true);
                        }
                    }
                    return true;  // only target the first leaf, whether it matches or not
                }, pop.rootSplit)
            }
        }
        return false;
    }

    loadFiles(folder: TFolder, selectedFile?: TAbstractFile) {
        const folderNote = this.folderNote(this.folder);
        this.dom.empty(); this.items = [];
        const allFiles = this.app.vault.getConfig("showUnsupportedFiles");
        const {children, parent} = folder;
        const items = children.slice().sort((a: TAbstractFile, b: TAbstractFile) => alphaSort(a.name, b.name))
        const folders = items.filter(f => f instanceof TFolder) as TFolder[];
        const files   = items.filter(f => f instanceof TFile && f !== folderNote && (allFiles || this.fileIcon(f))) as TFile[];
        folders.sort((a, b) => alphaSort(a.name, b.name));
        files.sort((a, b) => alphaSort(a.basename, b.basename));
        if (folderNote) {
            this.addFile(folderNote);
        }
        if (folders.length) {
            if (folderNote) this.addSeparator();
            folders.map(this.addFile, this);
        }
        if (files.length) {
            if (folders.length || folderNote) this.addSeparator();
            files.map(this.addFile, this);
        }
        this.select(selectedFile ? this.itemForPath(selectedFile.path) : 0);
    }

    fileIcon(file: TAbstractFile) {
        if (file instanceof TFolder) return "folder";
        if (file instanceof TFile) {
            const viewType = this.app.viewRegistry.getTypeByExtension(file.extension);
            if (viewType) return viewtypeIcons[viewType] ?? "document";
        }
    }

    fileCount: (file: TAbstractFile) => number = (file: TAbstractFile) => (
        file instanceof TFolder ? file.children.map(this.fileCount).reduce((a,b) => a+b, 0) : (this.fileIcon(file) ? 1 : 0)
    )

    addFile(file: TAbstractFile) {
        const icon = this.fileIcon(file);
        this.addItem(i => {
            i.setTitle(file.name);
            i.dom.dataset.filePath = file.path;
            i.dom.setAttr("draggable", "true");
            i.dom.addClass (file instanceof TFolder ? "is-qe-folder" : "is-qe-file");
            if (icon) i.setIcon(icon);
            if (file instanceof TFile) {
                i.setTitle(file.basename);
                if (file.extension !== "md") i.dom.createDiv({text: file.extension, cls: ["nav-file-tag","qe-extension"]});
            } else if (file !== this.folder.parent) {
                const count = this.fileCount(file);
                if (count) i.dom.createDiv({text: ""+count, cls: "nav-file-tag qe-file-count"});
            }
            i.onClick(e => this.onClickFile(file, i.dom, e))
        });
    }

    togglePreviewMode() {
        if (autoPreview = !autoPreview) this.showPopover(); else this.hidePopover();
        return false;
    }

    refreshFiles = debounce(() => this.loadFiles(this.folder, this.currentFile()), 100, true);

    onload() {
        super.onload();
        this.registerEvent(this.app.vault.on("create", (file) => {
            if (this.folder === file.parent) this.refreshFiles();
        }));
        this.registerEvent(this.app.vault.on("rename", (file, oldPath) => {
            if (this.folder === file.parent) {
                // Destination was here; refresh the list
                const selectedFile = this.itemForPath(oldPath) >= 0 ? file : this.currentFile();
                this.loadFiles(this.folder, selectedFile);
            } else {
                // Remove it if it was moved out of here
                this.removeItemForPath(oldPath);
            }
        }));
        this.registerEvent(this.app.vault.on("delete", file => this.removeItemForPath(file.path)));

        // Activate preview immediately if applicable
        if (autoPreview && this.selected != -1) this.showPopover();
    }

    removeItemForPath(path: string) {
        const posn = this.itemForPath(path);
        if (posn < 0) return;
        const item = this.items[posn];
        if (this.selected > posn) this.selected -= 1;
        item.dom.detach()
        this.items.remove(item);
    }

    onEscape() {
        super.onEscape();
        if (this.parent instanceof PopupMenu) this.parent.onEscape();
        return false;
    }

    hide() {
        this.hidePopover();
        return super.hide();
    }

    setChildMenu(menu: PopupMenu) {
        super.setChildMenu(menu);
        if (autoPreview && this.canShowPopover()) this.showPopover();
    }

    select(idx: number, scroll = true) {
        const old = this.selected;
        super.select(idx, scroll);
        if (old !== this.selected) {
            // selected item changed; trigger new popover or hide the old one
            if (autoPreview) this.showPopover(); else this.hidePopover();
        }
    }

    hidePopover() {
        this.hoverPopover = null;
    }

    canShowPopover() {
        return !this.child && this.visible;
    }

    showPopover = debounce(() => {
        this.hidePopover();
        if (!autoPreview) return;
        this.maybeHover(this.currentItem()?.dom, file => this.app.workspace.trigger('link-hover', this, null, file.path, ""));
    }, 50, true)

    onItemHover = (event: MouseEvent, targetEl: HTMLDivElement) => {
        if (!autoPreview) this.maybeHover(targetEl, file => this.app.workspace.trigger('hover-link', {
            event, source: hoverSource, hoverParent: this, targetEl, linktext: file.path
        }));
    }

    maybeHover(targetEl: HTMLDivElement, cb: (file: TFile) => void) {
        if (!this.canShowPopover()) return;
        let file = this.fileForDom(targetEl)
        if (file instanceof TFolder) file = this.folderNote(file);
        if (file instanceof TFile && previewIcons[this.app.viewRegistry.getTypeByExtension(file.extension)]) {
            cb(file)
        };
    }

    folderNote(folder: TFolder) {
        return this.app.vault.getAbstractFileByPath(this.folderNotePath(folder));
    }

    folderNotePath(folder: TFolder) {
        return `${folder.path}/${folder.name}.md`;
    }


    _popover: HoverEditor;

    get hoverPopover() { return this._popover; }

    set hoverPopover(popover) {
        const old = this._popover;
        if (old && popover !== old) {
            this._popover = null;
            old.onHover = false;   // Force unpinned Hover Editors to close
            old.hide();
        }
        if (popover && !this.canShowPopover()) {
            popover.onHover = false;   // Force unpinned Hover Editors to close
            popover.hide();
            popover = null;
        }
        this._popover = popover;
        if (autoPreview && popover && this.currentItem()) {
            // Override auto-pinning if we are generating auto-previews, to avoid
            // generating huge numbers of popovers
            popover.togglePin?.(false);

            // Position the popover so it doesn't overlap the menu horizontally (as long as it fits)
            // and so that its vertical position overlaps the selected menu item (placing the top a
            // bit above the current item, unless it would go off the bottom of the screen)
            const hoverEl = popover.hoverEl;
            hoverEl.show();
            const
                menu = this.dom.getBoundingClientRect(),
                selected = this.currentItem().dom.getBoundingClientRect(),
                container = hoverEl.offsetParent || document.documentElement,
                popupHeight = hoverEl.offsetHeight,
                left = Math.min(menu.right + 2, container.clientWidth - hoverEl.offsetWidth),
                top = Math.min(Math.max(0, selected.top - popupHeight/8), container.clientHeight - popupHeight)
            ;
            hoverEl.style.top = top + "px";
            hoverEl.style.left = left + "px";
        }
    }

    onItemClick = (event: MouseEvent, target: HTMLDivElement) => {
        const file = this.fileForDom(target);
        if (!file) return;
        if (!this.onClickFile(file, target, event)) {
            // Keep current menu tree open
            event.stopPropagation();
            event.preventDefault();
            return false;
        }
    }

    onClickFile(file: TAbstractFile, target: HTMLDivElement, event?: MouseEvent|KeyboardEvent) {
        this.hidePopover();
        const idx = this.itemForPath(file.path);
        if (idx >= 0 && this.selected != idx) this.select(idx);

        if (file instanceof TFile) {
            if (this.app.viewRegistry.isExtensionRegistered(file.extension)) {
                this.app.workspace.openLinkText(file.path, "", event && Keymap.isModifier(event, "Mod"));
                // Close the entire menu tree
                this.rootMenu().hide();
                event?.stopPropagation();
                return true;
            } else {
                new Notice(`.${file.extension} files cannot be opened in Obsidian; Use "Open in Default App" to open them externally`);
                // fall through
            }
        } else if (file === this.selectedFile) {
            // Targeting the initially-selected subfolder: go to next breadcrumb
            this.openBreadcrumb(this.opener?.nextElementSibling);
        } else {
            // Otherwise, pop a new menu for the subfolder
            const folderMenu = new FolderMenu(this, file as TFolder, this.folderNote(file as TFolder));
            folderMenu.cascade(target, event instanceof MouseEvent ? event : undefined);
        }
    }

    onItemMenu = (event: MouseEvent, target: HTMLDivElement) => {
        const file = this.fileForDom(target);
        if (file) {
            const idx = this.itemForPath(file.path);
            if (idx >= 0 && this.selected != idx) this.select(idx);
            new ContextMenu(this, file).cascade(target, event);
            // Keep current menu tree open
            event.stopPropagation();
        }
    }
}
