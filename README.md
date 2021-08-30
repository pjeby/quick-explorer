## Quick Explorer for Obsidian

[Obsidian](https://obsidian.md)'s in-app file explorer is pretty flexible, but it's almost 100% mouse-driven with almost no keyboard navigation.  Worse, if you have a lot of folders and lots of files in them, you end up spending a lot of time expanding and collapsing folders, and scrolling to find what you're looking for.  This can be especially annoying when all you want is to do something with the "current" folder, or a parent of it...  *without* needing to open a sidebar and close it again afterwards.  And last, but not least, trying to rapidly preview the contents of a lot of notes with the mouse is a giant PITA.

Enter Quick Explorer.  It's menu-based and keyboard-friendly, stays out of your way when you aren't using it, and makes it super-easy to navigate from either the vault root or current folder, without needing to scroll through or collapse a zillion other folders to find what you're looking for.  You can even search by name within a folder, just by typing.  There's an auto-preview feature that makes previewing lots of notes super easy, with no mousing and no popups overhanging the file list.  And you can even see the path of the current file as a "breadcrumbs bar" in the window title bar!

Each breadcrumb, when clicked, drops down a list of the the files and folders in the same directory.  So if you click on the breadcrumb for the current file, you'll see the items in its folder, and the first breadcrumb will show items in the vault root.  No matter where you click, though, you can then do almost anything that can be done with Obsidian's built-in file explorer:

* Ctrl/Cmd + Hover to preview files (if the built-in Page Preview plugin is enabled)
* Click to open files (with ctrl or cmd to open in a new pane)
* Right-click to get a full context menu for any file, folder, or breadcrumb
* Drag any file, folder, or breadcrumb to drop anywhere that supports dropping (e.g. to stars, into text editors to create links, pane headers to open in the pane, folders in the file explorer to move them, Kanban lanes, etc.)

And an extensive set of keyboard operations is available as well:

* Typing normal text searches item names within a folder (or context menu), selecting the next matching item
* Up, Down, Home, and End move within a folder or context menu
* Left and Right arrows select parent or child folders
* Enter selects an item to open, Ctrl-or-Cmd + Enter opens a file in a new pane
* Alt + Enter opens a context menu for the selected file or folder
* F2 initiates a rename of the current file or folder, Shift+F2 begins a move
* Tab toggles "quick preview" mode: when active, hovering or arrowing to an item will automatically display a hover preview for it, positioned so that it's always *outside* the menu (unless you're so deep in subfolders you've reached the edge of your screen).  This makes it really easy to browse the contents of a folder just by arrowing down through it.

And speaking of previews, Quick Explorer's previews support **folder notes**!  When hover-previewing a folder (or after arrowing to it in quick preview mode), it's checked for a note whose name is the same as the folder, and then that note is shown without you needing to open the folder first.  It's a huge time saver if you have a lot of folder notes.  (Check out the Note Folder Autorename plugin if you'd like to automatically rename or move folders when the note is renamed, too.)

Like the built-in file explorer, Quick Explorer will either show all files, or only the ones supported by Obsidian, depending upon whether "Detect all file extensions" is enabled in the "Files and Links" options tab.

Quick explorer also includes two hotkeyable commands:

* **Browse vault**, which opens the dropdown for the vault root, and
* **Browse current folder**, which opens the dropdown for the active file's containing folder

### Installation

This plugin is still in early development, so it's only available via git checkout at the moment.  If you don't know what that is or how to do it, you should probably wait until there's an official release.

### Current Limitations

* Files are always sorted in ascending name order (using the same collation rules as the file-explorer view)
* You can drag things *out of* the dropdowns, but you can't drop anything *into* them
* Accessing context menus may be difficult when opening folders that are too big to fit on the screen and require scrolling
* There is no way to configure sorting or grouping of files

