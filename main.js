'use strict';

var obsidian = require('obsidian');

function parseQuery (query) {
  var chunks = query.split(/([#.])/);
  var tagName = '';
  var id = '';
  var classNames = [];

  for (var i = 0; i < chunks.length; i++) {
    var chunk = chunks[i];
    if (chunk === '#') {
      id = chunks[++i];
    } else if (chunk === '.') {
      classNames.push(chunks[++i]);
    } else if (chunk.length) {
      tagName = chunk;
    }
  }

  return {
    tag: tagName || 'div',
    id: id,
    className: classNames.join(' ')
  };
}

function createElement (query, ns) {
  var ref = parseQuery(query);
  var tag = ref.tag;
  var id = ref.id;
  var className = ref.className;
  var element = ns ? document.createElementNS(ns, tag) : document.createElement(tag);

  if (id) {
    element.id = id;
  }

  if (className) {
    if (ns) {
      element.setAttribute('class', className);
    } else {
      element.className = className;
    }
  }

  return element;
}

function unmount (parent, child) {
  var parentEl = getEl(parent);
  var childEl = getEl(child);

  if (child === childEl && childEl.__redom_view) {
    // try to look up the view if not provided
    child = childEl.__redom_view;
  }

  if (childEl.parentNode) {
    doUnmount(child, childEl, parentEl);

    parentEl.removeChild(childEl);
  }

  return child;
}

function doUnmount (child, childEl, parentEl) {
  var hooks = childEl.__redom_lifecycle;

  if (hooksAreEmpty(hooks)) {
    childEl.__redom_lifecycle = {};
    return;
  }

  var traverse = parentEl;

  if (childEl.__redom_mounted) {
    trigger(childEl, 'onunmount');
  }

  while (traverse) {
    var parentHooks = traverse.__redom_lifecycle || {};

    for (var hook in hooks) {
      if (parentHooks[hook]) {
        parentHooks[hook] -= hooks[hook];
      }
    }

    if (hooksAreEmpty(parentHooks)) {
      traverse.__redom_lifecycle = null;
    }

    traverse = traverse.parentNode;
  }
}

function hooksAreEmpty (hooks) {
  if (hooks == null) {
    return true;
  }
  for (var key in hooks) {
    if (hooks[key]) {
      return false;
    }
  }
  return true;
}

/* global Node, ShadowRoot */

var hookNames = ['onmount', 'onremount', 'onunmount'];
var shadowRootAvailable = typeof window !== 'undefined' && 'ShadowRoot' in window;

function mount (parent, child, before, replace) {
  var parentEl = getEl(parent);
  var childEl = getEl(child);

  if (child === childEl && childEl.__redom_view) {
    // try to look up the view if not provided
    child = childEl.__redom_view;
  }

  if (child !== childEl) {
    childEl.__redom_view = child;
  }

  var wasMounted = childEl.__redom_mounted;
  var oldParent = childEl.parentNode;

  if (wasMounted && (oldParent !== parentEl)) {
    doUnmount(child, childEl, oldParent);
  }

  if (before != null) {
    if (replace) {
      parentEl.replaceChild(childEl, getEl(before));
    } else {
      parentEl.insertBefore(childEl, getEl(before));
    }
  } else {
    parentEl.appendChild(childEl);
  }

  doMount(child, childEl, parentEl, oldParent);

  return child;
}

function trigger (el, eventName) {
  if (eventName === 'onmount' || eventName === 'onremount') {
    el.__redom_mounted = true;
  } else if (eventName === 'onunmount') {
    el.__redom_mounted = false;
  }

  var hooks = el.__redom_lifecycle;

  if (!hooks) {
    return;
  }

  var view = el.__redom_view;
  var hookCount = 0;

  view && view[eventName] && view[eventName]();

  for (var hook in hooks) {
    if (hook) {
      hookCount++;
    }
  }

  if (hookCount) {
    var traverse = el.firstChild;

    while (traverse) {
      var next = traverse.nextSibling;

      trigger(traverse, eventName);

      traverse = next;
    }
  }
}

function doMount (child, childEl, parentEl, oldParent) {
  var hooks = childEl.__redom_lifecycle || (childEl.__redom_lifecycle = {});
  var remount = (parentEl === oldParent);
  var hooksFound = false;

  for (var i = 0, list = hookNames; i < list.length; i += 1) {
    var hookName = list[i];

    if (!remount) { // if already mounted, skip this phase
      if (child !== childEl) { // only Views can have lifecycle events
        if (hookName in child) {
          hooks[hookName] = (hooks[hookName] || 0) + 1;
        }
      }
    }
    if (hooks[hookName]) {
      hooksFound = true;
    }
  }

  if (!hooksFound) {
    childEl.__redom_lifecycle = {};
    return;
  }

  var traverse = parentEl;
  var triggered = false;

  if (remount || (traverse && traverse.__redom_mounted)) {
    trigger(childEl, remount ? 'onremount' : 'onmount');
    triggered = true;
  }

  while (traverse) {
    var parent = traverse.parentNode;
    var parentHooks = traverse.__redom_lifecycle || (traverse.__redom_lifecycle = {});

    for (var hook in hooks) {
      parentHooks[hook] = (parentHooks[hook] || 0) + hooks[hook];
    }

    if (triggered) {
      break;
    } else {
      if (traverse.nodeType === Node.DOCUMENT_NODE ||
        (shadowRootAvailable && (traverse instanceof ShadowRoot)) ||
        (parent && parent.__redom_mounted)
      ) {
        trigger(traverse, remount ? 'onremount' : 'onmount');
        triggered = true;
      }
      traverse = parent;
    }
  }
}

function setStyle (view, arg1, arg2) {
  var el = getEl(view);

  if (typeof arg1 === 'object') {
    for (var key in arg1) {
      setStyleValue(el, key, arg1[key]);
    }
  } else {
    setStyleValue(el, arg1, arg2);
  }
}

function setStyleValue (el, key, value) {
  if (value == null) {
    el.style[key] = '';
  } else {
    el.style[key] = value;
  }
}

/* global SVGElement */

var xlinkns = 'http://www.w3.org/1999/xlink';

function setAttrInternal (view, arg1, arg2, initial) {
  var el = getEl(view);

  var isObj = typeof arg1 === 'object';

  if (isObj) {
    for (var key in arg1) {
      setAttrInternal(el, key, arg1[key], initial);
    }
  } else {
    var isSVG = el instanceof SVGElement;
    var isFunc = typeof arg2 === 'function';

    if (arg1 === 'style' && typeof arg2 === 'object') {
      setStyle(el, arg2);
    } else if (isSVG && isFunc) {
      el[arg1] = arg2;
    } else if (arg1 === 'dataset') {
      setData(el, arg2);
    } else if (!isSVG && (arg1 in el || isFunc) && (arg1 !== 'list')) {
      el[arg1] = arg2;
    } else {
      if (isSVG && (arg1 === 'xlink')) {
        setXlink(el, arg2);
        return;
      }
      if (initial && arg1 === 'class') {
        arg2 = el.className + ' ' + arg2;
      }
      if (arg2 == null) {
        el.removeAttribute(arg1);
      } else {
        el.setAttribute(arg1, arg2);
      }
    }
  }
}

function setXlink (el, arg1, arg2) {
  if (typeof arg1 === 'object') {
    for (var key in arg1) {
      setXlink(el, key, arg1[key]);
    }
  } else {
    if (arg2 != null) {
      el.setAttributeNS(xlinkns, arg1, arg2);
    } else {
      el.removeAttributeNS(xlinkns, arg1, arg2);
    }
  }
}

function setData (el, arg1, arg2) {
  if (typeof arg1 === 'object') {
    for (var key in arg1) {
      setData(el, key, arg1[key]);
    }
  } else {
    if (arg2 != null) {
      el.dataset[arg1] = arg2;
    } else {
      delete el.dataset[arg1];
    }
  }
}

function text (str) {
  return document.createTextNode((str != null) ? str : '');
}

function parseArgumentsInternal (element, args, initial) {
  for (var i = 0, list = args; i < list.length; i += 1) {
    var arg = list[i];

    if (arg !== 0 && !arg) {
      continue;
    }

    var type = typeof arg;

    if (type === 'function') {
      arg(element);
    } else if (type === 'string' || type === 'number') {
      element.appendChild(text(arg));
    } else if (isNode(getEl(arg))) {
      mount(element, arg);
    } else if (arg.length) {
      parseArgumentsInternal(element, arg, initial);
    } else if (type === 'object') {
      setAttrInternal(element, arg, null, initial);
    }
  }
}

function ensureEl (parent) {
  return typeof parent === 'string' ? html(parent) : getEl(parent);
}

function getEl (parent) {
  return (parent.nodeType && parent) || (!parent.el && parent) || getEl(parent.el);
}

function isNode (arg) {
  return arg && arg.nodeType;
}

var htmlCache = {};

function html (query) {
  var args = [], len = arguments.length - 1;
  while ( len-- > 0 ) args[ len ] = arguments[ len + 1 ];

  var element;

  var type = typeof query;

  if (type === 'string') {
    element = memoizeHTML(query).cloneNode(false);
  } else if (isNode(query)) {
    element = query.cloneNode(false);
  } else if (type === 'function') {
    var Query = query;
    element = new (Function.prototype.bind.apply( Query, [ null ].concat( args) ));
  } else {
    throw new Error('At least one argument required');
  }

  parseArgumentsInternal(getEl(element), args, true);

  return element;
}

var el = html;

html.extend = function extendHtml (query) {
  var args = [], len = arguments.length - 1;
  while ( len-- > 0 ) args[ len ] = arguments[ len + 1 ];

  var clone = memoizeHTML(query);

  return html.bind.apply(html, [ this, clone ].concat( args ));
};

function memoizeHTML (query) {
  return htmlCache[query] || (htmlCache[query] = createElement(query));
}

function setChildren (parent) {
  var children = [], len = arguments.length - 1;
  while ( len-- > 0 ) children[ len ] = arguments[ len + 1 ];

  var parentEl = getEl(parent);
  var current = traverse(parent, children, parentEl.firstChild);

  while (current) {
    var next = current.nextSibling;

    unmount(parent, current);

    current = next;
  }
}

function traverse (parent, children, _current) {
  var current = _current;

  var childEls = new Array(children.length);

  for (var i = 0; i < children.length; i++) {
    childEls[i] = children[i] && getEl(children[i]);
  }

  for (var i$1 = 0; i$1 < children.length; i$1++) {
    var child = children[i$1];

    if (!child) {
      continue;
    }

    var childEl = childEls[i$1];

    if (childEl === current) {
      current = current.nextSibling;
      continue;
    }

    if (isNode(childEl)) {
      var next = current && current.nextSibling;
      var exists = child.__redom_index != null;
      var replace = exists && next === childEls[i$1 + 1];

      mount(parent, child, current, replace);

      if (replace) {
        current = next;
      }

      continue;
    }

    if (child.length != null) {
      current = traverse(parent, child, current);
    }
  }

  return current;
}

var ListPool = function ListPool (View, key, initData) {
  this.View = View;
  this.initData = initData;
  this.oldLookup = {};
  this.lookup = {};
  this.oldViews = [];
  this.views = [];

  if (key != null) {
    this.key = typeof key === 'function' ? key : propKey(key);
  }
};

ListPool.prototype.update = function update (data, context) {
  var ref = this;
    var View = ref.View;
    var key = ref.key;
    var initData = ref.initData;
  var keySet = key != null;

  var oldLookup = this.lookup;
  var newLookup = {};

  var newViews = new Array(data.length);
  var oldViews = this.views;

  for (var i = 0; i < data.length; i++) {
    var item = data[i];
    var view = (void 0);

    if (keySet) {
      var id = key(item);

      view = oldLookup[id] || new View(initData, item, i, data);
      newLookup[id] = view;
      view.__redom_id = id;
    } else {
      view = oldViews[i] || new View(initData, item, i, data);
    }
    view.update && view.update(item, i, data, context);

    var el = getEl(view.el);

    el.__redom_view = view;
    newViews[i] = view;
  }

  this.oldViews = oldViews;
  this.views = newViews;

  this.oldLookup = oldLookup;
  this.lookup = newLookup;
};

function propKey (key) {
  return function (item) {
    return item[key];
  };
}

function list (parent, View, key, initData) {
  return new List(parent, View, key, initData);
}

var List = function List (parent, View, key, initData) {
  this.View = View;
  this.initData = initData;
  this.views = [];
  this.pool = new ListPool(View, key, initData);
  this.el = ensureEl(parent);
  this.keySet = key != null;
};

List.prototype.update = function update (data, context) {
    if ( data === void 0 ) data = [];

  var ref = this;
    var keySet = ref.keySet;
  var oldViews = this.views;

  this.pool.update(data, context);

  var ref$1 = this.pool;
    var views = ref$1.views;
    var lookup = ref$1.lookup;

  if (keySet) {
    for (var i = 0; i < oldViews.length; i++) {
      var oldView = oldViews[i];
      var id = oldView.__redom_id;

      if (lookup[id] == null) {
        oldView.__redom_index = null;
        unmount(this, oldView);
      }
    }
  }

  for (var i$1 = 0; i$1 < views.length; i$1++) {
    var view = views[i$1];

    view.__redom_index = i$1;
  }

  setChildren(this, views);

  if (keySet) {
    this.lookup = lookup;
  }
  this.views = views;
};

List.extend = function extendList (parent, View, key, initData) {
  return List.bind(List, parent, View, key, initData);
};

list.extend = List.extend;

function around(obj, factories) {
    const removers = Object.keys(factories).map(key => around1(obj, key, factories[key]));
    return removers.length === 1 ? removers[0] : function () { removers.forEach(r => r()); };
}
function around1(obj, method, createWrapper) {
    const original = obj[method], hadOwn = obj.hasOwnProperty(method);
    let current = createWrapper(original);
    // Let our wrapper inherit static props from the wrapping method,
    // and the wrapping method, props from the original method
    if (original)
        Object.setPrototypeOf(current, original);
    Object.setPrototypeOf(wrapper, current);
    obj[method] = wrapper;
    // Return a callback to allow safe removal
    return remove;
    function wrapper(...args) {
        // If we have been deactivated and are no longer wrapped, remove ourselves
        if (current === original && obj[method] === wrapper)
            remove();
        return current.apply(this, args);
    }
    function remove() {
        // If no other patches, just do a direct removal
        if (obj[method] === wrapper) {
            if (hadOwn)
                obj[method] = original;
            else
                delete obj[method];
        }
        if (current === original)
            return;
        // Else pass future calls through, and remove wrapper from the prototype chain
        current = original;
        Object.setPrototypeOf(wrapper, original || Function);
    }
}

class PopupMenu extends obsidian.Menu {
    constructor(parent) {
        super(parent instanceof obsidian.App ? parent : parent.app);
        this.parent = parent;
        if (parent instanceof PopupMenu)
            parent.setChildMenu(this);
        // Escape to close the menu
        this.scope.register(null, "Escape", this.hide.bind(this));
        // Make obsidian.Menu think mousedowns on our child menu(s) are happening
        // on us, so we won't close before an actual click occurs
        const menu = this;
        around(this.dom, { contains(prev) {
                return function (target) {
                    const ret = prev.call(this, target) || menu.child?.dom.contains(target);
                    return ret;
                };
            } });
    }
    onload() {
        this.scope.register(null, null, () => false); // block all keys other than ours
        super.onload();
    }
    hide() {
        this.setChildMenu(); // hide child menu(s) first
        return super.hide();
    }
    setChildMenu(menu) {
        this.child?.hide();
        this.child = menu;
    }
    cascade(target, event, hOverlap = 15, vOverlap = 5) {
        const { left, right, top, bottom } = target.getBoundingClientRect();
        const centerX = (left + right) / 2;
        const { innerHeight, innerWidth } = window;
        // Try to cascade down and to the right from the mouse or horizontal center
        // of the clicked item
        const point = { x: event ? event.clientX - hOverlap : centerX, y: bottom - vOverlap };
        // Measure the menu and see if it fits
        document.body.appendChild(this.dom);
        const { offsetWidth, offsetHeight } = this.dom;
        const fitsBelow = point.y + offsetHeight < innerHeight;
        const fitsRight = point.x + offsetWidth <= innerWidth;
        // If it doesn't fit underneath us, position it at the bottom of the screen, unless
        // the clicked item is close to the bottom (in which case, position it above so
        // the item will still be visible.)
        if (!fitsBelow) {
            point.y = (bottom > innerHeight - (bottom - top)) ? top + vOverlap : innerHeight;
        }
        // If it doesn't fit to the right, then position it at the right edge of the screen,
        // so long as it fits entirely above or below us.  Otherwise, position it using the
        // item center, so at least one side of the previous menu/item will still be seen.
        if (!fitsRight) {
            point.x = (offsetHeight < (bottom - vOverlap) || fitsBelow) ? innerWidth : centerX;
        }
        // Done!  Show our work.
        this.showAtPosition(point);
        // Flag the clicked item as active, until we close
        target.toggleClass("is-active", true);
        this.onHide(() => target.toggleClass("is-active", false));
        return this;
    }
}

function optName(name) {
    return i18next.t(`plugins.file-explorer.menu-opt-${name}`);
}
class ContextMenu extends PopupMenu {
    constructor(parent, file) {
        super(parent);
        const { workspace } = this.app;
        const haveFileExplorer = this.app.internalPlugins.plugins["file-explorer"].enabled;
        if (file instanceof obsidian.TFolder) {
            this.addItem(i => i.setTitle(optName("new-note")).setIcon("create-new").onClick(async (e) => {
                const newFile = await this.app.fileManager.createNewMarkdownFile(file);
                if (newFile)
                    await this.app.workspace.getLeaf(obsidian.Keymap.isModifier(e, "Mod")).openFile(newFile, {
                        active: !0, state: { mode: "source" }, eState: { rename: "all" }
                    });
            }));
            this.addItem(i => i.setTitle(optName("new-folder")).setIcon("folder").setDisabled(!haveFileExplorer).onClick(event => {
                if (haveFileExplorer) {
                    this.withExplorer(file)?.createAbstractFile("folder", file);
                }
                else {
                    new obsidian.Notice("The File Explorer core plugin must be enabled to rename folders");
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
            i.setDisabled(file instanceof obsidian.TFolder && !haveFileExplorer);
            i.setTitle(optName("rename")).setIcon("pencil").onClick(event => {
                if (file instanceof obsidian.TFile) {
                    this.app.fileManager.promptForFileRename(file);
                }
                else if (haveFileExplorer) {
                    this.withExplorer(file)?.startRenameFile(file);
                }
                else {
                    new obsidian.Notice("The File Explorer core plugin must be enabled to rename folders");
                    event.stopPropagation();
                }
            });
        });
        this.addItem(i => i.setTitle(optName("delete")).setIcon("trash").onClick(() => {
            if (file instanceof obsidian.TFolder) {
                this.app.fileManager.promptForFolderDeletion(file);
            }
            else if (file instanceof obsidian.TFile) {
                this.app.fileManager.promptForFileDeletion(file);
            }
        }));
        if (file instanceof obsidian.TFolder && haveFileExplorer) {
            this.addItem(i => i.setIcon("folder").setTitle(i18next.t('plugins.file-explorer.action-reveal-file')).onClick(() => {
                this.withExplorer(file);
            }));
        }
        if (file === workspace.getActiveFile()) {
            workspace.trigger("file-menu", this, file, "quick-explorer", workspace.activeLeaf);
        }
        else {
            workspace.trigger("file-menu", this, file, "quick-explorer");
        }
    }
    withExplorer(file) {
        const explorer = this.app.internalPlugins.plugins["file-explorer"];
        if (explorer.enabled) {
            explorer.instance.revealInFolder(file);
            return this.app.workspace.getLeavesOfType("file-explorer")[0].view;
        }
    }
}

const previewIcons = {
    markdown: "document",
    image: "image-file",
    audio: "audio-file",
    pdf: "pdf-file",
};
const viewtypeIcons = {
    ...previewIcons,
    // ass third-party plugins
    excalidraw: "excalidraw-icon",
};
function fileIcon(app, file) {
    if (file instanceof obsidian.TFolder)
        return "folder";
    if (file instanceof obsidian.TFile) {
        const viewType = app.viewRegistry.getTypeByExtension(file.extension);
        if (viewType)
            return viewtypeIcons[viewType] ?? "document";
    }
}
class FolderMenu extends PopupMenu {
    constructor(parent, folder, selected) {
        super(parent);
        this.parent = parent;
        this.folder = folder;
        this.selected = selected;
        this.parentFolder = this.parent instanceof FolderMenu ? this.parent.folder : null;
        this.lastOver = null;
        this.onItemHover = (event, targetEl) => {
            const { filePath } = targetEl.dataset;
            const file = this.app.vault.getAbstractFileByPath(filePath);
            if (!file)
                return;
            if (targetEl != this.lastOver) {
                this.setChildMenu(); // close submenu
                this.lastOver = targetEl;
            }
            if (file instanceof obsidian.TFile && previewIcons[this.app.viewRegistry.getTypeByExtension(file.extension)]) {
                this.app.workspace.trigger('hover-link', {
                    event, source: hoverSource, hoverParent: this.dom, targetEl, linktext: filePath
                });
            }
        };
        this.onItemClick = (event, target) => {
            const { filePath } = target.dataset;
            const file = this.app.vault.getAbstractFileByPath(filePath);
            this.lastOver = target;
            if (!file)
                return;
            if (file instanceof obsidian.TFile) {
                if (this.app.viewRegistry.isExtensionRegistered(file.extension)) {
                    this.app.workspace.openLinkText(file.path, "", obsidian.Keymap.isModifier(event, "Mod"));
                    return;
                }
                else {
                    new obsidian.Notice(`.${file.extension} files cannot be opened in Obsidian; Use "Open in Default App" to open them externally`);
                    // fall through
                }
            }
            else if (file === this.parentFolder) {
                this.hide();
            }
            else {
                const folderMenu = new FolderMenu(this, file, this.folder);
                folderMenu.cascade(target, event);
            }
            // Keep current menu tree open
            event.stopPropagation();
            event.preventDefault();
            return false;
        };
        this.onItemMenu = (event, target) => {
            const { filePath } = target.dataset;
            const file = this.app.vault.getAbstractFileByPath(filePath);
            if (file) {
                this.lastOver = target;
                new ContextMenu(this, file).cascade(target, event);
                // Keep current menu tree open
                event.stopPropagation();
            }
        };
        this.loadFiles(folder);
        const { dom } = this;
        dom.style.setProperty(
        // Allow popovers (hover preview) to overlay this menu
        "--layer-menu", "" + (parseInt(getComputedStyle(document.body).getPropertyValue("--layer-popover")) - 1));
        const menuItem = ".menu-item[data-file-path]";
        dom.on("click", menuItem, this.onItemClick, true);
        dom.on("contextmenu", menuItem, this.onItemMenu);
        dom.on('mouseover', menuItem, this.onItemHover);
        dom.on('dragstart', menuItem, (event, target) => {
            startDrag(this.app, target.dataset.filePath, event);
        });
    }
    loadFiles(folder) {
        const { children, parent } = folder;
        // XXX sort children by name
        const folders = children.filter(f => f instanceof obsidian.TFolder);
        const files = children.filter(f => f instanceof obsidian.TFile); // XXX && (allFiles || fileIcon(f))
        if (parent)
            folders.unshift(parent);
        folders.map(this.addFile, this);
        if (folders.length && files.length)
            this.addSeparator();
        files.map(this.addFile, this);
    }
    addFile(file) {
        const icon = fileIcon(this.app, file);
        this.addItem(i => {
            i.setTitle((file === this.folder.parent) ? ".." : file.name);
            i.dom.dataset.filePath = file.path;
            i.dom.setAttr("draggable", "true");
            if (icon)
                i.setIcon(icon);
            if (file instanceof obsidian.TFile) {
                i.setTitle(file.basename);
                if (file.extension !== "md")
                    i.dom.createDiv({ text: file.extension, cls: "nav-file-tag" });
            }
            if (file === this.selected)
                i.dom.addClass("is-active");
        });
    }
}

const hoverSource = "quick-explorer:folder-menu";
function startDrag(app, path, event) {
    if (!path || path === "/")
        return;
    const file = app.vault.getAbstractFileByPath(path);
    if (!file)
        return;
    const { dragManager } = app;
    const dragData = file instanceof obsidian.TFile ? dragManager.dragFile(event, file) : dragManager.dragFolder(event, file);
    dragManager.onDragStart(event, dragData);
}
class Explorable {
    constructor() {
        this.el = el("span", { draggable: true, class: "explorable titlebar-button" });
    }
    update(data, index, items) {
        const { file, path } = data;
        let name = file.name || path;
        if (index < items.length - 1)
            name += "\u00A0/\u00A0";
        this.el.textContent = name;
        this.el.dataset.parentPath = file.parent?.path ?? "/";
        this.el.dataset.filePath = path;
    }
}
class Explorer {
    constructor(app) {
        this.app = app;
        this.lastFile = null;
        this.lastPath = null;
        this.el = el("div", { id: "quick-explorer" });
        this.list = list(this.el, Explorable);
        this.el.on("contextmenu", ".explorable", (event, target) => {
            const { filePath } = target.dataset;
            const file = app.vault.getAbstractFileByPath(filePath);
            new ContextMenu(app, file).cascade(target, event);
        });
        this.el.on("click", ".explorable", (event, target) => {
            const { parentPath, filePath } = target.dataset;
            const folder = app.vault.getAbstractFileByPath(parentPath);
            const selected = app.vault.getAbstractFileByPath(filePath);
            new FolderMenu(app, folder, selected).cascade(target, event.isTrusted && event);
        });
        this.el.on('dragstart', ".explorable", (event, target) => {
            startDrag(app, target.dataset.filePath, event);
        });
    }
    browseVault() {
        this.el.firstElementChild.click();
    }
    browseCurrent() {
        this.el.lastElementChild.click();
    }
    update(file) {
        file ?? (file = this.app.vault.getAbstractFileByPath("/"));
        if (file == this.lastFile && file.path == this.lastPath)
            return;
        this.lastFile = file;
        this.lastPath = file.path;
        const parts = [];
        while (file) {
            parts.unshift({ file, path: file.path });
            file = file.parent;
        }
        if (parts.length > 1)
            parts.shift();
        this.list.update(parts);
    }
}

class quickExplorer extends obsidian.Plugin {
    onload() {
        this.app.workspace.onLayoutReady(() => {
            const buttonContainer = document.body.find(".titlebar .titlebar-button-container.mod-left");
            this.register(() => unmount(buttonContainer, this.explorer));
            mount(buttonContainer, this.explorer = new Explorer(this.app));
            this.explorer.update(this.app.workspace.getActiveFile());
        });
        this.registerEvent(this.app.workspace.on("file-open", this.explorer.update, this.explorer));
        this.registerEvent(this.app.vault.on("rename", this.onFileChange, this));
        this.registerEvent(this.app.vault.on("delete", this.onFileChange, this));
        this.app.workspace.registerHoverLinkSource(hoverSource, {
            display: 'Quick Explorer', defaultMod: true
        });
        this.addCommand({ id: "browse-vault", name: "Browse vault", callback: () => { this.explorer?.browseVault(); }, });
        this.addCommand({ id: "browse-current", name: "Browse current folder", callback: () => { this.explorer?.browseCurrent(); }, });
    }
    onunload() {
        this.app.workspace.unregisterHoverLinkSource(hoverSource);
    }
    onFileChange(file) {
        if (file === this.explorer.lastFile)
            this.explorer.update(file);
    }
}

module.exports = quickExplorer;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWFpbi5qcyIsInNvdXJjZXMiOlsiLnlhcm4vY2FjaGUvcmVkb20tbnBtLTMuMjcuMS0xNDhjZWZjMzI2LWY2OWI3YTVmMzQuemlwL25vZGVfbW9kdWxlcy9yZWRvbS9kaXN0L3JlZG9tLmVzLmpzIiwiLnlhcm4vY2FjaGUvbW9ua2V5LWFyb3VuZC1ucG0tMi4xLjAtNzBkZjMyZDJhYy0xYmQ3MmQyNWY5LnppcC9ub2RlX21vZHVsZXMvbW9ua2V5LWFyb3VuZC9tanMvaW5kZXguanMiLCJzcmMvbWVudXMudHMiLCJzcmMvQ29udGV4dE1lbnUudHMiLCJzcmMvRm9sZGVyTWVudS50cyIsInNyYy9FeHBsb3Jlci50c3giLCJzcmMvcXVpY2stZXhwbG9yZXIudHN4Il0sInNvdXJjZXNDb250ZW50IjpbImZ1bmN0aW9uIHBhcnNlUXVlcnkgKHF1ZXJ5KSB7XG4gIHZhciBjaHVua3MgPSBxdWVyeS5zcGxpdCgvKFsjLl0pLyk7XG4gIHZhciB0YWdOYW1lID0gJyc7XG4gIHZhciBpZCA9ICcnO1xuICB2YXIgY2xhc3NOYW1lcyA9IFtdO1xuXG4gIGZvciAodmFyIGkgPSAwOyBpIDwgY2h1bmtzLmxlbmd0aDsgaSsrKSB7XG4gICAgdmFyIGNodW5rID0gY2h1bmtzW2ldO1xuICAgIGlmIChjaHVuayA9PT0gJyMnKSB7XG4gICAgICBpZCA9IGNodW5rc1srK2ldO1xuICAgIH0gZWxzZSBpZiAoY2h1bmsgPT09ICcuJykge1xuICAgICAgY2xhc3NOYW1lcy5wdXNoKGNodW5rc1srK2ldKTtcbiAgICB9IGVsc2UgaWYgKGNodW5rLmxlbmd0aCkge1xuICAgICAgdGFnTmFtZSA9IGNodW5rO1xuICAgIH1cbiAgfVxuXG4gIHJldHVybiB7XG4gICAgdGFnOiB0YWdOYW1lIHx8ICdkaXYnLFxuICAgIGlkOiBpZCxcbiAgICBjbGFzc05hbWU6IGNsYXNzTmFtZXMuam9pbignICcpXG4gIH07XG59XG5cbmZ1bmN0aW9uIGNyZWF0ZUVsZW1lbnQgKHF1ZXJ5LCBucykge1xuICB2YXIgcmVmID0gcGFyc2VRdWVyeShxdWVyeSk7XG4gIHZhciB0YWcgPSByZWYudGFnO1xuICB2YXIgaWQgPSByZWYuaWQ7XG4gIHZhciBjbGFzc05hbWUgPSByZWYuY2xhc3NOYW1lO1xuICB2YXIgZWxlbWVudCA9IG5zID8gZG9jdW1lbnQuY3JlYXRlRWxlbWVudE5TKG5zLCB0YWcpIDogZG9jdW1lbnQuY3JlYXRlRWxlbWVudCh0YWcpO1xuXG4gIGlmIChpZCkge1xuICAgIGVsZW1lbnQuaWQgPSBpZDtcbiAgfVxuXG4gIGlmIChjbGFzc05hbWUpIHtcbiAgICBpZiAobnMpIHtcbiAgICAgIGVsZW1lbnQuc2V0QXR0cmlidXRlKCdjbGFzcycsIGNsYXNzTmFtZSk7XG4gICAgfSBlbHNlIHtcbiAgICAgIGVsZW1lbnQuY2xhc3NOYW1lID0gY2xhc3NOYW1lO1xuICAgIH1cbiAgfVxuXG4gIHJldHVybiBlbGVtZW50O1xufVxuXG5mdW5jdGlvbiB1bm1vdW50IChwYXJlbnQsIGNoaWxkKSB7XG4gIHZhciBwYXJlbnRFbCA9IGdldEVsKHBhcmVudCk7XG4gIHZhciBjaGlsZEVsID0gZ2V0RWwoY2hpbGQpO1xuXG4gIGlmIChjaGlsZCA9PT0gY2hpbGRFbCAmJiBjaGlsZEVsLl9fcmVkb21fdmlldykge1xuICAgIC8vIHRyeSB0byBsb29rIHVwIHRoZSB2aWV3IGlmIG5vdCBwcm92aWRlZFxuICAgIGNoaWxkID0gY2hpbGRFbC5fX3JlZG9tX3ZpZXc7XG4gIH1cblxuICBpZiAoY2hpbGRFbC5wYXJlbnROb2RlKSB7XG4gICAgZG9Vbm1vdW50KGNoaWxkLCBjaGlsZEVsLCBwYXJlbnRFbCk7XG5cbiAgICBwYXJlbnRFbC5yZW1vdmVDaGlsZChjaGlsZEVsKTtcbiAgfVxuXG4gIHJldHVybiBjaGlsZDtcbn1cblxuZnVuY3Rpb24gZG9Vbm1vdW50IChjaGlsZCwgY2hpbGRFbCwgcGFyZW50RWwpIHtcbiAgdmFyIGhvb2tzID0gY2hpbGRFbC5fX3JlZG9tX2xpZmVjeWNsZTtcblxuICBpZiAoaG9va3NBcmVFbXB0eShob29rcykpIHtcbiAgICBjaGlsZEVsLl9fcmVkb21fbGlmZWN5Y2xlID0ge307XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgdmFyIHRyYXZlcnNlID0gcGFyZW50RWw7XG5cbiAgaWYgKGNoaWxkRWwuX19yZWRvbV9tb3VudGVkKSB7XG4gICAgdHJpZ2dlcihjaGlsZEVsLCAnb251bm1vdW50Jyk7XG4gIH1cblxuICB3aGlsZSAodHJhdmVyc2UpIHtcbiAgICB2YXIgcGFyZW50SG9va3MgPSB0cmF2ZXJzZS5fX3JlZG9tX2xpZmVjeWNsZSB8fCB7fTtcblxuICAgIGZvciAodmFyIGhvb2sgaW4gaG9va3MpIHtcbiAgICAgIGlmIChwYXJlbnRIb29rc1tob29rXSkge1xuICAgICAgICBwYXJlbnRIb29rc1tob29rXSAtPSBob29rc1tob29rXTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICBpZiAoaG9va3NBcmVFbXB0eShwYXJlbnRIb29rcykpIHtcbiAgICAgIHRyYXZlcnNlLl9fcmVkb21fbGlmZWN5Y2xlID0gbnVsbDtcbiAgICB9XG5cbiAgICB0cmF2ZXJzZSA9IHRyYXZlcnNlLnBhcmVudE5vZGU7XG4gIH1cbn1cblxuZnVuY3Rpb24gaG9va3NBcmVFbXB0eSAoaG9va3MpIHtcbiAgaWYgKGhvb2tzID09IG51bGwpIHtcbiAgICByZXR1cm4gdHJ1ZTtcbiAgfVxuICBmb3IgKHZhciBrZXkgaW4gaG9va3MpIHtcbiAgICBpZiAoaG9va3Nba2V5XSkge1xuICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cbiAgfVxuICByZXR1cm4gdHJ1ZTtcbn1cblxuLyogZ2xvYmFsIE5vZGUsIFNoYWRvd1Jvb3QgKi9cblxudmFyIGhvb2tOYW1lcyA9IFsnb25tb3VudCcsICdvbnJlbW91bnQnLCAnb251bm1vdW50J107XG52YXIgc2hhZG93Um9vdEF2YWlsYWJsZSA9IHR5cGVvZiB3aW5kb3cgIT09ICd1bmRlZmluZWQnICYmICdTaGFkb3dSb290JyBpbiB3aW5kb3c7XG5cbmZ1bmN0aW9uIG1vdW50IChwYXJlbnQsIGNoaWxkLCBiZWZvcmUsIHJlcGxhY2UpIHtcbiAgdmFyIHBhcmVudEVsID0gZ2V0RWwocGFyZW50KTtcbiAgdmFyIGNoaWxkRWwgPSBnZXRFbChjaGlsZCk7XG5cbiAgaWYgKGNoaWxkID09PSBjaGlsZEVsICYmIGNoaWxkRWwuX19yZWRvbV92aWV3KSB7XG4gICAgLy8gdHJ5IHRvIGxvb2sgdXAgdGhlIHZpZXcgaWYgbm90IHByb3ZpZGVkXG4gICAgY2hpbGQgPSBjaGlsZEVsLl9fcmVkb21fdmlldztcbiAgfVxuXG4gIGlmIChjaGlsZCAhPT0gY2hpbGRFbCkge1xuICAgIGNoaWxkRWwuX19yZWRvbV92aWV3ID0gY2hpbGQ7XG4gIH1cblxuICB2YXIgd2FzTW91bnRlZCA9IGNoaWxkRWwuX19yZWRvbV9tb3VudGVkO1xuICB2YXIgb2xkUGFyZW50ID0gY2hpbGRFbC5wYXJlbnROb2RlO1xuXG4gIGlmICh3YXNNb3VudGVkICYmIChvbGRQYXJlbnQgIT09IHBhcmVudEVsKSkge1xuICAgIGRvVW5tb3VudChjaGlsZCwgY2hpbGRFbCwgb2xkUGFyZW50KTtcbiAgfVxuXG4gIGlmIChiZWZvcmUgIT0gbnVsbCkge1xuICAgIGlmIChyZXBsYWNlKSB7XG4gICAgICBwYXJlbnRFbC5yZXBsYWNlQ2hpbGQoY2hpbGRFbCwgZ2V0RWwoYmVmb3JlKSk7XG4gICAgfSBlbHNlIHtcbiAgICAgIHBhcmVudEVsLmluc2VydEJlZm9yZShjaGlsZEVsLCBnZXRFbChiZWZvcmUpKTtcbiAgICB9XG4gIH0gZWxzZSB7XG4gICAgcGFyZW50RWwuYXBwZW5kQ2hpbGQoY2hpbGRFbCk7XG4gIH1cblxuICBkb01vdW50KGNoaWxkLCBjaGlsZEVsLCBwYXJlbnRFbCwgb2xkUGFyZW50KTtcblxuICByZXR1cm4gY2hpbGQ7XG59XG5cbmZ1bmN0aW9uIHRyaWdnZXIgKGVsLCBldmVudE5hbWUpIHtcbiAgaWYgKGV2ZW50TmFtZSA9PT0gJ29ubW91bnQnIHx8IGV2ZW50TmFtZSA9PT0gJ29ucmVtb3VudCcpIHtcbiAgICBlbC5fX3JlZG9tX21vdW50ZWQgPSB0cnVlO1xuICB9IGVsc2UgaWYgKGV2ZW50TmFtZSA9PT0gJ29udW5tb3VudCcpIHtcbiAgICBlbC5fX3JlZG9tX21vdW50ZWQgPSBmYWxzZTtcbiAgfVxuXG4gIHZhciBob29rcyA9IGVsLl9fcmVkb21fbGlmZWN5Y2xlO1xuXG4gIGlmICghaG9va3MpIHtcbiAgICByZXR1cm47XG4gIH1cblxuICB2YXIgdmlldyA9IGVsLl9fcmVkb21fdmlldztcbiAgdmFyIGhvb2tDb3VudCA9IDA7XG5cbiAgdmlldyAmJiB2aWV3W2V2ZW50TmFtZV0gJiYgdmlld1tldmVudE5hbWVdKCk7XG5cbiAgZm9yICh2YXIgaG9vayBpbiBob29rcykge1xuICAgIGlmIChob29rKSB7XG4gICAgICBob29rQ291bnQrKztcbiAgICB9XG4gIH1cblxuICBpZiAoaG9va0NvdW50KSB7XG4gICAgdmFyIHRyYXZlcnNlID0gZWwuZmlyc3RDaGlsZDtcblxuICAgIHdoaWxlICh0cmF2ZXJzZSkge1xuICAgICAgdmFyIG5leHQgPSB0cmF2ZXJzZS5uZXh0U2libGluZztcblxuICAgICAgdHJpZ2dlcih0cmF2ZXJzZSwgZXZlbnROYW1lKTtcblxuICAgICAgdHJhdmVyc2UgPSBuZXh0O1xuICAgIH1cbiAgfVxufVxuXG5mdW5jdGlvbiBkb01vdW50IChjaGlsZCwgY2hpbGRFbCwgcGFyZW50RWwsIG9sZFBhcmVudCkge1xuICB2YXIgaG9va3MgPSBjaGlsZEVsLl9fcmVkb21fbGlmZWN5Y2xlIHx8IChjaGlsZEVsLl9fcmVkb21fbGlmZWN5Y2xlID0ge30pO1xuICB2YXIgcmVtb3VudCA9IChwYXJlbnRFbCA9PT0gb2xkUGFyZW50KTtcbiAgdmFyIGhvb2tzRm91bmQgPSBmYWxzZTtcblxuICBmb3IgKHZhciBpID0gMCwgbGlzdCA9IGhvb2tOYW1lczsgaSA8IGxpc3QubGVuZ3RoOyBpICs9IDEpIHtcbiAgICB2YXIgaG9va05hbWUgPSBsaXN0W2ldO1xuXG4gICAgaWYgKCFyZW1vdW50KSB7IC8vIGlmIGFscmVhZHkgbW91bnRlZCwgc2tpcCB0aGlzIHBoYXNlXG4gICAgICBpZiAoY2hpbGQgIT09IGNoaWxkRWwpIHsgLy8gb25seSBWaWV3cyBjYW4gaGF2ZSBsaWZlY3ljbGUgZXZlbnRzXG4gICAgICAgIGlmIChob29rTmFtZSBpbiBjaGlsZCkge1xuICAgICAgICAgIGhvb2tzW2hvb2tOYW1lXSA9IChob29rc1tob29rTmFtZV0gfHwgMCkgKyAxO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuICAgIGlmIChob29rc1tob29rTmFtZV0pIHtcbiAgICAgIGhvb2tzRm91bmQgPSB0cnVlO1xuICAgIH1cbiAgfVxuXG4gIGlmICghaG9va3NGb3VuZCkge1xuICAgIGNoaWxkRWwuX19yZWRvbV9saWZlY3ljbGUgPSB7fTtcbiAgICByZXR1cm47XG4gIH1cblxuICB2YXIgdHJhdmVyc2UgPSBwYXJlbnRFbDtcbiAgdmFyIHRyaWdnZXJlZCA9IGZhbHNlO1xuXG4gIGlmIChyZW1vdW50IHx8ICh0cmF2ZXJzZSAmJiB0cmF2ZXJzZS5fX3JlZG9tX21vdW50ZWQpKSB7XG4gICAgdHJpZ2dlcihjaGlsZEVsLCByZW1vdW50ID8gJ29ucmVtb3VudCcgOiAnb25tb3VudCcpO1xuICAgIHRyaWdnZXJlZCA9IHRydWU7XG4gIH1cblxuICB3aGlsZSAodHJhdmVyc2UpIHtcbiAgICB2YXIgcGFyZW50ID0gdHJhdmVyc2UucGFyZW50Tm9kZTtcbiAgICB2YXIgcGFyZW50SG9va3MgPSB0cmF2ZXJzZS5fX3JlZG9tX2xpZmVjeWNsZSB8fCAodHJhdmVyc2UuX19yZWRvbV9saWZlY3ljbGUgPSB7fSk7XG5cbiAgICBmb3IgKHZhciBob29rIGluIGhvb2tzKSB7XG4gICAgICBwYXJlbnRIb29rc1tob29rXSA9IChwYXJlbnRIb29rc1tob29rXSB8fCAwKSArIGhvb2tzW2hvb2tdO1xuICAgIH1cblxuICAgIGlmICh0cmlnZ2VyZWQpIHtcbiAgICAgIGJyZWFrO1xuICAgIH0gZWxzZSB7XG4gICAgICBpZiAodHJhdmVyc2Uubm9kZVR5cGUgPT09IE5vZGUuRE9DVU1FTlRfTk9ERSB8fFxuICAgICAgICAoc2hhZG93Um9vdEF2YWlsYWJsZSAmJiAodHJhdmVyc2UgaW5zdGFuY2VvZiBTaGFkb3dSb290KSkgfHxcbiAgICAgICAgKHBhcmVudCAmJiBwYXJlbnQuX19yZWRvbV9tb3VudGVkKVxuICAgICAgKSB7XG4gICAgICAgIHRyaWdnZXIodHJhdmVyc2UsIHJlbW91bnQgPyAnb25yZW1vdW50JyA6ICdvbm1vdW50Jyk7XG4gICAgICAgIHRyaWdnZXJlZCA9IHRydWU7XG4gICAgICB9XG4gICAgICB0cmF2ZXJzZSA9IHBhcmVudDtcbiAgICB9XG4gIH1cbn1cblxuZnVuY3Rpb24gc2V0U3R5bGUgKHZpZXcsIGFyZzEsIGFyZzIpIHtcbiAgdmFyIGVsID0gZ2V0RWwodmlldyk7XG5cbiAgaWYgKHR5cGVvZiBhcmcxID09PSAnb2JqZWN0Jykge1xuICAgIGZvciAodmFyIGtleSBpbiBhcmcxKSB7XG4gICAgICBzZXRTdHlsZVZhbHVlKGVsLCBrZXksIGFyZzFba2V5XSk7XG4gICAgfVxuICB9IGVsc2Uge1xuICAgIHNldFN0eWxlVmFsdWUoZWwsIGFyZzEsIGFyZzIpO1xuICB9XG59XG5cbmZ1bmN0aW9uIHNldFN0eWxlVmFsdWUgKGVsLCBrZXksIHZhbHVlKSB7XG4gIGlmICh2YWx1ZSA9PSBudWxsKSB7XG4gICAgZWwuc3R5bGVba2V5XSA9ICcnO1xuICB9IGVsc2Uge1xuICAgIGVsLnN0eWxlW2tleV0gPSB2YWx1ZTtcbiAgfVxufVxuXG4vKiBnbG9iYWwgU1ZHRWxlbWVudCAqL1xuXG52YXIgeGxpbmtucyA9ICdodHRwOi8vd3d3LnczLm9yZy8xOTk5L3hsaW5rJztcblxuZnVuY3Rpb24gc2V0QXR0ciAodmlldywgYXJnMSwgYXJnMikge1xuICBzZXRBdHRySW50ZXJuYWwodmlldywgYXJnMSwgYXJnMik7XG59XG5cbmZ1bmN0aW9uIHNldEF0dHJJbnRlcm5hbCAodmlldywgYXJnMSwgYXJnMiwgaW5pdGlhbCkge1xuICB2YXIgZWwgPSBnZXRFbCh2aWV3KTtcblxuICB2YXIgaXNPYmogPSB0eXBlb2YgYXJnMSA9PT0gJ29iamVjdCc7XG5cbiAgaWYgKGlzT2JqKSB7XG4gICAgZm9yICh2YXIga2V5IGluIGFyZzEpIHtcbiAgICAgIHNldEF0dHJJbnRlcm5hbChlbCwga2V5LCBhcmcxW2tleV0sIGluaXRpYWwpO1xuICAgIH1cbiAgfSBlbHNlIHtcbiAgICB2YXIgaXNTVkcgPSBlbCBpbnN0YW5jZW9mIFNWR0VsZW1lbnQ7XG4gICAgdmFyIGlzRnVuYyA9IHR5cGVvZiBhcmcyID09PSAnZnVuY3Rpb24nO1xuXG4gICAgaWYgKGFyZzEgPT09ICdzdHlsZScgJiYgdHlwZW9mIGFyZzIgPT09ICdvYmplY3QnKSB7XG4gICAgICBzZXRTdHlsZShlbCwgYXJnMik7XG4gICAgfSBlbHNlIGlmIChpc1NWRyAmJiBpc0Z1bmMpIHtcbiAgICAgIGVsW2FyZzFdID0gYXJnMjtcbiAgICB9IGVsc2UgaWYgKGFyZzEgPT09ICdkYXRhc2V0Jykge1xuICAgICAgc2V0RGF0YShlbCwgYXJnMik7XG4gICAgfSBlbHNlIGlmICghaXNTVkcgJiYgKGFyZzEgaW4gZWwgfHwgaXNGdW5jKSAmJiAoYXJnMSAhPT0gJ2xpc3QnKSkge1xuICAgICAgZWxbYXJnMV0gPSBhcmcyO1xuICAgIH0gZWxzZSB7XG4gICAgICBpZiAoaXNTVkcgJiYgKGFyZzEgPT09ICd4bGluaycpKSB7XG4gICAgICAgIHNldFhsaW5rKGVsLCBhcmcyKTtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuICAgICAgaWYgKGluaXRpYWwgJiYgYXJnMSA9PT0gJ2NsYXNzJykge1xuICAgICAgICBhcmcyID0gZWwuY2xhc3NOYW1lICsgJyAnICsgYXJnMjtcbiAgICAgIH1cbiAgICAgIGlmIChhcmcyID09IG51bGwpIHtcbiAgICAgICAgZWwucmVtb3ZlQXR0cmlidXRlKGFyZzEpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgZWwuc2V0QXR0cmlidXRlKGFyZzEsIGFyZzIpO1xuICAgICAgfVxuICAgIH1cbiAgfVxufVxuXG5mdW5jdGlvbiBzZXRYbGluayAoZWwsIGFyZzEsIGFyZzIpIHtcbiAgaWYgKHR5cGVvZiBhcmcxID09PSAnb2JqZWN0Jykge1xuICAgIGZvciAodmFyIGtleSBpbiBhcmcxKSB7XG4gICAgICBzZXRYbGluayhlbCwga2V5LCBhcmcxW2tleV0pO1xuICAgIH1cbiAgfSBlbHNlIHtcbiAgICBpZiAoYXJnMiAhPSBudWxsKSB7XG4gICAgICBlbC5zZXRBdHRyaWJ1dGVOUyh4bGlua25zLCBhcmcxLCBhcmcyKTtcbiAgICB9IGVsc2Uge1xuICAgICAgZWwucmVtb3ZlQXR0cmlidXRlTlMoeGxpbmtucywgYXJnMSwgYXJnMik7XG4gICAgfVxuICB9XG59XG5cbmZ1bmN0aW9uIHNldERhdGEgKGVsLCBhcmcxLCBhcmcyKSB7XG4gIGlmICh0eXBlb2YgYXJnMSA9PT0gJ29iamVjdCcpIHtcbiAgICBmb3IgKHZhciBrZXkgaW4gYXJnMSkge1xuICAgICAgc2V0RGF0YShlbCwga2V5LCBhcmcxW2tleV0pO1xuICAgIH1cbiAgfSBlbHNlIHtcbiAgICBpZiAoYXJnMiAhPSBudWxsKSB7XG4gICAgICBlbC5kYXRhc2V0W2FyZzFdID0gYXJnMjtcbiAgICB9IGVsc2Uge1xuICAgICAgZGVsZXRlIGVsLmRhdGFzZXRbYXJnMV07XG4gICAgfVxuICB9XG59XG5cbmZ1bmN0aW9uIHRleHQgKHN0cikge1xuICByZXR1cm4gZG9jdW1lbnQuY3JlYXRlVGV4dE5vZGUoKHN0ciAhPSBudWxsKSA/IHN0ciA6ICcnKTtcbn1cblxuZnVuY3Rpb24gcGFyc2VBcmd1bWVudHNJbnRlcm5hbCAoZWxlbWVudCwgYXJncywgaW5pdGlhbCkge1xuICBmb3IgKHZhciBpID0gMCwgbGlzdCA9IGFyZ3M7IGkgPCBsaXN0Lmxlbmd0aDsgaSArPSAxKSB7XG4gICAgdmFyIGFyZyA9IGxpc3RbaV07XG5cbiAgICBpZiAoYXJnICE9PSAwICYmICFhcmcpIHtcbiAgICAgIGNvbnRpbnVlO1xuICAgIH1cblxuICAgIHZhciB0eXBlID0gdHlwZW9mIGFyZztcblxuICAgIGlmICh0eXBlID09PSAnZnVuY3Rpb24nKSB7XG4gICAgICBhcmcoZWxlbWVudCk7XG4gICAgfSBlbHNlIGlmICh0eXBlID09PSAnc3RyaW5nJyB8fCB0eXBlID09PSAnbnVtYmVyJykge1xuICAgICAgZWxlbWVudC5hcHBlbmRDaGlsZCh0ZXh0KGFyZykpO1xuICAgIH0gZWxzZSBpZiAoaXNOb2RlKGdldEVsKGFyZykpKSB7XG4gICAgICBtb3VudChlbGVtZW50LCBhcmcpO1xuICAgIH0gZWxzZSBpZiAoYXJnLmxlbmd0aCkge1xuICAgICAgcGFyc2VBcmd1bWVudHNJbnRlcm5hbChlbGVtZW50LCBhcmcsIGluaXRpYWwpO1xuICAgIH0gZWxzZSBpZiAodHlwZSA9PT0gJ29iamVjdCcpIHtcbiAgICAgIHNldEF0dHJJbnRlcm5hbChlbGVtZW50LCBhcmcsIG51bGwsIGluaXRpYWwpO1xuICAgIH1cbiAgfVxufVxuXG5mdW5jdGlvbiBlbnN1cmVFbCAocGFyZW50KSB7XG4gIHJldHVybiB0eXBlb2YgcGFyZW50ID09PSAnc3RyaW5nJyA/IGh0bWwocGFyZW50KSA6IGdldEVsKHBhcmVudCk7XG59XG5cbmZ1bmN0aW9uIGdldEVsIChwYXJlbnQpIHtcbiAgcmV0dXJuIChwYXJlbnQubm9kZVR5cGUgJiYgcGFyZW50KSB8fCAoIXBhcmVudC5lbCAmJiBwYXJlbnQpIHx8IGdldEVsKHBhcmVudC5lbCk7XG59XG5cbmZ1bmN0aW9uIGlzTm9kZSAoYXJnKSB7XG4gIHJldHVybiBhcmcgJiYgYXJnLm5vZGVUeXBlO1xufVxuXG52YXIgaHRtbENhY2hlID0ge307XG5cbmZ1bmN0aW9uIGh0bWwgKHF1ZXJ5KSB7XG4gIHZhciBhcmdzID0gW10sIGxlbiA9IGFyZ3VtZW50cy5sZW5ndGggLSAxO1xuICB3aGlsZSAoIGxlbi0tID4gMCApIGFyZ3NbIGxlbiBdID0gYXJndW1lbnRzWyBsZW4gKyAxIF07XG5cbiAgdmFyIGVsZW1lbnQ7XG5cbiAgdmFyIHR5cGUgPSB0eXBlb2YgcXVlcnk7XG5cbiAgaWYgKHR5cGUgPT09ICdzdHJpbmcnKSB7XG4gICAgZWxlbWVudCA9IG1lbW9pemVIVE1MKHF1ZXJ5KS5jbG9uZU5vZGUoZmFsc2UpO1xuICB9IGVsc2UgaWYgKGlzTm9kZShxdWVyeSkpIHtcbiAgICBlbGVtZW50ID0gcXVlcnkuY2xvbmVOb2RlKGZhbHNlKTtcbiAgfSBlbHNlIGlmICh0eXBlID09PSAnZnVuY3Rpb24nKSB7XG4gICAgdmFyIFF1ZXJ5ID0gcXVlcnk7XG4gICAgZWxlbWVudCA9IG5ldyAoRnVuY3Rpb24ucHJvdG90eXBlLmJpbmQuYXBwbHkoIFF1ZXJ5LCBbIG51bGwgXS5jb25jYXQoIGFyZ3MpICkpO1xuICB9IGVsc2Uge1xuICAgIHRocm93IG5ldyBFcnJvcignQXQgbGVhc3Qgb25lIGFyZ3VtZW50IHJlcXVpcmVkJyk7XG4gIH1cblxuICBwYXJzZUFyZ3VtZW50c0ludGVybmFsKGdldEVsKGVsZW1lbnQpLCBhcmdzLCB0cnVlKTtcblxuICByZXR1cm4gZWxlbWVudDtcbn1cblxudmFyIGVsID0gaHRtbDtcbnZhciBoID0gaHRtbDtcblxuaHRtbC5leHRlbmQgPSBmdW5jdGlvbiBleHRlbmRIdG1sIChxdWVyeSkge1xuICB2YXIgYXJncyA9IFtdLCBsZW4gPSBhcmd1bWVudHMubGVuZ3RoIC0gMTtcbiAgd2hpbGUgKCBsZW4tLSA+IDAgKSBhcmdzWyBsZW4gXSA9IGFyZ3VtZW50c1sgbGVuICsgMSBdO1xuXG4gIHZhciBjbG9uZSA9IG1lbW9pemVIVE1MKHF1ZXJ5KTtcblxuICByZXR1cm4gaHRtbC5iaW5kLmFwcGx5KGh0bWwsIFsgdGhpcywgY2xvbmUgXS5jb25jYXQoIGFyZ3MgKSk7XG59O1xuXG5mdW5jdGlvbiBtZW1vaXplSFRNTCAocXVlcnkpIHtcbiAgcmV0dXJuIGh0bWxDYWNoZVtxdWVyeV0gfHwgKGh0bWxDYWNoZVtxdWVyeV0gPSBjcmVhdGVFbGVtZW50KHF1ZXJ5KSk7XG59XG5cbmZ1bmN0aW9uIHNldENoaWxkcmVuIChwYXJlbnQpIHtcbiAgdmFyIGNoaWxkcmVuID0gW10sIGxlbiA9IGFyZ3VtZW50cy5sZW5ndGggLSAxO1xuICB3aGlsZSAoIGxlbi0tID4gMCApIGNoaWxkcmVuWyBsZW4gXSA9IGFyZ3VtZW50c1sgbGVuICsgMSBdO1xuXG4gIHZhciBwYXJlbnRFbCA9IGdldEVsKHBhcmVudCk7XG4gIHZhciBjdXJyZW50ID0gdHJhdmVyc2UocGFyZW50LCBjaGlsZHJlbiwgcGFyZW50RWwuZmlyc3RDaGlsZCk7XG5cbiAgd2hpbGUgKGN1cnJlbnQpIHtcbiAgICB2YXIgbmV4dCA9IGN1cnJlbnQubmV4dFNpYmxpbmc7XG5cbiAgICB1bm1vdW50KHBhcmVudCwgY3VycmVudCk7XG5cbiAgICBjdXJyZW50ID0gbmV4dDtcbiAgfVxufVxuXG5mdW5jdGlvbiB0cmF2ZXJzZSAocGFyZW50LCBjaGlsZHJlbiwgX2N1cnJlbnQpIHtcbiAgdmFyIGN1cnJlbnQgPSBfY3VycmVudDtcblxuICB2YXIgY2hpbGRFbHMgPSBuZXcgQXJyYXkoY2hpbGRyZW4ubGVuZ3RoKTtcblxuICBmb3IgKHZhciBpID0gMDsgaSA8IGNoaWxkcmVuLmxlbmd0aDsgaSsrKSB7XG4gICAgY2hpbGRFbHNbaV0gPSBjaGlsZHJlbltpXSAmJiBnZXRFbChjaGlsZHJlbltpXSk7XG4gIH1cblxuICBmb3IgKHZhciBpJDEgPSAwOyBpJDEgPCBjaGlsZHJlbi5sZW5ndGg7IGkkMSsrKSB7XG4gICAgdmFyIGNoaWxkID0gY2hpbGRyZW5baSQxXTtcblxuICAgIGlmICghY2hpbGQpIHtcbiAgICAgIGNvbnRpbnVlO1xuICAgIH1cblxuICAgIHZhciBjaGlsZEVsID0gY2hpbGRFbHNbaSQxXTtcblxuICAgIGlmIChjaGlsZEVsID09PSBjdXJyZW50KSB7XG4gICAgICBjdXJyZW50ID0gY3VycmVudC5uZXh0U2libGluZztcbiAgICAgIGNvbnRpbnVlO1xuICAgIH1cblxuICAgIGlmIChpc05vZGUoY2hpbGRFbCkpIHtcbiAgICAgIHZhciBuZXh0ID0gY3VycmVudCAmJiBjdXJyZW50Lm5leHRTaWJsaW5nO1xuICAgICAgdmFyIGV4aXN0cyA9IGNoaWxkLl9fcmVkb21faW5kZXggIT0gbnVsbDtcbiAgICAgIHZhciByZXBsYWNlID0gZXhpc3RzICYmIG5leHQgPT09IGNoaWxkRWxzW2kkMSArIDFdO1xuXG4gICAgICBtb3VudChwYXJlbnQsIGNoaWxkLCBjdXJyZW50LCByZXBsYWNlKTtcblxuICAgICAgaWYgKHJlcGxhY2UpIHtcbiAgICAgICAgY3VycmVudCA9IG5leHQ7XG4gICAgICB9XG5cbiAgICAgIGNvbnRpbnVlO1xuICAgIH1cblxuICAgIGlmIChjaGlsZC5sZW5ndGggIT0gbnVsbCkge1xuICAgICAgY3VycmVudCA9IHRyYXZlcnNlKHBhcmVudCwgY2hpbGQsIGN1cnJlbnQpO1xuICAgIH1cbiAgfVxuXG4gIHJldHVybiBjdXJyZW50O1xufVxuXG5mdW5jdGlvbiBsaXN0UG9vbCAoVmlldywga2V5LCBpbml0RGF0YSkge1xuICByZXR1cm4gbmV3IExpc3RQb29sKFZpZXcsIGtleSwgaW5pdERhdGEpO1xufVxuXG52YXIgTGlzdFBvb2wgPSBmdW5jdGlvbiBMaXN0UG9vbCAoVmlldywga2V5LCBpbml0RGF0YSkge1xuICB0aGlzLlZpZXcgPSBWaWV3O1xuICB0aGlzLmluaXREYXRhID0gaW5pdERhdGE7XG4gIHRoaXMub2xkTG9va3VwID0ge307XG4gIHRoaXMubG9va3VwID0ge307XG4gIHRoaXMub2xkVmlld3MgPSBbXTtcbiAgdGhpcy52aWV3cyA9IFtdO1xuXG4gIGlmIChrZXkgIT0gbnVsbCkge1xuICAgIHRoaXMua2V5ID0gdHlwZW9mIGtleSA9PT0gJ2Z1bmN0aW9uJyA/IGtleSA6IHByb3BLZXkoa2V5KTtcbiAgfVxufTtcblxuTGlzdFBvb2wucHJvdG90eXBlLnVwZGF0ZSA9IGZ1bmN0aW9uIHVwZGF0ZSAoZGF0YSwgY29udGV4dCkge1xuICB2YXIgcmVmID0gdGhpcztcbiAgICB2YXIgVmlldyA9IHJlZi5WaWV3O1xuICAgIHZhciBrZXkgPSByZWYua2V5O1xuICAgIHZhciBpbml0RGF0YSA9IHJlZi5pbml0RGF0YTtcbiAgdmFyIGtleVNldCA9IGtleSAhPSBudWxsO1xuXG4gIHZhciBvbGRMb29rdXAgPSB0aGlzLmxvb2t1cDtcbiAgdmFyIG5ld0xvb2t1cCA9IHt9O1xuXG4gIHZhciBuZXdWaWV3cyA9IG5ldyBBcnJheShkYXRhLmxlbmd0aCk7XG4gIHZhciBvbGRWaWV3cyA9IHRoaXMudmlld3M7XG5cbiAgZm9yICh2YXIgaSA9IDA7IGkgPCBkYXRhLmxlbmd0aDsgaSsrKSB7XG4gICAgdmFyIGl0ZW0gPSBkYXRhW2ldO1xuICAgIHZhciB2aWV3ID0gKHZvaWQgMCk7XG5cbiAgICBpZiAoa2V5U2V0KSB7XG4gICAgICB2YXIgaWQgPSBrZXkoaXRlbSk7XG5cbiAgICAgIHZpZXcgPSBvbGRMb29rdXBbaWRdIHx8IG5ldyBWaWV3KGluaXREYXRhLCBpdGVtLCBpLCBkYXRhKTtcbiAgICAgIG5ld0xvb2t1cFtpZF0gPSB2aWV3O1xuICAgICAgdmlldy5fX3JlZG9tX2lkID0gaWQ7XG4gICAgfSBlbHNlIHtcbiAgICAgIHZpZXcgPSBvbGRWaWV3c1tpXSB8fCBuZXcgVmlldyhpbml0RGF0YSwgaXRlbSwgaSwgZGF0YSk7XG4gICAgfVxuICAgIHZpZXcudXBkYXRlICYmIHZpZXcudXBkYXRlKGl0ZW0sIGksIGRhdGEsIGNvbnRleHQpO1xuXG4gICAgdmFyIGVsID0gZ2V0RWwodmlldy5lbCk7XG5cbiAgICBlbC5fX3JlZG9tX3ZpZXcgPSB2aWV3O1xuICAgIG5ld1ZpZXdzW2ldID0gdmlldztcbiAgfVxuXG4gIHRoaXMub2xkVmlld3MgPSBvbGRWaWV3cztcbiAgdGhpcy52aWV3cyA9IG5ld1ZpZXdzO1xuXG4gIHRoaXMub2xkTG9va3VwID0gb2xkTG9va3VwO1xuICB0aGlzLmxvb2t1cCA9IG5ld0xvb2t1cDtcbn07XG5cbmZ1bmN0aW9uIHByb3BLZXkgKGtleSkge1xuICByZXR1cm4gZnVuY3Rpb24gKGl0ZW0pIHtcbiAgICByZXR1cm4gaXRlbVtrZXldO1xuICB9O1xufVxuXG5mdW5jdGlvbiBsaXN0IChwYXJlbnQsIFZpZXcsIGtleSwgaW5pdERhdGEpIHtcbiAgcmV0dXJuIG5ldyBMaXN0KHBhcmVudCwgVmlldywga2V5LCBpbml0RGF0YSk7XG59XG5cbnZhciBMaXN0ID0gZnVuY3Rpb24gTGlzdCAocGFyZW50LCBWaWV3LCBrZXksIGluaXREYXRhKSB7XG4gIHRoaXMuVmlldyA9IFZpZXc7XG4gIHRoaXMuaW5pdERhdGEgPSBpbml0RGF0YTtcbiAgdGhpcy52aWV3cyA9IFtdO1xuICB0aGlzLnBvb2wgPSBuZXcgTGlzdFBvb2woVmlldywga2V5LCBpbml0RGF0YSk7XG4gIHRoaXMuZWwgPSBlbnN1cmVFbChwYXJlbnQpO1xuICB0aGlzLmtleVNldCA9IGtleSAhPSBudWxsO1xufTtcblxuTGlzdC5wcm90b3R5cGUudXBkYXRlID0gZnVuY3Rpb24gdXBkYXRlIChkYXRhLCBjb250ZXh0KSB7XG4gICAgaWYgKCBkYXRhID09PSB2b2lkIDAgKSBkYXRhID0gW107XG5cbiAgdmFyIHJlZiA9IHRoaXM7XG4gICAgdmFyIGtleVNldCA9IHJlZi5rZXlTZXQ7XG4gIHZhciBvbGRWaWV3cyA9IHRoaXMudmlld3M7XG5cbiAgdGhpcy5wb29sLnVwZGF0ZShkYXRhLCBjb250ZXh0KTtcblxuICB2YXIgcmVmJDEgPSB0aGlzLnBvb2w7XG4gICAgdmFyIHZpZXdzID0gcmVmJDEudmlld3M7XG4gICAgdmFyIGxvb2t1cCA9IHJlZiQxLmxvb2t1cDtcblxuICBpZiAoa2V5U2V0KSB7XG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBvbGRWaWV3cy5sZW5ndGg7IGkrKykge1xuICAgICAgdmFyIG9sZFZpZXcgPSBvbGRWaWV3c1tpXTtcbiAgICAgIHZhciBpZCA9IG9sZFZpZXcuX19yZWRvbV9pZDtcblxuICAgICAgaWYgKGxvb2t1cFtpZF0gPT0gbnVsbCkge1xuICAgICAgICBvbGRWaWV3Ll9fcmVkb21faW5kZXggPSBudWxsO1xuICAgICAgICB1bm1vdW50KHRoaXMsIG9sZFZpZXcpO1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIGZvciAodmFyIGkkMSA9IDA7IGkkMSA8IHZpZXdzLmxlbmd0aDsgaSQxKyspIHtcbiAgICB2YXIgdmlldyA9IHZpZXdzW2kkMV07XG5cbiAgICB2aWV3Ll9fcmVkb21faW5kZXggPSBpJDE7XG4gIH1cblxuICBzZXRDaGlsZHJlbih0aGlzLCB2aWV3cyk7XG5cbiAgaWYgKGtleVNldCkge1xuICAgIHRoaXMubG9va3VwID0gbG9va3VwO1xuICB9XG4gIHRoaXMudmlld3MgPSB2aWV3cztcbn07XG5cbkxpc3QuZXh0ZW5kID0gZnVuY3Rpb24gZXh0ZW5kTGlzdCAocGFyZW50LCBWaWV3LCBrZXksIGluaXREYXRhKSB7XG4gIHJldHVybiBMaXN0LmJpbmQoTGlzdCwgcGFyZW50LCBWaWV3LCBrZXksIGluaXREYXRhKTtcbn07XG5cbmxpc3QuZXh0ZW5kID0gTGlzdC5leHRlbmQ7XG5cbi8qIGdsb2JhbCBOb2RlICovXG5cbmZ1bmN0aW9uIHBsYWNlIChWaWV3LCBpbml0RGF0YSkge1xuICByZXR1cm4gbmV3IFBsYWNlKFZpZXcsIGluaXREYXRhKTtcbn1cblxudmFyIFBsYWNlID0gZnVuY3Rpb24gUGxhY2UgKFZpZXcsIGluaXREYXRhKSB7XG4gIHRoaXMuZWwgPSB0ZXh0KCcnKTtcbiAgdGhpcy52aXNpYmxlID0gZmFsc2U7XG4gIHRoaXMudmlldyA9IG51bGw7XG4gIHRoaXMuX3BsYWNlaG9sZGVyID0gdGhpcy5lbDtcblxuICBpZiAoVmlldyBpbnN0YW5jZW9mIE5vZGUpIHtcbiAgICB0aGlzLl9lbCA9IFZpZXc7XG4gIH0gZWxzZSBpZiAoVmlldy5lbCBpbnN0YW5jZW9mIE5vZGUpIHtcbiAgICB0aGlzLl9lbCA9IFZpZXc7XG4gICAgdGhpcy52aWV3ID0gVmlldztcbiAgfSBlbHNlIHtcbiAgICB0aGlzLl9WaWV3ID0gVmlldztcbiAgfVxuXG4gIHRoaXMuX2luaXREYXRhID0gaW5pdERhdGE7XG59O1xuXG5QbGFjZS5wcm90b3R5cGUudXBkYXRlID0gZnVuY3Rpb24gdXBkYXRlICh2aXNpYmxlLCBkYXRhKSB7XG4gIHZhciBwbGFjZWhvbGRlciA9IHRoaXMuX3BsYWNlaG9sZGVyO1xuICB2YXIgcGFyZW50Tm9kZSA9IHRoaXMuZWwucGFyZW50Tm9kZTtcblxuICBpZiAodmlzaWJsZSkge1xuICAgIGlmICghdGhpcy52aXNpYmxlKSB7XG4gICAgICBpZiAodGhpcy5fZWwpIHtcbiAgICAgICAgbW91bnQocGFyZW50Tm9kZSwgdGhpcy5fZWwsIHBsYWNlaG9sZGVyKTtcbiAgICAgICAgdW5tb3VudChwYXJlbnROb2RlLCBwbGFjZWhvbGRlcik7XG5cbiAgICAgICAgdGhpcy5lbCA9IGdldEVsKHRoaXMuX2VsKTtcbiAgICAgICAgdGhpcy52aXNpYmxlID0gdmlzaWJsZTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHZhciBWaWV3ID0gdGhpcy5fVmlldztcbiAgICAgICAgdmFyIHZpZXcgPSBuZXcgVmlldyh0aGlzLl9pbml0RGF0YSk7XG5cbiAgICAgICAgdGhpcy5lbCA9IGdldEVsKHZpZXcpO1xuICAgICAgICB0aGlzLnZpZXcgPSB2aWV3O1xuXG4gICAgICAgIG1vdW50KHBhcmVudE5vZGUsIHZpZXcsIHBsYWNlaG9sZGVyKTtcbiAgICAgICAgdW5tb3VudChwYXJlbnROb2RlLCBwbGFjZWhvbGRlcik7XG4gICAgICB9XG4gICAgfVxuICAgIHRoaXMudmlldyAmJiB0aGlzLnZpZXcudXBkYXRlICYmIHRoaXMudmlldy51cGRhdGUoZGF0YSk7XG4gIH0gZWxzZSB7XG4gICAgaWYgKHRoaXMudmlzaWJsZSkge1xuICAgICAgaWYgKHRoaXMuX2VsKSB7XG4gICAgICAgIG1vdW50KHBhcmVudE5vZGUsIHBsYWNlaG9sZGVyLCB0aGlzLl9lbCk7XG4gICAgICAgIHVubW91bnQocGFyZW50Tm9kZSwgdGhpcy5fZWwpO1xuXG4gICAgICAgIHRoaXMuZWwgPSBwbGFjZWhvbGRlcjtcbiAgICAgICAgdGhpcy52aXNpYmxlID0gdmlzaWJsZTtcblxuICAgICAgICByZXR1cm47XG4gICAgICB9XG4gICAgICBtb3VudChwYXJlbnROb2RlLCBwbGFjZWhvbGRlciwgdGhpcy52aWV3KTtcbiAgICAgIHVubW91bnQocGFyZW50Tm9kZSwgdGhpcy52aWV3KTtcblxuICAgICAgdGhpcy5lbCA9IHBsYWNlaG9sZGVyO1xuICAgICAgdGhpcy52aWV3ID0gbnVsbDtcbiAgICB9XG4gIH1cbiAgdGhpcy52aXNpYmxlID0gdmlzaWJsZTtcbn07XG5cbi8qIGdsb2JhbCBOb2RlICovXG5cbmZ1bmN0aW9uIHJvdXRlciAocGFyZW50LCBWaWV3cywgaW5pdERhdGEpIHtcbiAgcmV0dXJuIG5ldyBSb3V0ZXIocGFyZW50LCBWaWV3cywgaW5pdERhdGEpO1xufVxuXG52YXIgUm91dGVyID0gZnVuY3Rpb24gUm91dGVyIChwYXJlbnQsIFZpZXdzLCBpbml0RGF0YSkge1xuICB0aGlzLmVsID0gZW5zdXJlRWwocGFyZW50KTtcbiAgdGhpcy5WaWV3cyA9IFZpZXdzO1xuICB0aGlzLmluaXREYXRhID0gaW5pdERhdGE7XG59O1xuXG5Sb3V0ZXIucHJvdG90eXBlLnVwZGF0ZSA9IGZ1bmN0aW9uIHVwZGF0ZSAocm91dGUsIGRhdGEpIHtcbiAgaWYgKHJvdXRlICE9PSB0aGlzLnJvdXRlKSB7XG4gICAgdmFyIFZpZXdzID0gdGhpcy5WaWV3cztcbiAgICB2YXIgVmlldyA9IFZpZXdzW3JvdXRlXTtcblxuICAgIHRoaXMucm91dGUgPSByb3V0ZTtcblxuICAgIGlmIChWaWV3ICYmIChWaWV3IGluc3RhbmNlb2YgTm9kZSB8fCBWaWV3LmVsIGluc3RhbmNlb2YgTm9kZSkpIHtcbiAgICAgIHRoaXMudmlldyA9IFZpZXc7XG4gICAgfSBlbHNlIHtcbiAgICAgIHRoaXMudmlldyA9IFZpZXcgJiYgbmV3IFZpZXcodGhpcy5pbml0RGF0YSwgZGF0YSk7XG4gICAgfVxuXG4gICAgc2V0Q2hpbGRyZW4odGhpcy5lbCwgW3RoaXMudmlld10pO1xuICB9XG4gIHRoaXMudmlldyAmJiB0aGlzLnZpZXcudXBkYXRlICYmIHRoaXMudmlldy51cGRhdGUoZGF0YSwgcm91dGUpO1xufTtcblxudmFyIG5zID0gJ2h0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnJztcblxudmFyIHN2Z0NhY2hlID0ge307XG5cbmZ1bmN0aW9uIHN2ZyAocXVlcnkpIHtcbiAgdmFyIGFyZ3MgPSBbXSwgbGVuID0gYXJndW1lbnRzLmxlbmd0aCAtIDE7XG4gIHdoaWxlICggbGVuLS0gPiAwICkgYXJnc1sgbGVuIF0gPSBhcmd1bWVudHNbIGxlbiArIDEgXTtcblxuICB2YXIgZWxlbWVudDtcblxuICB2YXIgdHlwZSA9IHR5cGVvZiBxdWVyeTtcblxuICBpZiAodHlwZSA9PT0gJ3N0cmluZycpIHtcbiAgICBlbGVtZW50ID0gbWVtb2l6ZVNWRyhxdWVyeSkuY2xvbmVOb2RlKGZhbHNlKTtcbiAgfSBlbHNlIGlmIChpc05vZGUocXVlcnkpKSB7XG4gICAgZWxlbWVudCA9IHF1ZXJ5LmNsb25lTm9kZShmYWxzZSk7XG4gIH0gZWxzZSBpZiAodHlwZSA9PT0gJ2Z1bmN0aW9uJykge1xuICAgIHZhciBRdWVyeSA9IHF1ZXJ5O1xuICAgIGVsZW1lbnQgPSBuZXcgKEZ1bmN0aW9uLnByb3RvdHlwZS5iaW5kLmFwcGx5KCBRdWVyeSwgWyBudWxsIF0uY29uY2F0KCBhcmdzKSApKTtcbiAgfSBlbHNlIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ0F0IGxlYXN0IG9uZSBhcmd1bWVudCByZXF1aXJlZCcpO1xuICB9XG5cbiAgcGFyc2VBcmd1bWVudHNJbnRlcm5hbChnZXRFbChlbGVtZW50KSwgYXJncywgdHJ1ZSk7XG5cbiAgcmV0dXJuIGVsZW1lbnQ7XG59XG5cbnZhciBzID0gc3ZnO1xuXG5zdmcuZXh0ZW5kID0gZnVuY3Rpb24gZXh0ZW5kU3ZnIChxdWVyeSkge1xuICB2YXIgY2xvbmUgPSBtZW1vaXplU1ZHKHF1ZXJ5KTtcblxuICByZXR1cm4gc3ZnLmJpbmQodGhpcywgY2xvbmUpO1xufTtcblxuc3ZnLm5zID0gbnM7XG5cbmZ1bmN0aW9uIG1lbW9pemVTVkcgKHF1ZXJ5KSB7XG4gIHJldHVybiBzdmdDYWNoZVtxdWVyeV0gfHwgKHN2Z0NhY2hlW3F1ZXJ5XSA9IGNyZWF0ZUVsZW1lbnQocXVlcnksIG5zKSk7XG59XG5cbmV4cG9ydCB7IExpc3QsIExpc3RQb29sLCBQbGFjZSwgUm91dGVyLCBlbCwgaCwgaHRtbCwgbGlzdCwgbGlzdFBvb2wsIG1vdW50LCBwbGFjZSwgcm91dGVyLCBzLCBzZXRBdHRyLCBzZXRDaGlsZHJlbiwgc2V0RGF0YSwgc2V0U3R5bGUsIHNldFhsaW5rLCBzdmcsIHRleHQsIHVubW91bnQgfTtcbiIsImV4cG9ydCBmdW5jdGlvbiBhcm91bmQob2JqLCBmYWN0b3JpZXMpIHtcbiAgICBjb25zdCByZW1vdmVycyA9IE9iamVjdC5rZXlzKGZhY3RvcmllcykubWFwKGtleSA9PiBhcm91bmQxKG9iaiwga2V5LCBmYWN0b3JpZXNba2V5XSkpO1xuICAgIHJldHVybiByZW1vdmVycy5sZW5ndGggPT09IDEgPyByZW1vdmVyc1swXSA6IGZ1bmN0aW9uICgpIHsgcmVtb3ZlcnMuZm9yRWFjaChyID0+IHIoKSk7IH07XG59XG5mdW5jdGlvbiBhcm91bmQxKG9iaiwgbWV0aG9kLCBjcmVhdGVXcmFwcGVyKSB7XG4gICAgY29uc3Qgb3JpZ2luYWwgPSBvYmpbbWV0aG9kXSwgaGFkT3duID0gb2JqLmhhc093blByb3BlcnR5KG1ldGhvZCk7XG4gICAgbGV0IGN1cnJlbnQgPSBjcmVhdGVXcmFwcGVyKG9yaWdpbmFsKTtcbiAgICAvLyBMZXQgb3VyIHdyYXBwZXIgaW5oZXJpdCBzdGF0aWMgcHJvcHMgZnJvbSB0aGUgd3JhcHBpbmcgbWV0aG9kLFxuICAgIC8vIGFuZCB0aGUgd3JhcHBpbmcgbWV0aG9kLCBwcm9wcyBmcm9tIHRoZSBvcmlnaW5hbCBtZXRob2RcbiAgICBpZiAob3JpZ2luYWwpXG4gICAgICAgIE9iamVjdC5zZXRQcm90b3R5cGVPZihjdXJyZW50LCBvcmlnaW5hbCk7XG4gICAgT2JqZWN0LnNldFByb3RvdHlwZU9mKHdyYXBwZXIsIGN1cnJlbnQpO1xuICAgIG9ialttZXRob2RdID0gd3JhcHBlcjtcbiAgICAvLyBSZXR1cm4gYSBjYWxsYmFjayB0byBhbGxvdyBzYWZlIHJlbW92YWxcbiAgICByZXR1cm4gcmVtb3ZlO1xuICAgIGZ1bmN0aW9uIHdyYXBwZXIoLi4uYXJncykge1xuICAgICAgICAvLyBJZiB3ZSBoYXZlIGJlZW4gZGVhY3RpdmF0ZWQgYW5kIGFyZSBubyBsb25nZXIgd3JhcHBlZCwgcmVtb3ZlIG91cnNlbHZlc1xuICAgICAgICBpZiAoY3VycmVudCA9PT0gb3JpZ2luYWwgJiYgb2JqW21ldGhvZF0gPT09IHdyYXBwZXIpXG4gICAgICAgICAgICByZW1vdmUoKTtcbiAgICAgICAgcmV0dXJuIGN1cnJlbnQuYXBwbHkodGhpcywgYXJncyk7XG4gICAgfVxuICAgIGZ1bmN0aW9uIHJlbW92ZSgpIHtcbiAgICAgICAgLy8gSWYgbm8gb3RoZXIgcGF0Y2hlcywganVzdCBkbyBhIGRpcmVjdCByZW1vdmFsXG4gICAgICAgIGlmIChvYmpbbWV0aG9kXSA9PT0gd3JhcHBlcikge1xuICAgICAgICAgICAgaWYgKGhhZE93bilcbiAgICAgICAgICAgICAgICBvYmpbbWV0aG9kXSA9IG9yaWdpbmFsO1xuICAgICAgICAgICAgZWxzZVxuICAgICAgICAgICAgICAgIGRlbGV0ZSBvYmpbbWV0aG9kXTtcbiAgICAgICAgfVxuICAgICAgICBpZiAoY3VycmVudCA9PT0gb3JpZ2luYWwpXG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIC8vIEVsc2UgcGFzcyBmdXR1cmUgY2FsbHMgdGhyb3VnaCwgYW5kIHJlbW92ZSB3cmFwcGVyIGZyb20gdGhlIHByb3RvdHlwZSBjaGFpblxuICAgICAgICBjdXJyZW50ID0gb3JpZ2luYWw7XG4gICAgICAgIE9iamVjdC5zZXRQcm90b3R5cGVPZih3cmFwcGVyLCBvcmlnaW5hbCB8fCBGdW5jdGlvbik7XG4gICAgfVxufVxuZXhwb3J0IGZ1bmN0aW9uIGFmdGVyKHByb21pc2UsIGNiKSB7XG4gICAgcmV0dXJuIHByb21pc2UudGhlbihjYiwgY2IpO1xufVxuZXhwb3J0IGZ1bmN0aW9uIHNlcmlhbGl6ZShhc3luY0Z1bmN0aW9uKSB7XG4gICAgbGV0IGxhc3RSdW4gPSBQcm9taXNlLnJlc29sdmUoKTtcbiAgICBmdW5jdGlvbiB3cmFwcGVyKC4uLmFyZ3MpIHtcbiAgICAgICAgcmV0dXJuIGxhc3RSdW4gPSBuZXcgUHJvbWlzZSgocmVzLCByZWopID0+IHtcbiAgICAgICAgICAgIGFmdGVyKGxhc3RSdW4sICgpID0+IHtcbiAgICAgICAgICAgICAgICBhc3luY0Z1bmN0aW9uLmFwcGx5KHRoaXMsIGFyZ3MpLnRoZW4ocmVzLCByZWopO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0pO1xuICAgIH1cbiAgICB3cmFwcGVyLmFmdGVyID0gZnVuY3Rpb24gKCkge1xuICAgICAgICByZXR1cm4gbGFzdFJ1biA9IG5ldyBQcm9taXNlKChyZXMsIHJlaikgPT4geyBhZnRlcihsYXN0UnVuLCByZXMpOyB9KTtcbiAgICB9O1xuICAgIHJldHVybiB3cmFwcGVyO1xufVxuIiwiaW1wb3J0IHtNZW51LCBBcHB9IGZyb20gXCJvYnNpZGlhblwiO1xuaW1wb3J0IHthcm91bmR9IGZyb20gXCJtb25rZXktYXJvdW5kXCI7XG5cbmRlY2xhcmUgbW9kdWxlIFwib2JzaWRpYW5cIiB7XG4gICAgaW50ZXJmYWNlIE1lbnUge1xuICAgICAgICBhcHA6IEFwcFxuICAgICAgICBkb206IEhUTUxEaXZFbGVtZW50XG4gICAgICAgIHNjb3BlOiBTY29wZVxuICAgIH1cbiAgICBpbnRlcmZhY2UgTWVudUl0ZW0ge1xuICAgICAgICBkb206IEhUTUxEaXZFbGVtZW50XG4gICAgfVxufVxuXG5leHBvcnQgdHlwZSBNZW51UGFyZW50ID0gQXBwIHwgUG9wdXBNZW51O1xuXG5leHBvcnQgY2xhc3MgUG9wdXBNZW51IGV4dGVuZHMgTWVudSB7XG4gICAgLyoqIFRoZSBjaGlsZCBtZW51IHBvcHBlZCB1cCBvdmVyIHRoaXMgb25lICovXG4gICAgY2hpbGQ6IE1lbnVcblxuICAgIGNvbnN0cnVjdG9yKHByb3RlY3RlZCBwYXJlbnQ6IE1lbnVQYXJlbnQpIHtcbiAgICAgICAgc3VwZXIocGFyZW50IGluc3RhbmNlb2YgQXBwID8gcGFyZW50IDogcGFyZW50LmFwcCk7XG4gICAgICAgIGlmIChwYXJlbnQgaW5zdGFuY2VvZiBQb3B1cE1lbnUpIHBhcmVudC5zZXRDaGlsZE1lbnUodGhpcyk7XG5cbiAgICAgICAgLy8gRXNjYXBlIHRvIGNsb3NlIHRoZSBtZW51XG4gICAgICAgIHRoaXMuc2NvcGUucmVnaXN0ZXIobnVsbCwgXCJFc2NhcGVcIiwgdGhpcy5oaWRlLmJpbmQodGhpcykpO1xuXG4gICAgICAgIC8vIE1ha2Ugb2JzaWRpYW4uTWVudSB0aGluayBtb3VzZWRvd25zIG9uIG91ciBjaGlsZCBtZW51KHMpIGFyZSBoYXBwZW5pbmdcbiAgICAgICAgLy8gb24gdXMsIHNvIHdlIHdvbid0IGNsb3NlIGJlZm9yZSBhbiBhY3R1YWwgY2xpY2sgb2NjdXJzXG4gICAgICAgIGNvbnN0IG1lbnUgPSB0aGlzO1xuICAgICAgICBhcm91bmQodGhpcy5kb20sIHtjb250YWlucyhwcmV2KXsgcmV0dXJuIGZ1bmN0aW9uKHRhcmdldDogTm9kZSkge1xuICAgICAgICAgICAgY29uc3QgcmV0ID0gcHJldi5jYWxsKHRoaXMsIHRhcmdldCkgfHwgbWVudS5jaGlsZD8uZG9tLmNvbnRhaW5zKHRhcmdldCk7XG4gICAgICAgICAgICByZXR1cm4gcmV0O1xuICAgICAgICB9fX0pO1xuICAgIH1cblxuICAgIG9ubG9hZCgpIHtcbiAgICAgICAgdGhpcy5zY29wZS5yZWdpc3RlcihudWxsLCBudWxsLCAoKSA9PiBmYWxzZSk7IC8vIGJsb2NrIGFsbCBrZXlzIG90aGVyIHRoYW4gb3Vyc1xuICAgICAgICBzdXBlci5vbmxvYWQoKTtcbiAgICB9XG5cbiAgICBoaWRlKCkge1xuICAgICAgICB0aGlzLnNldENoaWxkTWVudSgpOyAgLy8gaGlkZSBjaGlsZCBtZW51KHMpIGZpcnN0XG4gICAgICAgIHJldHVybiBzdXBlci5oaWRlKCk7XG4gICAgfVxuXG4gICAgc2V0Q2hpbGRNZW51KG1lbnU/OiBNZW51KSB7XG4gICAgICAgIHRoaXMuY2hpbGQ/LmhpZGUoKTtcbiAgICAgICAgdGhpcy5jaGlsZCA9IG1lbnU7XG4gICAgfVxuXG4gICAgY2FzY2FkZSh0YXJnZXQ6IEhUTUxFbGVtZW50LCBldmVudD86IE1vdXNlRXZlbnQsICBoT3ZlcmxhcCA9IDE1LCB2T3ZlcmxhcCA9IDUpIHtcbiAgICAgICAgY29uc3Qge2xlZnQsIHJpZ2h0LCB0b3AsIGJvdHRvbX0gPSB0YXJnZXQuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCk7XG4gICAgICAgIGNvbnN0IGNlbnRlclggPSAobGVmdCtyaWdodCkvMiwgY2VudGVyWSA9ICh0b3ArYm90dG9tKS8yO1xuICAgICAgICBjb25zdCB7aW5uZXJIZWlnaHQsIGlubmVyV2lkdGh9ID0gd2luZG93O1xuXG4gICAgICAgIC8vIFRyeSB0byBjYXNjYWRlIGRvd24gYW5kIHRvIHRoZSByaWdodCBmcm9tIHRoZSBtb3VzZSBvciBob3Jpem9udGFsIGNlbnRlclxuICAgICAgICAvLyBvZiB0aGUgY2xpY2tlZCBpdGVtXG4gICAgICAgIGNvbnN0IHBvaW50ID0ge3g6IGV2ZW50ID8gZXZlbnQuY2xpZW50WCAgLSBoT3ZlcmxhcCA6IGNlbnRlclggLCB5OiBib3R0b20gLSB2T3ZlcmxhcH07XG5cbiAgICAgICAgLy8gTWVhc3VyZSB0aGUgbWVudSBhbmQgc2VlIGlmIGl0IGZpdHNcbiAgICAgICAgZG9jdW1lbnQuYm9keS5hcHBlbmRDaGlsZCh0aGlzLmRvbSk7XG4gICAgICAgIGNvbnN0IHtvZmZzZXRXaWR0aCwgb2Zmc2V0SGVpZ2h0fSA9IHRoaXMuZG9tO1xuICAgICAgICBjb25zdCBmaXRzQmVsb3cgPSBwb2ludC55ICsgb2Zmc2V0SGVpZ2h0IDwgaW5uZXJIZWlnaHQ7XG4gICAgICAgIGNvbnN0IGZpdHNSaWdodCA9IHBvaW50LnggKyBvZmZzZXRXaWR0aCA8PSBpbm5lcldpZHRoO1xuXG4gICAgICAgIC8vIElmIGl0IGRvZXNuJ3QgZml0IHVuZGVybmVhdGggdXMsIHBvc2l0aW9uIGl0IGF0IHRoZSBib3R0b20gb2YgdGhlIHNjcmVlbiwgdW5sZXNzXG4gICAgICAgIC8vIHRoZSBjbGlja2VkIGl0ZW0gaXMgY2xvc2UgdG8gdGhlIGJvdHRvbSAoaW4gd2hpY2ggY2FzZSwgcG9zaXRpb24gaXQgYWJvdmUgc29cbiAgICAgICAgLy8gdGhlIGl0ZW0gd2lsbCBzdGlsbCBiZSB2aXNpYmxlLilcbiAgICAgICAgaWYgKCFmaXRzQmVsb3cpIHtcbiAgICAgICAgICAgIHBvaW50LnkgPSAoYm90dG9tID4gaW5uZXJIZWlnaHQgLSAoYm90dG9tLXRvcCkpID8gdG9wICsgdk92ZXJsYXA6IGlubmVySGVpZ2h0O1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gSWYgaXQgZG9lc24ndCBmaXQgdG8gdGhlIHJpZ2h0LCB0aGVuIHBvc2l0aW9uIGl0IGF0IHRoZSByaWdodCBlZGdlIG9mIHRoZSBzY3JlZW4sXG4gICAgICAgIC8vIHNvIGxvbmcgYXMgaXQgZml0cyBlbnRpcmVseSBhYm92ZSBvciBiZWxvdyB1cy4gIE90aGVyd2lzZSwgcG9zaXRpb24gaXQgdXNpbmcgdGhlXG4gICAgICAgIC8vIGl0ZW0gY2VudGVyLCBzbyBhdCBsZWFzdCBvbmUgc2lkZSBvZiB0aGUgcHJldmlvdXMgbWVudS9pdGVtIHdpbGwgc3RpbGwgYmUgc2Vlbi5cbiAgICAgICAgaWYgKCFmaXRzUmlnaHQpIHtcbiAgICAgICAgICAgIHBvaW50LnggPSAob2Zmc2V0SGVpZ2h0IDwgKGJvdHRvbSAtIHZPdmVybGFwKSB8fCBmaXRzQmVsb3cpID8gaW5uZXJXaWR0aCA6IGNlbnRlclg7XG4gICAgICAgIH1cblxuICAgICAgICAvLyBEb25lISAgU2hvdyBvdXIgd29yay5cbiAgICAgICAgdGhpcy5zaG93QXRQb3NpdGlvbihwb2ludCk7XG5cbiAgICAgICAgLy8gRmxhZyB0aGUgY2xpY2tlZCBpdGVtIGFzIGFjdGl2ZSwgdW50aWwgd2UgY2xvc2VcbiAgICAgICAgdGFyZ2V0LnRvZ2dsZUNsYXNzKFwiaXMtYWN0aXZlXCIsIHRydWUpO1xuICAgICAgICB0aGlzLm9uSGlkZSgoKSA9PiB0YXJnZXQudG9nZ2xlQ2xhc3MoXCJpcy1hY3RpdmVcIiwgZmFsc2UpKTtcbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfVxufVxuIiwiaW1wb3J0IHsgS2V5bWFwLCBOb3RpY2UsIFRBYnN0cmFjdEZpbGUsIFRGaWxlLCBURm9sZGVyLCBWaWV3IH0gZnJvbSBcIm9ic2lkaWFuXCI7XG5pbXBvcnQgeyBQb3B1cE1lbnUsIE1lbnVQYXJlbnQgfSBmcm9tIFwiLi9tZW51c1wiO1xuaW1wb3J0IHtpMThufSBmcm9tIFwiaTE4bmV4dFwiO1xuXG5kZWNsYXJlIGdsb2JhbCB7XG4gICAgY29uc3QgaTE4bmV4dDogaTE4blxufVxuXG5kZWNsYXJlIG1vZHVsZSBcIm9ic2lkaWFuXCIge1xuICAgIGludGVyZmFjZSBBcHAge1xuICAgICAgICBzZXRBdHRhY2htZW50Rm9sZGVyKGZvbGRlcjogVEZvbGRlcik6IHZvaWRcbiAgICAgICAgaW50ZXJuYWxQbHVnaW5zOiB7XG4gICAgICAgICAgICBwbHVnaW5zOiB7XG4gICAgICAgICAgICAgICAgXCJmaWxlLWV4cGxvcmVyXCI6IHtcbiAgICAgICAgICAgICAgICAgICAgZW5hYmxlZDogYm9vbGVhblxuICAgICAgICAgICAgICAgICAgICBpbnN0YW5jZToge1xuICAgICAgICAgICAgICAgICAgICAgICAgcmV2ZWFsSW5Gb2xkZXIoZmlsZTogVEFic3RyYWN0RmlsZSk6IHZvaWRcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cbiAgICBpbnRlcmZhY2UgRmlsZU1hbmFnZXIge1xuICAgICAgICBwcm9tcHRGb3JGb2xkZXJEZWxldGlvbihmb2xkZXI6IFRGb2xkZXIpOiB2b2lkXG4gICAgICAgIHByb21wdEZvckZpbGVEZWxldGlvbihmaWxlOiBURmlsZSk6IHZvaWRcbiAgICAgICAgcHJvbXB0Rm9yRmlsZVJlbmFtZShmaWxlOiBURmlsZSk6IHZvaWRcbiAgICAgICAgY3JlYXRlTmV3TWFya2Rvd25GaWxlKHBhcmVudEZvbGRlcj86IFRGb2xkZXIsIHBhdHRlcm4/OiBzdHJpbmcpOiBQcm9taXNlPFRGaWxlPlxuICAgIH1cbn1cblxuaW50ZXJmYWNlIEZpbGVFeHBsb3JlclZpZXcgZXh0ZW5kcyBWaWV3IHtcbiAgICBjcmVhdGVBYnN0cmFjdEZpbGUoa2luZDogXCJmaWxlXCIgfCBcImZvbGRlclwiLCBwYXJlbnQ6IFRGb2xkZXIsIG5ld0xlYWY/OiBib29sZWFuKTogUHJvbWlzZTx2b2lkPlxuICAgIHN0YXJ0UmVuYW1lRmlsZShmaWxlOiBUQWJzdHJhY3RGaWxlKTogUHJvbWlzZTx2b2lkPlxufVxuXG5mdW5jdGlvbiBvcHROYW1lKG5hbWU6IHN0cmluZykge1xuICAgIHJldHVybiBpMThuZXh0LnQoYHBsdWdpbnMuZmlsZS1leHBsb3Jlci5tZW51LW9wdC0ke25hbWV9YCk7XG59XG5cbmV4cG9ydCBjbGFzcyBDb250ZXh0TWVudSBleHRlbmRzIFBvcHVwTWVudSB7XG4gICAgY29uc3RydWN0b3IocGFyZW50OiBNZW51UGFyZW50LCBmaWxlOiBUQWJzdHJhY3RGaWxlKSB7XG4gICAgICAgIHN1cGVyKHBhcmVudCk7XG4gICAgICAgIGNvbnN0IHsgd29ya3NwYWNlIH0gPSB0aGlzLmFwcDtcbiAgICAgICAgY29uc3QgaGF2ZUZpbGVFeHBsb3JlciA9IHRoaXMuYXBwLmludGVybmFsUGx1Z2lucy5wbHVnaW5zW1wiZmlsZS1leHBsb3JlclwiXS5lbmFibGVkO1xuXG4gICAgICAgIGlmIChmaWxlIGluc3RhbmNlb2YgVEZvbGRlcikge1xuICAgICAgICAgICAgdGhpcy5hZGRJdGVtKGkgPT4gaS5zZXRUaXRsZShvcHROYW1lKFwibmV3LW5vdGVcIikpLnNldEljb24oXCJjcmVhdGUtbmV3XCIpLm9uQ2xpY2soYXN5bmMgZSA9PiB7XG4gICAgICAgICAgICAgICAgY29uc3QgbmV3RmlsZSA9IGF3YWl0IHRoaXMuYXBwLmZpbGVNYW5hZ2VyLmNyZWF0ZU5ld01hcmtkb3duRmlsZShmaWxlKTtcbiAgICAgICAgICAgICAgICBpZiAobmV3RmlsZSkgYXdhaXQgdGhpcy5hcHAud29ya3NwYWNlLmdldExlYWYoS2V5bWFwLmlzTW9kaWZpZXIoZSwgXCJNb2RcIikpLm9wZW5GaWxlKG5ld0ZpbGUsIHtcbiAgICAgICAgICAgICAgICAgICAgYWN0aXZlOiAhMCwgc3RhdGU6IHsgbW9kZTogXCJzb3VyY2VcIiB9LCBlU3RhdGU6IHsgcmVuYW1lOiBcImFsbFwiIH1cbiAgICAgICAgICAgICAgICB9KVxuICAgICAgICAgICAgfSkpO1xuICAgICAgICAgICAgdGhpcy5hZGRJdGVtKGkgPT4gaS5zZXRUaXRsZShvcHROYW1lKFwibmV3LWZvbGRlclwiKSkuc2V0SWNvbihcImZvbGRlclwiKS5zZXREaXNhYmxlZCghaGF2ZUZpbGVFeHBsb3Jlcikub25DbGljayhldmVudCA9PiB7XG4gICAgICAgICAgICAgICAgaWYgKGhhdmVGaWxlRXhwbG9yZXIpIHtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy53aXRoRXhwbG9yZXIoZmlsZSk/LmNyZWF0ZUFic3RyYWN0RmlsZShcImZvbGRlclwiLCBmaWxlKTtcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICBuZXcgTm90aWNlKFwiVGhlIEZpbGUgRXhwbG9yZXIgY29yZSBwbHVnaW4gbXVzdCBiZSBlbmFibGVkIHRvIHJlbmFtZSBmb2xkZXJzXCIpXG4gICAgICAgICAgICAgICAgICAgIGV2ZW50LnN0b3BQcm9wYWdhdGlvbigpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0pKTtcbiAgICAgICAgICAgIHRoaXMuYWRkSXRlbShpID0+IGkuc2V0VGl0bGUob3B0TmFtZShcInNldC1hdHRhY2htZW50LWZvbGRlclwiKSkuc2V0SWNvbihcImltYWdlLWZpbGVcIikub25DbGljaygoKSA9PiB7XG4gICAgICAgICAgICAgICAgdGhpcy5hcHAuc2V0QXR0YWNobWVudEZvbGRlcihmaWxlKTtcbiAgICAgICAgICAgIH0pKTtcbiAgICAgICAgICAgIHRoaXMuYWRkU2VwYXJhdG9yKCk7XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy5hZGRJdGVtKGkgPT4ge1xuICAgICAgICAgICAgLy8gQ2FuJ3QgcmVuYW1lIGZvbGRlciB3aXRob3V0IGZpbGUgZXhwbG9yZXJcbiAgICAgICAgICAgIGkuc2V0RGlzYWJsZWQoZmlsZSBpbnN0YW5jZW9mIFRGb2xkZXIgJiYgIWhhdmVGaWxlRXhwbG9yZXIpO1xuICAgICAgICAgICAgaS5zZXRUaXRsZShvcHROYW1lKFwicmVuYW1lXCIpKS5zZXRJY29uKFwicGVuY2lsXCIpLm9uQ2xpY2soZXZlbnQgPT4ge1xuICAgICAgICAgICAgICAgIGlmIChmaWxlIGluc3RhbmNlb2YgVEZpbGUpIHtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5hcHAuZmlsZU1hbmFnZXIucHJvbXB0Rm9yRmlsZVJlbmFtZShmaWxlKTtcbiAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKGhhdmVGaWxlRXhwbG9yZXIpIHtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy53aXRoRXhwbG9yZXIoZmlsZSk/LnN0YXJ0UmVuYW1lRmlsZShmaWxlKTtcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICBuZXcgTm90aWNlKFwiVGhlIEZpbGUgRXhwbG9yZXIgY29yZSBwbHVnaW4gbXVzdCBiZSBlbmFibGVkIHRvIHJlbmFtZSBmb2xkZXJzXCIpXG4gICAgICAgICAgICAgICAgICAgIGV2ZW50LnN0b3BQcm9wYWdhdGlvbigpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9KTtcbiAgICAgICAgdGhpcy5hZGRJdGVtKGkgPT4gaS5zZXRUaXRsZShvcHROYW1lKFwiZGVsZXRlXCIpKS5zZXRJY29uKFwidHJhc2hcIikub25DbGljaygoKSA9PiB7XG4gICAgICAgICAgICBpZiAoZmlsZSBpbnN0YW5jZW9mIFRGb2xkZXIpIHtcbiAgICAgICAgICAgICAgICB0aGlzLmFwcC5maWxlTWFuYWdlci5wcm9tcHRGb3JGb2xkZXJEZWxldGlvbihmaWxlKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2UgaWYgKGZpbGUgaW5zdGFuY2VvZiBURmlsZSkge1xuICAgICAgICAgICAgICAgIHRoaXMuYXBwLmZpbGVNYW5hZ2VyLnByb21wdEZvckZpbGVEZWxldGlvbihmaWxlKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSkpO1xuICAgICAgICBpZiAoZmlsZSBpbnN0YW5jZW9mIFRGb2xkZXIgJiYgaGF2ZUZpbGVFeHBsb3Jlcikge1xuICAgICAgICAgICAgdGhpcy5hZGRJdGVtKGkgPT4gaS5zZXRJY29uKFwiZm9sZGVyXCIpLnNldFRpdGxlKGkxOG5leHQudCgncGx1Z2lucy5maWxlLWV4cGxvcmVyLmFjdGlvbi1yZXZlYWwtZmlsZScpKS5vbkNsaWNrKCgpID0+IHtcbiAgICAgICAgICAgICAgICB0aGlzLndpdGhFeHBsb3JlcihmaWxlKTtcbiAgICAgICAgICAgIH0pKTtcbiAgICAgICAgfVxuICAgICAgICBpZiAoZmlsZSA9PT0gd29ya3NwYWNlLmdldEFjdGl2ZUZpbGUoKSkge1xuICAgICAgICAgICAgd29ya3NwYWNlLnRyaWdnZXIoXCJmaWxlLW1lbnVcIiwgdGhpcywgZmlsZSwgXCJxdWljay1leHBsb3JlclwiLCB3b3Jrc3BhY2UuYWN0aXZlTGVhZik7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB3b3Jrc3BhY2UudHJpZ2dlcihcImZpbGUtbWVudVwiLCB0aGlzLCBmaWxlLCBcInF1aWNrLWV4cGxvcmVyXCIpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgd2l0aEV4cGxvcmVyKGZpbGU6IFRBYnN0cmFjdEZpbGUpIHtcbiAgICAgICAgY29uc3QgZXhwbG9yZXIgPSB0aGlzLmFwcC5pbnRlcm5hbFBsdWdpbnMucGx1Z2luc1tcImZpbGUtZXhwbG9yZXJcIl07XG4gICAgICAgIGlmIChleHBsb3Jlci5lbmFibGVkKSB7XG4gICAgICAgICAgICBleHBsb3Jlci5pbnN0YW5jZS5yZXZlYWxJbkZvbGRlcihmaWxlKTtcbiAgICAgICAgICAgIHJldHVybiB0aGlzLmFwcC53b3Jrc3BhY2UuZ2V0TGVhdmVzT2ZUeXBlKFwiZmlsZS1leHBsb3JlclwiKVswXS52aWV3IGFzIEZpbGVFeHBsb3JlclZpZXdcbiAgICAgICAgfVxuICAgIH1cbn1cbiIsImltcG9ydCB7IFRBYnN0cmFjdEZpbGUsIFRGaWxlLCBURm9sZGVyLCBLZXltYXAsIE5vdGljZSwgQXBwIH0gZnJvbSBcIm9ic2lkaWFuXCI7XG5pbXBvcnQgeyBob3ZlclNvdXJjZSwgc3RhcnREcmFnIH0gZnJvbSBcIi4vRXhwbG9yZXJcIjtcbmltcG9ydCB7IFBvcHVwTWVudSwgTWVudVBhcmVudCB9IGZyb20gXCIuL21lbnVzXCI7XG5pbXBvcnQgeyBDb250ZXh0TWVudSB9IGZyb20gXCIuL0NvbnRleHRNZW51XCI7XG5cbmRlY2xhcmUgbW9kdWxlIFwib2JzaWRpYW5cIiB7XG4gICAgZXhwb3J0IGNvbnN0IEtleW1hcDogYW55XG4gICAgaW50ZXJmYWNlIEFwcCB7XG4gICAgICAgIHZpZXdSZWdpc3RyeToge1xuICAgICAgICAgICAgaXNFeHRlbnNpb25SZWdpc3RlcmVkKGV4dDogc3RyaW5nKTogYm9vbGVhblxuICAgICAgICAgICAgZ2V0VHlwZUJ5RXh0ZW5zaW9uKGV4dDogc3RyaW5nKTogc3RyaW5nXG4gICAgICAgIH1cbiAgICB9XG59XG5cbmNvbnN0IHByZXZpZXdJY29uczogUmVjb3JkPHN0cmluZywgc3RyaW5nPiA9IHtcbiAgICBtYXJrZG93bjogXCJkb2N1bWVudFwiLFxuICAgIGltYWdlOiBcImltYWdlLWZpbGVcIixcbiAgICBhdWRpbzogXCJhdWRpby1maWxlXCIsXG4gICAgcGRmOiBcInBkZi1maWxlXCIsXG59XG5cbmNvbnN0IHZpZXd0eXBlSWNvbnM6IFJlY29yZDxzdHJpbmcsIHN0cmluZz4gPSB7XG4gICAgLi4ucHJldmlld0ljb25zLFxuICAgIC8vIGFzcyB0aGlyZC1wYXJ0eSBwbHVnaW5zXG4gICAgZXhjYWxpZHJhdzogXCJleGNhbGlkcmF3LWljb25cIixcbn07XG5cblxuZnVuY3Rpb24gZmlsZUljb24oYXBwOiBBcHAsIGZpbGU6IFRBYnN0cmFjdEZpbGUpIHtcbiAgICBpZiAoZmlsZSBpbnN0YW5jZW9mIFRGb2xkZXIpIHJldHVybiBcImZvbGRlclwiO1xuICAgIGlmIChmaWxlIGluc3RhbmNlb2YgVEZpbGUpIHtcbiAgICAgICAgY29uc3Qgdmlld1R5cGUgPSBhcHAudmlld1JlZ2lzdHJ5LmdldFR5cGVCeUV4dGVuc2lvbihmaWxlLmV4dGVuc2lvbik7XG4gICAgICAgIGlmICh2aWV3VHlwZSkgcmV0dXJuIHZpZXd0eXBlSWNvbnNbdmlld1R5cGVdID8/IFwiZG9jdW1lbnRcIjtcbiAgICB9XG59XG5cbmV4cG9ydCBjbGFzcyBGb2xkZXJNZW51IGV4dGVuZHMgUG9wdXBNZW51IHtcblxuICAgIHBhcmVudEZvbGRlcjogVEZvbGRlciA9IHRoaXMucGFyZW50IGluc3RhbmNlb2YgRm9sZGVyTWVudSA/IHRoaXMucGFyZW50LmZvbGRlciA6IG51bGw7XG4gICAgbGFzdE92ZXI6IEhUTUxFbGVtZW50ID0gbnVsbDtcblxuICAgIGNvbnN0cnVjdG9yKHB1YmxpYyBwYXJlbnQ6IE1lbnVQYXJlbnQsIHB1YmxpYyBmb2xkZXI6IFRGb2xkZXIsIHB1YmxpYyBzZWxlY3RlZD86IFRBYnN0cmFjdEZpbGUpIHtcbiAgICAgICAgc3VwZXIocGFyZW50KTtcbiAgICAgICAgdGhpcy5sb2FkRmlsZXMoZm9sZGVyKTtcblxuICAgICAgICBjb25zdCB7IGRvbSB9ID0gdGhpcztcbiAgICAgICAgZG9tLnN0eWxlLnNldFByb3BlcnR5KFxuICAgICAgICAgICAgLy8gQWxsb3cgcG9wb3ZlcnMgKGhvdmVyIHByZXZpZXcpIHRvIG92ZXJsYXkgdGhpcyBtZW51XG4gICAgICAgICAgICBcIi0tbGF5ZXItbWVudVwiLCBcIlwiICsgKHBhcnNlSW50KGdldENvbXB1dGVkU3R5bGUoZG9jdW1lbnQuYm9keSkuZ2V0UHJvcGVydHlWYWx1ZShcIi0tbGF5ZXItcG9wb3ZlclwiKSkgLSAxKVxuICAgICAgICApO1xuXG4gICAgICAgIGNvbnN0IG1lbnVJdGVtID0gXCIubWVudS1pdGVtW2RhdGEtZmlsZS1wYXRoXVwiO1xuICAgICAgICBkb20ub24oXCJjbGlja1wiLCAgICAgICBtZW51SXRlbSwgdGhpcy5vbkl0ZW1DbGljaywgdHJ1ZSk7XG4gICAgICAgIGRvbS5vbihcImNvbnRleHRtZW51XCIsIG1lbnVJdGVtLCB0aGlzLm9uSXRlbU1lbnUgKTtcbiAgICAgICAgZG9tLm9uKCdtb3VzZW92ZXInICAsIG1lbnVJdGVtLCB0aGlzLm9uSXRlbUhvdmVyKTtcbiAgICAgICAgZG9tLm9uKCdkcmFnc3RhcnQnLCAgIG1lbnVJdGVtLCAoZXZlbnQsIHRhcmdldCkgPT4ge1xuICAgICAgICAgICAgc3RhcnREcmFnKHRoaXMuYXBwLCB0YXJnZXQuZGF0YXNldC5maWxlUGF0aCwgZXZlbnQpO1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBsb2FkRmlsZXMoZm9sZGVyOiBURm9sZGVyKSB7XG4gICAgICAgIGNvbnN0IHtjaGlsZHJlbiwgcGFyZW50fSA9IGZvbGRlcjtcbiAgICAgICAgLy8gWFhYIHNvcnQgY2hpbGRyZW4gYnkgbmFtZVxuICAgICAgICBjb25zdCBmb2xkZXJzID0gY2hpbGRyZW4uZmlsdGVyKGYgPT4gZiBpbnN0YW5jZW9mIFRGb2xkZXIpO1xuICAgICAgICBjb25zdCBmaWxlcyAgID0gY2hpbGRyZW4uZmlsdGVyKGYgPT4gZiBpbnN0YW5jZW9mIFRGaWxlKTsgICAvLyBYWFggJiYgKGFsbEZpbGVzIHx8IGZpbGVJY29uKGYpKVxuICAgICAgICBpZiAocGFyZW50KSBmb2xkZXJzLnVuc2hpZnQocGFyZW50KTtcbiAgICAgICAgZm9sZGVycy5tYXAodGhpcy5hZGRGaWxlLCB0aGlzKTtcbiAgICAgICAgaWYgKGZvbGRlcnMubGVuZ3RoICYmIGZpbGVzLmxlbmd0aCkgdGhpcy5hZGRTZXBhcmF0b3IoKTtcbiAgICAgICAgZmlsZXMubWFwKCAgdGhpcy5hZGRGaWxlLCB0aGlzKTtcbiAgICB9XG5cbiAgICBhZGRGaWxlKGZpbGU6IFRBYnN0cmFjdEZpbGUpIHtcbiAgICAgICAgY29uc3QgaWNvbiA9IGZpbGVJY29uKHRoaXMuYXBwLCBmaWxlKTtcbiAgICAgICAgdGhpcy5hZGRJdGVtKGkgPT4ge1xuICAgICAgICAgICAgaS5zZXRUaXRsZSgoZmlsZSA9PT0gdGhpcy5mb2xkZXIucGFyZW50KSA/IFwiLi5cIiA6IGZpbGUubmFtZSk7XG4gICAgICAgICAgICBpLmRvbS5kYXRhc2V0LmZpbGVQYXRoID0gZmlsZS5wYXRoO1xuICAgICAgICAgICAgaS5kb20uc2V0QXR0cihcImRyYWdnYWJsZVwiLCBcInRydWVcIik7XG4gICAgICAgICAgICBpZiAoaWNvbikgaS5zZXRJY29uKGljb24pO1xuICAgICAgICAgICAgaWYgKGZpbGUgaW5zdGFuY2VvZiBURmlsZSkge1xuICAgICAgICAgICAgICAgIGkuc2V0VGl0bGUoZmlsZS5iYXNlbmFtZSk7XG4gICAgICAgICAgICAgICAgaWYgKGZpbGUuZXh0ZW5zaW9uICE9PSBcIm1kXCIpIGkuZG9tLmNyZWF0ZURpdih7dGV4dDogZmlsZS5leHRlbnNpb24sIGNsczogXCJuYXYtZmlsZS10YWdcIn0pO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKGZpbGUgPT09IHRoaXMuc2VsZWN0ZWQpIGkuZG9tLmFkZENsYXNzKFwiaXMtYWN0aXZlXCIpO1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBvbkl0ZW1Ib3ZlciA9IChldmVudDogTW91c2VFdmVudCwgdGFyZ2V0RWw6IEhUTUxEaXZFbGVtZW50KSA9PiB7XG4gICAgICAgIGNvbnN0IHsgZmlsZVBhdGggfSA9IHRhcmdldEVsLmRhdGFzZXQ7XG4gICAgICAgIGNvbnN0IGZpbGUgPSB0aGlzLmFwcC52YXVsdC5nZXRBYnN0cmFjdEZpbGVCeVBhdGgoZmlsZVBhdGgpO1xuICAgICAgICBpZiAoIWZpbGUpIHJldHVybjtcbiAgICAgICAgaWYgKHRhcmdldEVsICE9IHRoaXMubGFzdE92ZXIpIHtcbiAgICAgICAgICAgIHRoaXMuc2V0Q2hpbGRNZW51KCk7ICAvLyBjbG9zZSBzdWJtZW51XG4gICAgICAgICAgICB0aGlzLmxhc3RPdmVyID0gdGFyZ2V0RWw7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKGZpbGUgaW5zdGFuY2VvZiBURmlsZSAmJiBwcmV2aWV3SWNvbnNbdGhpcy5hcHAudmlld1JlZ2lzdHJ5LmdldFR5cGVCeUV4dGVuc2lvbihmaWxlLmV4dGVuc2lvbildKSB7XG4gICAgICAgICAgICB0aGlzLmFwcC53b3Jrc3BhY2UudHJpZ2dlcignaG92ZXItbGluaycsIHtcbiAgICAgICAgICAgICAgICBldmVudCwgc291cmNlOiBob3ZlclNvdXJjZSwgaG92ZXJQYXJlbnQ6IHRoaXMuZG9tLCB0YXJnZXRFbCwgbGlua3RleHQ6IGZpbGVQYXRoXG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIG9uSXRlbUNsaWNrID0gKGV2ZW50OiBNb3VzZUV2ZW50LCB0YXJnZXQ6IEhUTUxEaXZFbGVtZW50KSA9PiB7XG4gICAgICAgIGNvbnN0IHsgZmlsZVBhdGggfSA9IHRhcmdldC5kYXRhc2V0O1xuICAgICAgICBjb25zdCBmaWxlID0gdGhpcy5hcHAudmF1bHQuZ2V0QWJzdHJhY3RGaWxlQnlQYXRoKGZpbGVQYXRoKTtcbiAgICAgICAgdGhpcy5sYXN0T3ZlciA9IHRhcmdldDtcbiAgICAgICAgaWYgKCFmaWxlKSByZXR1cm47XG5cbiAgICAgICAgaWYgKGZpbGUgaW5zdGFuY2VvZiBURmlsZSkge1xuICAgICAgICAgICAgaWYgKHRoaXMuYXBwLnZpZXdSZWdpc3RyeS5pc0V4dGVuc2lvblJlZ2lzdGVyZWQoZmlsZS5leHRlbnNpb24pKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5hcHAud29ya3NwYWNlLm9wZW5MaW5rVGV4dChmaWxlLnBhdGgsIFwiXCIsIEtleW1hcC5pc01vZGlmaWVyKGV2ZW50LCBcIk1vZFwiKSk7XG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBuZXcgTm90aWNlKGAuJHtmaWxlLmV4dGVuc2lvbn0gZmlsZXMgY2Fubm90IGJlIG9wZW5lZCBpbiBPYnNpZGlhbjsgVXNlIFwiT3BlbiBpbiBEZWZhdWx0IEFwcFwiIHRvIG9wZW4gdGhlbSBleHRlcm5hbGx5YCk7XG4gICAgICAgICAgICAgICAgLy8gZmFsbCB0aHJvdWdoXG4gICAgICAgICAgICB9XG4gICAgICAgIH0gZWxzZSBpZiAoZmlsZSA9PT0gdGhpcy5wYXJlbnRGb2xkZXIpIHtcbiAgICAgICAgICAgIHRoaXMuaGlkZSgpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgY29uc3QgZm9sZGVyTWVudSA9IG5ldyBGb2xkZXJNZW51KHRoaXMsIGZpbGUgYXMgVEZvbGRlciwgdGhpcy5mb2xkZXIpO1xuICAgICAgICAgICAgZm9sZGVyTWVudS5jYXNjYWRlKHRhcmdldCwgZXZlbnQpO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gS2VlcCBjdXJyZW50IG1lbnUgdHJlZSBvcGVuXG4gICAgICAgIGV2ZW50LnN0b3BQcm9wYWdhdGlvbigpO1xuICAgICAgICBldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuXG4gICAgb25JdGVtTWVudSA9IChldmVudDogTW91c2VFdmVudCwgdGFyZ2V0OiBIVE1MRGl2RWxlbWVudCkgPT4ge1xuICAgICAgICBjb25zdCB7IGZpbGVQYXRoIH0gPSB0YXJnZXQuZGF0YXNldDtcbiAgICAgICAgY29uc3QgZmlsZSA9IHRoaXMuYXBwLnZhdWx0LmdldEFic3RyYWN0RmlsZUJ5UGF0aChmaWxlUGF0aCk7XG4gICAgICAgIGlmIChmaWxlKSB7XG4gICAgICAgICAgICB0aGlzLmxhc3RPdmVyID0gdGFyZ2V0O1xuICAgICAgICAgICAgbmV3IENvbnRleHRNZW51KHRoaXMsIGZpbGUpLmNhc2NhZGUodGFyZ2V0LCBldmVudCk7XG4gICAgICAgICAgICAvLyBLZWVwIGN1cnJlbnQgbWVudSB0cmVlIG9wZW5cbiAgICAgICAgICAgIGV2ZW50LnN0b3BQcm9wYWdhdGlvbigpO1xuICAgICAgICB9XG4gICAgfVxufVxuIiwiaW1wb3J0IHsgQXBwLCBUQWJzdHJhY3RGaWxlLCBURmlsZSwgVEZvbGRlciB9IGZyb20gXCJvYnNpZGlhblwiO1xuaW1wb3J0IHsgbGlzdCwgZWwgfSBmcm9tIFwicmVkb21cIjtcbmltcG9ydCB7IENvbnRleHRNZW51IH0gZnJvbSBcIi4vQ29udGV4dE1lbnVcIjtcbmltcG9ydCB7IEZvbGRlck1lbnUgfSBmcm9tIFwiLi9Gb2xkZXJNZW51XCI7XG5cbmV4cG9ydCBjb25zdCBob3ZlclNvdXJjZSA9IFwicXVpY2stZXhwbG9yZXI6Zm9sZGVyLW1lbnVcIjtcblxuZGVjbGFyZSBtb2R1bGUgXCJvYnNpZGlhblwiIHtcbiAgICBpbnRlcmZhY2UgQXBwIHtcbiAgICAgICAgZHJhZ01hbmFnZXI6IGFueVxuICAgIH1cbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHN0YXJ0RHJhZyhhcHA6IEFwcCwgcGF0aDogc3RyaW5nLCBldmVudDogRHJhZ0V2ZW50KSB7XG4gICAgaWYgKCFwYXRoIHx8IHBhdGggPT09IFwiL1wiKSByZXR1cm47XG4gICAgY29uc3QgZmlsZSA9IGFwcC52YXVsdC5nZXRBYnN0cmFjdEZpbGVCeVBhdGgocGF0aCk7XG4gICAgaWYgKCFmaWxlKSByZXR1cm47XG4gICAgY29uc3QgeyBkcmFnTWFuYWdlciB9ID0gYXBwO1xuICAgIGNvbnN0IGRyYWdEYXRhID0gZmlsZSBpbnN0YW5jZW9mIFRGaWxlID8gZHJhZ01hbmFnZXIuZHJhZ0ZpbGUoZXZlbnQsIGZpbGUpIDogZHJhZ01hbmFnZXIuZHJhZ0ZvbGRlcihldmVudCwgZmlsZSk7XG4gICAgZHJhZ01hbmFnZXIub25EcmFnU3RhcnQoZXZlbnQsIGRyYWdEYXRhKTtcbn1cblxuY2xhc3MgRXhwbG9yYWJsZSB7XG4gICAgZWw6IEhUTUxTcGFuRWxlbWVudCA9IDxzcGFuIGRyYWdnYWJsZSBjbGFzcz1cImV4cGxvcmFibGUgdGl0bGViYXItYnV0dG9uXCIgLz5cbiAgICB1cGRhdGUoZGF0YToge2ZpbGU6IFRBYnN0cmFjdEZpbGUsIHBhdGg6IHN0cmluZ30sIGluZGV4OiBudW1iZXIsIGl0ZW1zOiBhbnlbXSkge1xuICAgICAgICBjb25zdCB7ZmlsZSwgcGF0aH0gPSBkYXRhO1xuICAgICAgICBsZXQgbmFtZSA9IGZpbGUubmFtZSB8fCBwYXRoO1xuICAgICAgICBpZiAoaW5kZXggPCBpdGVtcy5sZW5ndGgtMSkgbmFtZSArPSBcIlxcdTAwQTAvXFx1MDBBMFwiO1xuICAgICAgICB0aGlzLmVsLnRleHRDb250ZW50ID0gbmFtZTtcbiAgICAgICAgdGhpcy5lbC5kYXRhc2V0LnBhcmVudFBhdGggPSBmaWxlLnBhcmVudD8ucGF0aCA/PyBcIi9cIjtcbiAgICAgICAgdGhpcy5lbC5kYXRhc2V0LmZpbGVQYXRoID0gcGF0aDtcbiAgICB9XG59XG5cbmV4cG9ydCBjbGFzcyBFeHBsb3JlciB7XG4gICAgbGFzdEZpbGU6IFRBYnN0cmFjdEZpbGUgPSBudWxsO1xuICAgIGxhc3RQYXRoOiBzdHJpbmcgPSBudWxsO1xuICAgIGVsOiBIVE1MRWxlbWVudCA9IDxkaXYgaWQ9XCJxdWljay1leHBsb3JlclwiIC8+O1xuICAgIGxpc3QgPSBsaXN0KHRoaXMuZWwsIEV4cGxvcmFibGUpO1xuXG4gICAgY29uc3RydWN0b3IocHVibGljIGFwcDogQXBwKSB7XG4gICAgICAgIHRoaXMuZWwub24oXCJjb250ZXh0bWVudVwiLCBcIi5leHBsb3JhYmxlXCIsIChldmVudCwgdGFyZ2V0KSA9PiB7XG4gICAgICAgICAgICBjb25zdCB7IGZpbGVQYXRoIH0gPSB0YXJnZXQuZGF0YXNldDtcbiAgICAgICAgICAgIGNvbnN0IGZpbGUgPSBhcHAudmF1bHQuZ2V0QWJzdHJhY3RGaWxlQnlQYXRoKGZpbGVQYXRoKTtcbiAgICAgICAgICAgIG5ldyBDb250ZXh0TWVudShhcHAsIGZpbGUpLmNhc2NhZGUodGFyZ2V0LCBldmVudCk7XG4gICAgICAgIH0pO1xuICAgICAgICB0aGlzLmVsLm9uKFwiY2xpY2tcIiwgXCIuZXhwbG9yYWJsZVwiLCAoZXZlbnQsIHRhcmdldCkgPT4ge1xuICAgICAgICAgICAgY29uc3QgeyBwYXJlbnRQYXRoLCBmaWxlUGF0aCB9ID0gdGFyZ2V0LmRhdGFzZXQ7XG4gICAgICAgICAgICBjb25zdCBmb2xkZXIgPSBhcHAudmF1bHQuZ2V0QWJzdHJhY3RGaWxlQnlQYXRoKHBhcmVudFBhdGgpO1xuICAgICAgICAgICAgY29uc3Qgc2VsZWN0ZWQgPSBhcHAudmF1bHQuZ2V0QWJzdHJhY3RGaWxlQnlQYXRoKGZpbGVQYXRoKTtcbiAgICAgICAgICAgIG5ldyBGb2xkZXJNZW51KGFwcCwgZm9sZGVyIGFzIFRGb2xkZXIsIHNlbGVjdGVkKS5jYXNjYWRlKHRhcmdldCwgZXZlbnQuaXNUcnVzdGVkICYmIGV2ZW50KTtcbiAgICAgICAgfSk7XG4gICAgICAgIHRoaXMuZWwub24oJ2RyYWdzdGFydCcsIFwiLmV4cGxvcmFibGVcIiwgKGV2ZW50LCB0YXJnZXQpID0+IHtcbiAgICAgICAgICAgIHN0YXJ0RHJhZyhhcHAsIHRhcmdldC5kYXRhc2V0LmZpbGVQYXRoLCBldmVudCk7XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIGJyb3dzZVZhdWx0KCkge1xuICAgICAgICAodGhpcy5lbC5maXJzdEVsZW1lbnRDaGlsZCBhcyBIVE1MRGl2RWxlbWVudCkuY2xpY2soKTtcbiAgICB9XG5cbiAgICBicm93c2VDdXJyZW50KCkge1xuICAgICAgICAodGhpcy5lbC5sYXN0RWxlbWVudENoaWxkIGFzIEhUTUxEaXZFbGVtZW50KS5jbGljaygpO1xuICAgIH1cblxuICAgIHVwZGF0ZShmaWxlOiBUQWJzdHJhY3RGaWxlKSB7XG4gICAgICAgIGZpbGUgPz89IHRoaXMuYXBwLnZhdWx0LmdldEFic3RyYWN0RmlsZUJ5UGF0aChcIi9cIik7XG4gICAgICAgIGlmIChmaWxlID09IHRoaXMubGFzdEZpbGUgJiYgZmlsZS5wYXRoID09IHRoaXMubGFzdFBhdGgpIHJldHVybjtcbiAgICAgICAgdGhpcy5sYXN0RmlsZSA9IGZpbGU7XG4gICAgICAgIHRoaXMubGFzdFBhdGggPSBmaWxlLnBhdGg7XG4gICAgICAgIGNvbnN0IHBhcnRzID0gW107XG4gICAgICAgIHdoaWxlIChmaWxlKSB7XG4gICAgICAgICAgICBwYXJ0cy51bnNoaWZ0KHsgZmlsZSwgcGF0aDogZmlsZS5wYXRoIH0pO1xuICAgICAgICAgICAgZmlsZSA9IGZpbGUucGFyZW50O1xuICAgICAgICB9XG4gICAgICAgIGlmIChwYXJ0cy5sZW5ndGggPiAxKSBwYXJ0cy5zaGlmdCgpO1xuICAgICAgICB0aGlzLmxpc3QudXBkYXRlKHBhcnRzKTtcbiAgICB9XG5cbn1cbiIsImltcG9ydCB7UGx1Z2luLCBUQWJzdHJhY3RGaWxlfSBmcm9tIFwib2JzaWRpYW5cIjtcbmltcG9ydCB7bW91bnQsIHVubW91bnR9IGZyb20gXCJyZWRvbVwiO1xuaW1wb3J0IHtFeHBsb3JlciwgaG92ZXJTb3VyY2V9IGZyb20gXCIuL0V4cGxvcmVyXCI7XG5cbmltcG9ydCBcIi4vcmVkb20tanN4XCI7XG5pbXBvcnQgXCIuL3N0eWxlcy5zY3NzXCJcblxuZGVjbGFyZSBtb2R1bGUgXCJvYnNpZGlhblwiIHtcbiAgICBpbnRlcmZhY2UgV29ya3NwYWNlIHtcbiAgICAgICAgcmVnaXN0ZXJIb3ZlckxpbmtTb3VyY2Uoc291cmNlOiBzdHJpbmcsIGluZm86IHtkaXNwbGF5OiBzdHJpbmcsIGRlZmF1bHRNb2Q/OiBib29sZWFufSk6IHZvaWRcbiAgICAgICAgdW5yZWdpc3RlckhvdmVyTGlua1NvdXJjZShzb3VyY2U6IHN0cmluZyk6IHZvaWRcbiAgICB9XG59XG5cbmV4cG9ydCBkZWZhdWx0IGNsYXNzIGV4dGVuZHMgUGx1Z2luIHtcbiAgICBzdGF0dXNiYXJJdGVtOiBIVE1MRWxlbWVudFxuICAgIGV4cGxvcmVyOiBFeHBsb3JlclxuXG4gICAgb25sb2FkKCkge1xuICAgICAgICB0aGlzLmFwcC53b3Jrc3BhY2Uub25MYXlvdXRSZWFkeSggKCkgPT4ge1xuICAgICAgICAgICAgY29uc3QgYnV0dG9uQ29udGFpbmVyID0gZG9jdW1lbnQuYm9keS5maW5kKFwiLnRpdGxlYmFyIC50aXRsZWJhci1idXR0b24tY29udGFpbmVyLm1vZC1sZWZ0XCIpO1xuICAgICAgICAgICAgdGhpcy5yZWdpc3RlcigoKSA9PiB1bm1vdW50KGJ1dHRvbkNvbnRhaW5lciwgdGhpcy5leHBsb3JlcikpO1xuICAgICAgICAgICAgbW91bnQoYnV0dG9uQ29udGFpbmVyLCB0aGlzLmV4cGxvcmVyID0gbmV3IEV4cGxvcmVyKHRoaXMuYXBwKSk7XG4gICAgICAgICAgICB0aGlzLmV4cGxvcmVyLnVwZGF0ZSh0aGlzLmFwcC53b3Jrc3BhY2UuZ2V0QWN0aXZlRmlsZSgpKVxuICAgICAgICB9KTtcbiAgICAgICAgdGhpcy5yZWdpc3RlckV2ZW50KHRoaXMuYXBwLndvcmtzcGFjZS5vbihcImZpbGUtb3BlblwiLCB0aGlzLmV4cGxvcmVyLnVwZGF0ZSwgdGhpcy5leHBsb3JlcikpO1xuICAgICAgICB0aGlzLnJlZ2lzdGVyRXZlbnQodGhpcy5hcHAudmF1bHQub24oXCJyZW5hbWVcIiwgdGhpcy5vbkZpbGVDaGFuZ2UsIHRoaXMpKTtcbiAgICAgICAgdGhpcy5yZWdpc3RlckV2ZW50KHRoaXMuYXBwLnZhdWx0Lm9uKFwiZGVsZXRlXCIsIHRoaXMub25GaWxlQ2hhbmdlLCB0aGlzKSk7XG4gICAgICAgIHRoaXMuYXBwLndvcmtzcGFjZS5yZWdpc3RlckhvdmVyTGlua1NvdXJjZShob3ZlclNvdXJjZSwge1xuICAgICAgICAgICAgZGlzcGxheTogJ1F1aWNrIEV4cGxvcmVyJywgZGVmYXVsdE1vZDogdHJ1ZVxuICAgICAgICB9KTtcblxuICAgICAgICB0aGlzLmFkZENvbW1hbmQoeyBpZDogXCJicm93c2UtdmF1bHRcIiwgICBuYW1lOiBcIkJyb3dzZSB2YXVsdFwiLCAgICAgICAgICBjYWxsYmFjazogKCkgPT4geyB0aGlzLmV4cGxvcmVyPy5icm93c2VWYXVsdCgpOyB9LCB9KTtcbiAgICAgICAgdGhpcy5hZGRDb21tYW5kKHsgaWQ6IFwiYnJvd3NlLWN1cnJlbnRcIiwgbmFtZTogXCJCcm93c2UgY3VycmVudCBmb2xkZXJcIiwgY2FsbGJhY2s6ICgpID0+IHsgdGhpcy5leHBsb3Jlcj8uYnJvd3NlQ3VycmVudCgpOyB9LCB9KTtcbiAgICB9XG5cbiAgICBvbnVubG9hZCgpIHtcbiAgICAgICAgdGhpcy5hcHAud29ya3NwYWNlLnVucmVnaXN0ZXJIb3ZlckxpbmtTb3VyY2UoaG92ZXJTb3VyY2UpO1xuICAgIH1cblxuICAgIG9uRmlsZUNoYW5nZShmaWxlOiBUQWJzdHJhY3RGaWxlKSB7XG4gICAgICAgIGlmIChmaWxlID09PSB0aGlzLmV4cGxvcmVyLmxhc3RGaWxlKSB0aGlzLmV4cGxvcmVyLnVwZGF0ZShmaWxlKTtcbiAgICB9XG59XG4iXSwibmFtZXMiOlsiTWVudSIsIkFwcCIsIlRGb2xkZXIiLCJLZXltYXAiLCJOb3RpY2UiLCJURmlsZSIsIlBsdWdpbiJdLCJtYXBwaW5ncyI6Ijs7OztBQUFBLFNBQVMsVUFBVSxFQUFFLEtBQUssRUFBRTtBQUM1QixFQUFFLElBQUksTUFBTSxHQUFHLEtBQUssQ0FBQyxLQUFLLENBQUMsUUFBUSxDQUFDLENBQUM7QUFDckMsRUFBRSxJQUFJLE9BQU8sR0FBRyxFQUFFLENBQUM7QUFDbkIsRUFBRSxJQUFJLEVBQUUsR0FBRyxFQUFFLENBQUM7QUFDZCxFQUFFLElBQUksVUFB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
