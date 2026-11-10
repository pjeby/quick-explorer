import { TAbstractFile, TFile, TFolder } from "./obsidian.ts";
import { app } from "@ophidian/core";

export const previewIcons: Record<string, string> = {
    markdown: "document",
    image: "image-file",
    audio: "audio-file",
    pdf: "pdf-file",
    bases: "table",
    canvas: "layout-template",
}

export const viewtypeIcons: Record<string, string> = {
    ...previewIcons,
    // add third-party plugins
    excalidraw: "excalidraw-icon",
};

export function fileIcon(file: TAbstractFile) {
    if (file instanceof TFolder) return "folder";
    if (file instanceof TFile) {
        const viewType = app.viewRegistry.getTypeByExtension(file.extension);
        if (viewType) return viewtypeIcons[viewType] ?? "document";
    }
}

export function folderNoteFor(folder: TFolder) {
    const file = app.vault.getFileByPath(folderNotePath(folder))
    if (!file) {
        const folderNotes = (
            folder.children as Array<TFile|TFolder>
        ).filter(f => f instanceof TFile && f.basename === folder.name) as TFile[]
        if (folderNotes.length) {
            folderNotes.sort((a, b) => alphaSort(a.name, b.name))
            return folderNotes[0]
        }
    }
    return file
}

export function folderNotePath(folder: TFolder) {
    return `${folder.path}/${folder.name}.md`;
}

const alphaSort = new Intl.Collator(undefined, {usage: "sort", sensitivity: "base", numeric: true})["compare"];

export function sortedFiles(folder: TFolder, allFiles: boolean = app.vault.getConfig("showUnsupportedFiles")) {
    const children = folder.children as Array<TFile|TFolder>;
    const folderNote = app.vault.getFileByPath(folderNotePath(folder));
    const items = children.slice().sort((a: TAbstractFile, b: TAbstractFile) => alphaSort(a.name, b.name))
    const folders = [] as TFolder[]
    const files   = [] as TFile[]
    const folderNotes = [] as TFile[]
    for(const item of items) {
        if (item instanceof TFolder) folders.push(item)
        else if (allFiles || fileIcon(item)) {
            if (item.basename === folder.name) {
                folderNotes.push(item)
            } else {
                files.push(item)
            }
        }
    }
    if (folderNotes.length > 1 && folderNote) {
        folderNotes.remove(folderNote)
        folderNotes.unshift(folderNote)
    }
    folders.sort((a, b) => alphaSort(a.name, b.name));
    files.sort((a, b) => alphaSort(a.basename, b.basename));
    return {folderNotes, folders, files};
}

function fileIndex(folder: TFolder, allFiles?: boolean): TAbstractFile[] {
    const {folderNotes, folders, files} = sortedFiles(folder, false);
    return [...folderNotes, ...folders, ...files];
}

export function navigateFile(file: TAbstractFile, direction: number, relative: boolean): TFile {
    const seen = new Set<TAbstractFile>();
    while (file?.parent && !seen.has(file)) {
        seen.add(file);
        let all = fileIndex(file.parent, false);
        let pos = all.indexOf(file);
        if (pos === -1) return; // XXX should never happen!
        if (relative) {
            pos += direction;
        } else {
            pos = direction < 0 ? 0 : all.length - 1;
        }
        file = file.parent;  // in case we're at the top or bottom of the folder already
        while (pos >= 0 && pos < all.length) {
            file = all[pos];
            if (file instanceof TFile) return file;
            else if (file instanceof TFolder) {
                all = fileIndex(file, false);
                pos = direction > 0 ? 0 : all.length - 1;
            }
            else pos += direction; // XXX should never get here
        }
    }
}

//window["navigateFile"]=navigateFile;