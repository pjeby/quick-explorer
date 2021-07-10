import { TAbstractFile, TFolder } from "obsidian";
import { PopupMenu, MenuParent } from "./menus";

export class ContextMenu extends PopupMenu {
    constructor(parent: MenuParent, file: TAbstractFile) {
        super(parent);
        const { workspace } = this.app;
        if (file instanceof TFolder) {
            this.addItem(i => i.setTitle("New note").setIcon("create-new").setDisabled(true));
            this.addItem(i => i.setTitle("New folder").setIcon("folder").setDisabled(true));
            this.addItem(i => i.setTitle("Set as attachment folder").setIcon("image-file").setDisabled(true));
            this.addSeparator();
        }
        this.addItem(i => i.setTitle("Rename").setIcon("pencil").setDisabled(true));
        this.addItem(i => i.setTitle("Delete").setIcon("trash").setDisabled(true));
        if (file === workspace.getActiveFile()) {
            workspace.trigger("file-menu", this, file, "quick-explorer", workspace.activeLeaf);
        } else {
            workspace.trigger("file-menu", this, file, "quick-explorer");
        }
    }
}
