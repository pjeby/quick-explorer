import { Keymap, Notice, TAbstractFile, TFile, TFolder, View } from "./obsidian.ts";
import { PopupMenu, MenuParent } from "./menus.ts";

declare module "obsidian" {
    interface _Commands {
        executeCommandById(id: string): void
    }
    interface App {
        commands: _Commands
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
        promptForFileRename(file: TAbstractFile): void
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
                this.rootMenu().hide();
                const newFile = await this.app.fileManager.createNewMarkdownFile(file);
                if (newFile) await this.app.workspace.getLeaf(Keymap.isModEvent(e)).openFile(newFile, {
                    active: !0, state: { mode: "source" }, eState: { rename: "all" }
                })
            }));
            this.addItem(i => i.setTitle(optName("new-folder")).setIcon("folder").setDisabled(!haveFileExplorer).onClick(event => {
                if (haveFileExplorer) {
                    this.rootMenu().hide();
                    this.withExplorer(file)?.createAbstractFile("folder", file);
                } else {
                    new Notice("The File Explorer core plugin must be enabled to create new folders")
                    event.stopPropagation();
                }
            }));
            this.addItem(i => i.setTitle(optName("set-attachment-folder")).setIcon("image-file").onClick(() => {
                this.app.setAttachmentFolder(file);
            }));
            this.addSeparator();
        }
        this.addItem(i => {
            i.setTitle(optName("rename")).setIcon("pencil").onClick(event => {
                this.app.fileManager.promptForFileRename(file);
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
                this.rootMenu().hide();
                this.withExplorer(file);
            }));
        }
        workspace.trigger("file-menu", this, file, "quick-explorer");
    }

    onEnter(event: KeyboardEvent) {
        this.rootMenu().hide();
        return super.onEnter(event);
    }

    withExplorer(file: TAbstractFile) {
        const explorer = this.app.internalPlugins.plugins["file-explorer"];
        if (explorer.enabled) {
            explorer.instance.revealInFolder(file);
            return this.app.workspace.getLeavesOfType("file-explorer")[0].view as FileExplorerView
        }
    }
}
