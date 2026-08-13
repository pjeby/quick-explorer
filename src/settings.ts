import { PluginSettingTab, Setting } from "./obsidian.ts";
import type { App } from "./obsidian.ts";
import type QE from "./quick-explorer.tsx";

export interface QESettings {
    noteTitleProperty: string
}

export const DEFAULT_SETTINGS: QESettings = {
    noteTitleProperty: "",
}

export function normalizeSettings(data: unknown): QESettings {
    const saved = data && typeof data === "object" ? data as Record<string, unknown> : {};

    return {
        noteTitleProperty: typeof saved.noteTitleProperty === "string"
            ? saved.noteTitleProperty.trim()
            : DEFAULT_SETTINGS.noteTitleProperty,
    };
}

export class QESettingTab extends PluginSettingTab {
    constructor(app: App, public plugin: QE) {
        super(app, plugin);
    }

    display() {
        this.containerEl.empty();

        new Setting(this.containerEl)
            .setName("Note title property")
            .setDesc("Use this frontmatter property as the display name for Markdown notes in Quick Explorer lists. Notes without a non-empty value use their file name.")
            .addText(text => text
                .setPlaceholder("title")
                .setValue(this.plugin.settings.noteTitleProperty)
                .onChange(value => this.plugin.setNoteTitleProperty(value))
            );
    }
}
