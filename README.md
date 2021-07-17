## Quick Explorer for Obsidian

[Obsidian](https://obsidian.md)'s in-app file explorer is pretty flexible, but sometimes you only want to see the "current" folder, or a parent of it...  *without* needing to open a sidebar, then close it again afterwards.

This plugin fixes that problem by providing a "breadcrumbs bar" similar to the location bar dropdowns in Windows Explorer.  The breadcrumbs appear in the application title bar, and you can click on any of them to get a dropdown with all of the files and folders in the same location as the breadcrumb item.  You can then do almost anything you can do with the full file explorer:

* Hover-preview files
* Click to open files (with ctrl or cmd to open in a new pane)
* Right-click to get a full context menu for any file, folder, or breadcrumb
* Drag any file, folder, or breadcrumb to drop anywhere that supports dropping (e.g. to stars, into text editors to create links, pane headers to open in the pane, folders in the file explorer to move them, Kanban lanes, etc.)

### Installation

This plugin is still in early development, so it's only available via git checkout at the moment.  If you don't know what that is or how to do it, you should probably wait until the official release.

### Current Limitations

* Files are always sorted in ascending name order (using the same collation rules as the file-explorer view)
* All files are shown, regardless of the filter setting used in "Files and Links"
* You can drag things *out of* the dropdowns, but you can't drop anything *into* them
* Accessing context menus may be difficult when opening folders that are too big to fit on the screen and require scrolling
* There is no way to configure sorting or grouping of files

