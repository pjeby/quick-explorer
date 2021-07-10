import { Keymap, Notice, TAbstractFile, TFile, TFolder, View } from "obsidian";
import { PopupMenu, MenuParent } from "./menus";
import {i18n} from "i18next";

declare global {
    const i18next: i18n
}

declare module "obsidian" {
    interface App {
        setAttachmentFolder(folder: TFolder): void
        internalPlugins: {
            plugins: {
                "file-explorer": {
                    enabled: boolean
                    instance: {
                        revealInFolder(file: TAbstractFile): void
                    }
                }
            }
        }
    }
    interface FileManager {
        promptForFolderDeletion(folder: TFolder): void
        promptForFileDeletion(file: TFile): void
        promptForFileRename(file: TFile): void
        createNewMarkdownFile(parentFolder?: TFolder, pattern?: string): Promise<TFile>
    }
}

interface FileExplorerView extends View {
    createAbstractFile(kind: "file" | "folder", parent: TFolder, newLeaf?: boolean): Promise<void>
    startRenameFile(file: TAbstractFile): Promise<void>
}

function optName(name: string) {
    return i18next.t(`plugins.file-explorer.menu-opt-${name}`);
}

export class ContextMenu extends PopupMenu {
    constructor(parent: MenuParent, file: TAbstractFile) {
        super(parent);
        const { workspace } = this.app;
        const haveFileExplorer = this.app.internalPlugins.plugins["file-explorer"].enabled;

        if (file instanceof TFolder) {
            this.addItem(i => i.setTitle(optName("new-note")).setIcon("create-new").onClick(async e => {
                const newFile = await this.app.fileManager.createNewMarkdownFile(file);
                if (newFile) await this.app.workspace.getLeaf(Keymap.isModifier(e, "Mod")).openFile(newFile, {
                    active: !0, state: { mode: "source" }, eState: { rename: "all" }
                })
            }));
            this.addItem(i => i.setTitle(optName("new-folder")).setIcon("folder").setDisabled(!haveFileExplorer).onClick(event => {
                if (haveFileExplorer) {
                    this.withExplorer(file)?.createAbstractFile("folder", file);
                } else {
                    new Notice("The File Explorer core plugin must be enabled to rename folders")
                    event.stopPropagation();
                }
            }));
            this.addItem(i => i.setTitle(optName("set-attachment-folder")).setIcon("image-file").onClick(() => {
                this.app.setAttachmentFolder(file);
            }));
            this.addSeparator();
        }
        this.addItem(i => {
            // Can't rename folder without file explorer
            i.setDisabled(file instanceof TFolder && !haveFileExplorer);
            i.setTitle(optName("rename")).setIcon("pencil").onClick(event => {
                if (file instanceof TFile) {
                    this.app.fileManager.promptForFileRename(file);
                } else if (haveFileExplorer) {
                    this.withExplorer(file)?.startRenameFile(file);
                } else {
                    new Notice("The File Explorer core plugin must be enabled to rename folders")
                    event.stopPropagation();
                }
            });
        });
        this.addItem(i => i.setTitle(optName("delete")).setIcon("trash").onClick(() => {
            if (file instanceof TFolder) {
                this.app.fileManager.promptForFolderDeletion(file);
            }
            else if (file instanceof TFile) {
                this.app.fileManager.promptForFileDeletion(file);
            }
        }));
        if (file instanceof TFolder && haveFileExplorer) {
            this.addItem(i => i.setIcon("folder").setTitle(i18next.t('plugins.file-explorer.action-reveal-file')).onClick(() => {
                this.withExplorer(file);
            }));
        }
        if (file === workspace.getActiveFile()) {
            workspace.trigger("file-menu", this, file, "quick-explorer", workspace.activeLeaf);
        } else {
            workspace.trigger("file-menu", this, file, "quick-explorer");
        }
    }

    withExplorer(file: TAbstractFile) {
        const explorer = this.app.internalPlugins.plugins["file-explorer"];
        if (explorer.enabled) {
            explorer.instance.revealInFolder(file);
            return this.app.workspace.getLeavesOfType("file-explorer")[0].view as FileExplorerView
        }
    }
}
