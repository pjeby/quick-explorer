import {App, Menu, Plugin, TAbstractFile, TFile, TFolder, Vault} from "obsidian";
import {el, list, mount, setAttr, unmount} from "redom";
import "./redom-jsx";
import "./styles.css"

const hoverSource = "quick-explorer:folder-menu";

export default class extends Plugin {
    statusbarItem: HTMLElement
    explorer: Explorer

    onload() {
        // Register the callback first, so close happens before the addStatusBarItem callback detaches it
        this.register(() => this.explorer?.close());
        this.explorer = new Explorer(this.app, this.statusbarItem = this.addStatusBarItem());
        this.app.workspace.onLayoutReady( () =>  this.explorer.update(this.app.workspace.getActiveFile()) );
        this.registerEvent(this.app.workspace.on("file-open", this.explorer.update, this.explorer));
        this.registerEvent(this.app.vault.on("rename", this.onFileChange, this));
        this.registerEvent(this.app.vault.on("delete", this.onFileChange, this));
        (this.app.workspace as any).registerHoverLinkSource(hoverSource, {
            display: 'Quick Explorer', defaultMod: true
        });
    }

    onunload() {
        (this.app.workspace as any).unregisterHoverLinkSource(hoverSource);
    }

    onFileChange(file: TAbstractFile) {
        if (file === this.explorer.lastFile) this.explorer.update(file);
    }
}

class Explorable {
    el: HTMLSpanElement = <span draggable class="explorable" />
    update(data: {file: TAbstractFile, path: string}) {
        const {file, path} = data;
        this.el.textContent = file.name || path;
        const dataset = {parentPath: file.parent?.path ?? "/", filePath: path};
        setAttr(this.el, {dataset});
    }
}

class Explorer {
    lastFile: TAbstractFile = null;
    lastPath: string = null;
    list = list(this.el, Explorable);

    constructor(protected app: App, protected el: HTMLElement) {
        this.el.on("contextmenu", ".explorable", (event, target) => {
            const {filePath} = target.dataset;
            const file = this.app.vault.getAbstractFileByPath(filePath);
            this.showItemMenu(this.contextMenuFor(file), target);
        })
        this.el.on("click", ".explorable", (event, target) => {
            const {parentPath, filePath} = target.dataset;
            const folder = this.app.vault.getAbstractFileByPath(parentPath);
            const selected = this.app.vault.getAbstractFileByPath(filePath);
            this.showItemMenu(this.folderMenuFor(folder as TFolder, selected), target);
        });
        this.el.on('dragstart', ".explorable", (event, target) => {
            const {filePath} = target.dataset;
            if (filePath === "/") return;
            const me = this.app.vault.getAbstractFileByPath(filePath);
            const dragManager = (this.app as any).dragManager;
            const dragData = me instanceof TFile ? dragManager.dragFile(event, me) : dragManager.dragFolder(event, me);
            dragManager.onDragStart(event, dragData);
        });
    }

    folderMenuFor(folder: TFolder, selected?: TAbstractFile) {
        const menu = new Menu(this.app);
        function addItem(child: TAbstractFile) {
            menu.addItem(i => {
                const {dom} = i as any as {dom: HTMLElement};
                setAttr(dom, {draggable: true, dataset: {filePath: child.path}});
                i.setTitle(child === folder.parent ? ".." : child.name).setIcon(child instanceof TFolder ? "folder" : "document")
                if (child===selected) dom.addClass("is-active");
            });
        }

        const folders = folder.children.filter(f => f instanceof TFolder);
        const files   = folder.children.filter(f => f instanceof TFile  ); // && valid type
        if (folder.parent) folders.unshift(folder.parent);
        folders.map(addItem);
        if (folders.length && files.length) menu.addSeparator();
        files.map(addItem);

        const {dom} = menu as any as {dom: HTMLElement};

        dom.on("click", ".menu-item[data-file-path]", (event, target) => {
            const {filePath} = target.dataset;
            const file = this.app.vault.getAbstractFileByPath(filePath);
            if (file) {
                if (file instanceof TFile) {
                    this.app.workspace.openLinkText(file.path, "");
                    return
                }
                const folderMenu = this.folderMenuFor(file as TFolder);
                folderMenu.showAtPosition({x: event.clientX, y: event.clientY});
                event.stopPropagation();  // Keep current menu tree open
                event.preventDefault();
                return false;
            }
        }, true);

        dom.style.setProperty(
            // Allow popovers (hover preview) to overlay this menu
            "--layer-menu", "" + (parseInt(getComputedStyle(document.body).getPropertyValue("--layer-popover")) - 1)
        );

        dom.on("contextmenu", ".menu-item[data-file-path]", (event, target) => {
            const {filePath} = target.dataset;
            const file = this.app.vault.getAbstractFileByPath(filePath);
            if (file) {
                const ctxMenu = this.contextMenuFor(file);
                ctxMenu.showAtPosition({x: event.clientX, y: event.clientY});
                event.stopPropagation();  // Keep current menu tree open
            }
        })

        dom.on('mouseover', ".menu-item[data-file-path]", (event, targetEl) => {
            const {filePath} = targetEl.dataset;
            const file = this.app.vault.getAbstractFileByPath(filePath);
            if (file instanceof TFile) this.app.workspace.trigger('hover-link', {
                event, source: hoverSource, hoverParent: dom, targetEl, linktext: filePath
            });
        });

        return menu;
    }

    contextMenuFor(file: TAbstractFile) {
        const menu = new Menu(this.app);
        const {workspace} = this.app;
        if (file instanceof TFolder) {
            menu.addItem(i => i.setTitle("New note").setIcon("create-new"));
            menu.addItem(i => i.setTitle("New folder").setIcon("folder"));
            menu.addItem(i => i.setTitle("Set as attachment folder").setIcon("image-file"));
            menu.addSeparator();
        }
        menu.addItem(i => i.setTitle("Rename").setIcon("pencil"));
        menu.addItem(i => i.setTitle("Delete").setIcon("trash"));
        if (file === workspace.getActiveFile()) {
            workspace.trigger("file-menu", menu, file, "quick-explorer", workspace.activeLeaf);
        } else {
            workspace.trigger("file-menu", menu, file, "quick-explorer");
        }
        return menu;
    }

    showItemMenu(menu: Menu, target: HTMLElement) {
        // Highlight the item whose menu is active, and turn it off when the menu closes
        menu.onHide(() => target.toggleClass("is-active", false));
        target.toggleClass("is-active", true);

        // Force menu to appear above the clicked item, but adjusted if it would go off-screen
        const {left, right, top} = target.getBoundingClientRect()
        menu.showAtPosition({x: left, y: top - 4});
        const {dom} = menu as any as {dom: HTMLDivElement};
        const pos = (left+dom.offsetWidth+2 >= window.innerWidth) ? window.innerWidth - dom.offsetWidth - 8 : left;
        dom.style.left = pos + "px";
    }

    close() {
        this.list.update([]);
    }

    update(file: TAbstractFile) {
        file ??= this.app.vault.getAbstractFileByPath("/");
        if (file == this.lastFile && file.path == this.lastPath ) return;
        this.lastFile = file;
        this.lastPath = file.path;
        const parts = [];
        while (file) {
            parts.unshift({file, path: file.path});
            file = file.parent;
        }
        if (parts.length > 1) parts.shift();
        this.list.update(parts);
    }
}