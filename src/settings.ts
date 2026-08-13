import { PluginSettingTab, Setting } from "./obsidian.ts";
import type { App } from "./obsidian.ts";
import type QE from "./quick-explorer.tsx";

export interface QESettings {
    autoPreviewByDefault: boolean
    keyboardModifierPreview: boolean
}

export const DEFAULT_SETTINGS: QESettings = {
    autoPreviewByDefault: true,
    keyboardModifierPreview: false,
}

export function normalizeSettings(data: unknown): QESettings {
    const saved = data && typeof data === "object" ? data as Record<string, unknown> : {};

    return {
        autoPreviewByDefault: typeof saved.autoPreviewByDefault === "boolean"
            ? saved.autoPreviewByDefault
            : DEFAULT_SETTINGS.autoPreviewByDefault,
        keyboardModifierPreview: typeof saved.keyboardModifierPreview === "boolean"
            ? saved.keyboardModifierPreview
            : DEFAULT_SETTINGS.keyboardModifierPreview,
    };
}

export class QESettingTab extends PluginSettingTab {
    constructor(app: App, public plugin: QE) {
        super(app, plugin);
    }

    display() {
        this.containerEl.empty();

        new Setting(this.containerEl)
            .setName("Automatic preview")
            .setDesc("Automatically preview the selected or hovered item. When this is off, pointer previews require Ctrl/Cmd. Press Tab in a Quick Explorer menu to toggle it temporarily.")
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.autoPreviewByDefault)
                .onChange(value => this.plugin.setAutoPreviewDefault(value))
            );

        new Setting(this.containerEl)
            .setName("Preview selected item while holding Ctrl/Cmd")
            .setDesc("When automatic preview is off, hold Ctrl/Cmd while navigating with the keyboard to preview the selected file or folder note.")
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.keyboardModifierPreview)
                .onChange(value => this.plugin.setKeyboardModifierPreview(value))
            );
    }
}
