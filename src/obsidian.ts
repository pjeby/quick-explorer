import { TFile, TFolder } from "obsidian";
export type TConcreteFile = TFile | TFolder;
export * from "obsidian";

declare module "obsidian" {
    interface App {
        loadLocalStorage(key: string): unknown;
        saveLocalStorage(key: string, data: unknown): void;
    }
    interface TooltipOptions {
        classes?: string[];
        gap?: number;
        delay?: number;
    }
    export function setTooltip(el: HTMLElement, tooltip: string, options?: TooltipOptions): void
}
