## Quick Explorer for Obsidian

[Obsidian](https://obsidian.md)'s in-app file explorer is pretty flexible, but sometimes you only want to see the "current" folder, or a parent of it...  *without* needing to open a sidebar, then close it again afterwards.

This plugin fixes that problem by providing a "breadcrumbs bar" similar to the location bar dropdowns in Windows Explorer.  The breadcrumbs appear in the application title bar, and you can click on any of them to get a dropdown with all of the files and folders in the same location as the breadcrumb item.  You can then do almost anything you can do with the full file explorer:

* Ctrl/Cmd + Hover to preview files (if the built-in Page Preview plugin is enabled)
* Click to open files (with ctrl or cmd to open in a new pane)
* Right-click to get a full context menu for any file, folder, or breadcrumb
* Drag any file, folder, or breadcrumb to drop anywhere that supports dropping (e.g. to stars, into text editors to create links, pane headers to open in the pane, folders in the file explorer to move them, Kanban lanes, etc.)

Like the built-in file explorer, Quick Explorer will either show all files, or only the ones supported by Obsidian, depending upon whether "Detect all file extensions" is enabled in the "Files and Links" options tab.

Quick explorer also includes two hotkeyable commands:

* **Browse vault**, which opens a menu for the vault root, and
* **Browse current folder**, which opens a menu for the active file's containing folder

With Obsidian 0.12.12 and above, keyboard navigation is also supported within the menus:

* Typing normal text searches item names within the folder and selects the next matching folder or file
* Up, Down, Home, and End move within a folder
* Left and Right arrows select parent or child folders
* Enter selects an item to open, Ctrl-or-Cmd + Enter opens a file in a new pane
* Alt + Enter opens a context menu for the selected file or folder

### Installation

This plugin is still in early development, so it's only available via git checkout at the moment.  If you don't know what that is or how to do it, you should probably wait until there's an official release.

### Current Limitations

* Files are always sorted in ascending name order (using the same collation rules as the file-explorer view)
* You can drag things *out of* the dropdowns, but you can't drop anything *into* them
* Accessing context menus may be difficult when opening folders that are too big to fit on the screen and require scrolling
* There is no way to configure sorting or grouping of files

