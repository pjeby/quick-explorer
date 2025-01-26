import { TAbstractFile, TFile, TFolder } from "./obsidian.ts";

export const previewIcons: Record<string, string> = {
    markdown: "document",
    image: "image-file",
    audio: "audio-file",
    pdf: "pdf-file",
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
    return app.vault.getAbstractFileByPath(folderNotePath(folder));
}

export function folderNotePath(folder: TFolder) {
    return `${folder.path}/${folder.name}.md`;
}

const alphaSort = new Intl.Collator(undefined, {usage: "sort", sensitivity: "base", numeric: true}).compare;

export function sortedFiles(folder: TFolder, allFiles: boolean = app.vault.getConfig("showUnsupportedFiles")) {
    const {children} = folder;
    const folderNote = folderNoteFor(folder);
    const items = children.slice().sort((a: TAbstractFile, b: TAbstractFile) => alphaSort(a.name, b.name))
    const folders = items.filter(f => f instanceof TFolder) as TFolder[];
    const files   = items.filter(f => f instanceof TFile && f !== folderNote && (allFiles || fileIcon(f))) as TFile[];
    folders.sort((a, b) => alphaSort(a.name, b.name));
    files.sort((a, b) => alphaSort(a.basename, b.basename));
    return {folderNote, folders, files};
}

function fileIndex(folder: TFolder, allFiles?: boolean): TAbstractFile[] {
    const {folderNote, folders, files} = sortedFiles(folder, false);
    return (folderNote ? [folderNote] : []).concat(folders, files);
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