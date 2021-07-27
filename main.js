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
        this.match = "";
        this.resetSearchOnTimeout = obsidian.debounce(() => { this.match = ""; }, 1500, true);
        if (parent instanceof PopupMenu)
            parent.setChildMenu(this);
        // Escape to close the menu
        this.scope.register(null, "Escape", this.hide.bind(this));
        this.scope.register([], "ArrowLeft", this.onArrowLeft.bind(this));
        // 0.12.12+
        if (obsidian.Menu.prototype.select) {
            this.scope.register(null, "Home", this.onHome.bind(this));
            this.scope.register(null, "End", this.onEnd.bind(this));
            this.scope.register([], "ArrowRight", this.onArrowRight.bind(this));
        }
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
        this.scope.register(null, null, this.onKeyDown.bind(this));
        super.onload();
    }
    onKeyDown(event) {
        if (event.key.length === 1 && !obsidian.Keymap.getModifiers(event)) {
            let match = this.match + event.key;
            // Throw away pieces of the match until something matches or nothing's left
            while (match && !this.searchFor(match))
                match = match.substr(1);
            this.match = match;
            this.resetSearchOnTimeout();
        }
        return false; // block all keys other than ours
    }
    searchFor(match) {
        const parts = match.split("").map(escapeRegex);
        return (this.find(new RegExp("^" + parts.join(""), "ui")) ||
            this.find(new RegExp("^" + parts.join(".*"), "ui")) ||
            this.find(new RegExp(parts.join(".*"), "ui")));
    }
    find(pattern) {
        let pos = Math.min(0, this.selected);
        for (let i = this.items.length; i; ++pos, i--) {
            if (this.items[pos].disabled)
                continue;
            if (this.items[pos].dom.textContent.match(pattern)) {
                this.select(pos);
                return true;
            }
        }
        return false;
    }
    onEnter(event) {
        const item = this.items[this.selected];
        if (item) {
            item.handleEvent(event);
            // Only hide if we don't have a submenu
            if (!this.child)
                this.hide();
        }
        return false;
    }
    select(n) {
        this.match = ""; // reset search on move
        if (!obsidian.Menu.prototype.select)
            return; // <0.12.12
        super.select(n);
        this.items[this.selected].dom.scrollIntoView();
    }
    unselect() {
        this.items[this.selected]?.dom.removeClass("selected");
    }
    onEnd(e) {
        this.unselect();
        this.selected = this.items.length;
        this.onArrowUp(e);
        if (this.selected === this.items.length)
            this.selected = -1;
    }
    onHome(e) {
        this.unselect();
        this.selected = -1;
        this.onArrowDown(e);
    }
    onArrowLeft() {
        if (this.rootMenu() !== this) {
            this.hide();
            return false;
        }
    }
    onArrowRight() {
        // no-op in base class
        return;
    }
    hide() {
        this.setChildMenu(); // hide child menu(s) first
        return super.hide();
    }
    setChildMenu(menu) {
        this.child?.hide();
        this.child = menu;
    }
    rootMenu() {
        return this.parent instanceof obsidian.App ? this : this.parent.rootMenu();
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
        target.toggleClass("selected", true);
        if (this.parent instanceof obsidian.App || !obsidian.Menu.prototype.select)
            this.onHide(() => target.toggleClass("selected", false));
        return this;
    }
}
function escapeRegex(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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

const alphaSort = new Intl.Collator(undefined, { usage: "sort", sensitivity: "base", numeric: true }).compare;
const previewIcons = {
    markdown: "document",
    image: "image-file",
    audio: "audio-file",
    pdf: "pdf-file",
};
const viewtypeIcons = {
    ...previewIcons,
    // add third-party plugins
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
    constructor(parent, folder, selectedFile, opener) {
        super(parent);
        this.parent = parent;
        this.folder = folder;
        this.selectedFile = selectedFile;
        this.opener = opener;
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
            if (!this.onClickFile(file, target)) {
                // Keep current menu tree open
                event.stopPropagation();
                event.preventDefault();
                return false;
            }
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
        dom.on("mousedown", menuItem, e => { e.stopPropagation(); }, true); // Fix drag cancelling
        dom.on('dragstart', menuItem, (event, target) => {
            startDrag(this.app, target.dataset.filePath, event);
        });
    }
    onArrowLeft() {
        return super.onArrowLeft() ?? this.openBreadcrumb(this.opener?.previousElementSibling);
    }
    openBreadcrumb(element) {
        if (element && this.rootMenu() === this) {
            this.opener.previousElementSibling;
            this.hide();
            element.click();
            return false;
        }
    }
    onArrowRight() {
        const targetEl = this.items[this.selected]?.dom;
        const { filePath } = targetEl?.dataset;
        const file = filePath && this.app.vault.getAbstractFileByPath(filePath);
        if (file instanceof obsidian.TFolder && file !== this.selectedFile) {
            this.onClickFile(file, targetEl);
            return false;
        }
        return this.openBreadcrumb(this.opener?.nextElementSibling);
    }
    loadFiles(folder) {
        const allFiles = this.app.vault.getConfig("showUnsupportedFiles");
        const { children, parent } = folder;
        const items = children.slice().sort((a, b) => alphaSort(a.name, b.name));
        const folders = items.filter(f => f instanceof obsidian.TFolder);
        const files = items.filter(f => f instanceof obsidian.TFile && (allFiles || fileIcon(this.app, f)));
        folders.sort((a, b) => alphaSort(a.name, b.name));
        files.sort((a, b) => alphaSort(a.basename, b.basename));
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
            i.onClick(e => this.onClickFile(file, i.dom));
            if (file === this.selectedFile) {
                i.dom.addClass("selected"); // < 0.12.12
                this.select(this.items.length - 1);
            }
        });
    }
    onClickFile(file, target, event) {
        if (file instanceof obsidian.TFile) {
            if (this.app.viewRegistry.isExtensionRegistered(file.extension)) {
                this.app.workspace.openLinkText(file.path, "", event && obsidian.Keymap.isModifier(event, "Mod"));
                // Close the entire menu tree
                this.rootMenu().hide();
                return true;
            }
            else {
                new obsidian.Notice(`.${file.extension} files cannot be opened in Obsidian; Use "Open in Default App" to open them externally`);
                // fall through
            }
        }
        else if (file === this.parentFolder) {
            // We're a child menu and selected "..": just return to previous menu
            this.hide();
        }
        else if (file === this.folder.parent) {
            // Not a child menu, but selected "..": go to previous breadcrumb
            this.onArrowLeft();
        }
        else if (file === this.selectedFile) {
            // Targeting the initially-selected subfolder: go to next breadcrumb
            this.openBreadcrumb(this.opener?.nextElementSibling);
        }
        else {
            // Otherwise, pop a new menu for the subfolder
            const folderMenu = new FolderMenu(this, file, this.folder);
            folderMenu.cascade(target, event instanceof MouseEvent ? event : undefined);
        }
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
            new FolderMenu(app, folder, selected, target).cascade(target, event.isTrusted && event);
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
            this.registerEvent(this.app.workspace.on("file-open", this.explorer.update, this.explorer));
            this.registerEvent(this.app.vault.on("rename", this.onFileChange, this));
            this.registerEvent(this.app.vault.on("delete", this.onFileChange, this));
        });
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWFpbi5qcyIsInNvdXJjZXMiOlsiLnlhcm4vY2FjaGUvcmVkb20tbnBtLTMuMjcuMS0xNDhjZWZjMzI2LWY2OWI3YTVmMzQuemlwL25vZGVfbW9kdWxlcy9yZWRvbS9kaXN0L3JlZG9tLmVzLmpzIiwiLnlhcm4vY2FjaGUvbW9ua2V5LWFyb3VuZC1ucG0tMi4xLjAtNzBkZjMyZDJhYy0xYmQ3MmQyNWY5LnppcC9ub2RlX21vZHVsZXMvbW9ua2V5LWFyb3VuZC9tanMvaW5kZXguanMiLCJzcmMvbWVudXMudHMiLCJzcmMvQ29udGV4dE1lbnUudHMiLCJzcmMvRm9sZGVyTWVudS50cyIsInNyYy9FeHBsb3Jlci50c3giLCJzcmMvcXVpY2stZXhwbG9yZXIudHN4Il0sInNvdXJjZXNDb250ZW50IjpbImZ1bmN0aW9uIHBhcnNlUXVlcnkgKHF1ZXJ5KSB7XG4gIHZhciBjaHVua3MgPSBxdWVyeS5zcGxpdCgvKFsjLl0pLyk7XG4gIHZhciB0YWdOYW1lID0gJyc7XG4gIHZhciBpZCA9ICcnO1xuICB2YXIgY2xhc3NOYW1lcyA9IFtdO1xuXG4gIGZvciAodmFyIGkgPSAwOyBpIDwgY2h1bmtzLmxlbmd0aDsgaSsrKSB7XG4gICAgdmFyIGNodW5rID0gY2h1bmtzW2ldO1xuICAgIGlmIChjaHVuayA9PT0gJyMnKSB7XG4gICAgICBpZCA9IGNodW5rc1srK2ldO1xuICAgIH0gZWxzZSBpZiAoY2h1bmsgPT09ICcuJykge1xuICAgICAgY2xhc3NOYW1lcy5wdXNoKGNodW5rc1srK2ldKTtcbiAgICB9IGVsc2UgaWYgKGNodW5rLmxlbmd0aCkge1xuICAgICAgdGFnTmFtZSA9IGNodW5rO1xuICAgIH1cbiAgfVxuXG4gIHJldHVybiB7XG4gICAgdGFnOiB0YWdOYW1lIHx8ICdkaXYnLFxuICAgIGlkOiBpZCxcbiAgICBjbGFzc05hbWU6IGNsYXNzTmFtZXMuam9pbignICcpXG4gIH07XG59XG5cbmZ1bmN0aW9uIGNyZWF0ZUVsZW1lbnQgKHF1ZXJ5LCBucykge1xuICB2YXIgcmVmID0gcGFyc2VRdWVyeShxdWVyeSk7XG4gIHZhciB0YWcgPSByZWYudGFnO1xuICB2YXIgaWQgPSByZWYuaWQ7XG4gIHZhciBjbGFzc05hbWUgPSByZWYuY2xhc3NOYW1lO1xuICB2YXIgZWxlbWVudCA9IG5zID8gZG9jdW1lbnQuY3JlYXRlRWxlbWVudE5TKG5zLCB0YWcpIDogZG9jdW1lbnQuY3JlYXRlRWxlbWVudCh0YWcpO1xuXG4gIGlmIChpZCkge1xuICAgIGVsZW1lbnQuaWQgPSBpZDtcbiAgfVxuXG4gIGlmIChjbGFzc05hbWUpIHtcbiAgICBpZiAobnMpIHtcbiAgICAgIGVsZW1lbnQuc2V0QXR0cmlidXRlKCdjbGFzcycsIGNsYXNzTmFtZSk7XG4gICAgfSBlbHNlIHtcbiAgICAgIGVsZW1lbnQuY2xhc3NOYW1lID0gY2xhc3NOYW1lO1xuICAgIH1cbiAgfVxuXG4gIHJldHVybiBlbGVtZW50O1xufVxuXG5mdW5jdGlvbiB1bm1vdW50IChwYXJlbnQsIGNoaWxkKSB7XG4gIHZhciBwYXJlbnRFbCA9IGdldEVsKHBhcmVudCk7XG4gIHZhciBjaGlsZEVsID0gZ2V0RWwoY2hpbGQpO1xuXG4gIGlmIChjaGlsZCA9PT0gY2hpbGRFbCAmJiBjaGlsZEVsLl9fcmVkb21fdmlldykge1xuICAgIC8vIHRyeSB0byBsb29rIHVwIHRoZSB2aWV3IGlmIG5vdCBwcm92aWRlZFxuICAgIGNoaWxkID0gY2hpbGRFbC5fX3JlZG9tX3ZpZXc7XG4gIH1cblxuICBpZiAoY2hpbGRFbC5wYXJlbnROb2RlKSB7XG4gICAgZG9Vbm1vdW50KGNoaWxkLCBjaGlsZEVsLCBwYXJlbnRFbCk7XG5cbiAgICBwYXJlbnRFbC5yZW1vdmVDaGlsZChjaGlsZEVsKTtcbiAgfVxuXG4gIHJldHVybiBjaGlsZDtcbn1cblxuZnVuY3Rpb24gZG9Vbm1vdW50IChjaGlsZCwgY2hpbGRFbCwgcGFyZW50RWwpIHtcbiAgdmFyIGhvb2tzID0gY2hpbGRFbC5fX3JlZG9tX2xpZmVjeWNsZTtcblxuICBpZiAoaG9va3NBcmVFbXB0eShob29rcykpIHtcbiAgICBjaGlsZEVsLl9fcmVkb21fbGlmZWN5Y2xlID0ge307XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgdmFyIHRyYXZlcnNlID0gcGFyZW50RWw7XG5cbiAgaWYgKGNoaWxkRWwuX19yZWRvbV9tb3VudGVkKSB7XG4gICAgdHJpZ2dlcihjaGlsZEVsLCAnb251bm1vdW50Jyk7XG4gIH1cblxuICB3aGlsZSAodHJhdmVyc2UpIHtcbiAgICB2YXIgcGFyZW50SG9va3MgPSB0cmF2ZXJzZS5fX3JlZG9tX2xpZmVjeWNsZSB8fCB7fTtcblxuICAgIGZvciAodmFyIGhvb2sgaW4gaG9va3MpIHtcbiAgICAgIGlmIChwYXJlbnRIb29rc1tob29rXSkge1xuICAgICAgICBwYXJlbnRIb29rc1tob29rXSAtPSBob29rc1tob29rXTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICBpZiAoaG9va3NBcmVFbXB0eShwYXJlbnRIb29rcykpIHtcbiAgICAgIHRyYXZlcnNlLl9fcmVkb21fbGlmZWN5Y2xlID0gbnVsbDtcbiAgICB9XG5cbiAgICB0cmF2ZXJzZSA9IHRyYXZlcnNlLnBhcmVudE5vZGU7XG4gIH1cbn1cblxuZnVuY3Rpb24gaG9va3NBcmVFbXB0eSAoaG9va3MpIHtcbiAgaWYgKGhvb2tzID09IG51bGwpIHtcbiAgICByZXR1cm4gdHJ1ZTtcbiAgfVxuICBmb3IgKHZhciBrZXkgaW4gaG9va3MpIHtcbiAgICBpZiAoaG9va3Nba2V5XSkge1xuICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cbiAgfVxuICByZXR1cm4gdHJ1ZTtcbn1cblxuLyogZ2xvYmFsIE5vZGUsIFNoYWRvd1Jvb3QgKi9cblxudmFyIGhvb2tOYW1lcyA9IFsnb25tb3VudCcsICdvbnJlbW91bnQnLCAnb251bm1vdW50J107XG52YXIgc2hhZG93Um9vdEF2YWlsYWJsZSA9IHR5cGVvZiB3aW5kb3cgIT09ICd1bmRlZmluZWQnICYmICdTaGFkb3dSb290JyBpbiB3aW5kb3c7XG5cbmZ1bmN0aW9uIG1vdW50IChwYXJlbnQsIGNoaWxkLCBiZWZvcmUsIHJlcGxhY2UpIHtcbiAgdmFyIHBhcmVudEVsID0gZ2V0RWwocGFyZW50KTtcbiAgdmFyIGNoaWxkRWwgPSBnZXRFbChjaGlsZCk7XG5cbiAgaWYgKGNoaWxkID09PSBjaGlsZEVsICYmIGNoaWxkRWwuX19yZWRvbV92aWV3KSB7XG4gICAgLy8gdHJ5IHRvIGxvb2sgdXAgdGhlIHZpZXcgaWYgbm90IHByb3ZpZGVkXG4gICAgY2hpbGQgPSBjaGlsZEVsLl9fcmVkb21fdmlldztcbiAgfVxuXG4gIGlmIChjaGlsZCAhPT0gY2hpbGRFbCkge1xuICAgIGNoaWxkRWwuX19yZWRvbV92aWV3ID0gY2hpbGQ7XG4gIH1cblxuICB2YXIgd2FzTW91bnRlZCA9IGNoaWxkRWwuX19yZWRvbV9tb3VudGVkO1xuICB2YXIgb2xkUGFyZW50ID0gY2hpbGRFbC5wYXJlbnROb2RlO1xuXG4gIGlmICh3YXNNb3VudGVkICYmIChvbGRQYXJlbnQgIT09IHBhcmVudEVsKSkge1xuICAgIGRvVW5tb3VudChjaGlsZCwgY2hpbGRFbCwgb2xkUGFyZW50KTtcbiAgfVxuXG4gIGlmIChiZWZvcmUgIT0gbnVsbCkge1xuICAgIGlmIChyZXBsYWNlKSB7XG4gICAgICBwYXJlbnRFbC5yZXBsYWNlQ2hpbGQoY2hpbGRFbCwgZ2V0RWwoYmVmb3JlKSk7XG4gICAgfSBlbHNlIHtcbiAgICAgIHBhcmVudEVsLmluc2VydEJlZm9yZShjaGlsZEVsLCBnZXRFbChiZWZvcmUpKTtcbiAgICB9XG4gIH0gZWxzZSB7XG4gICAgcGFyZW50RWwuYXBwZW5kQ2hpbGQoY2hpbGRFbCk7XG4gIH1cblxuICBkb01vdW50KGNoaWxkLCBjaGlsZEVsLCBwYXJlbnRFbCwgb2xkUGFyZW50KTtcblxuICByZXR1cm4gY2hpbGQ7XG59XG5cbmZ1bmN0aW9uIHRyaWdnZXIgKGVsLCBldmVudE5hbWUpIHtcbiAgaWYgKGV2ZW50TmFtZSA9PT0gJ29ubW91bnQnIHx8IGV2ZW50TmFtZSA9PT0gJ29ucmVtb3VudCcpIHtcbiAgICBlbC5fX3JlZG9tX21vdW50ZWQgPSB0cnVlO1xuICB9IGVsc2UgaWYgKGV2ZW50TmFtZSA9PT0gJ29udW5tb3VudCcpIHtcbiAgICBlbC5fX3JlZG9tX21vdW50ZWQgPSBmYWxzZTtcbiAgfVxuXG4gIHZhciBob29rcyA9IGVsLl9fcmVkb21fbGlmZWN5Y2xlO1xuXG4gIGlmICghaG9va3MpIHtcbiAgICByZXR1cm47XG4gIH1cblxuICB2YXIgdmlldyA9IGVsLl9fcmVkb21fdmlldztcbiAgdmFyIGhvb2tDb3VudCA9IDA7XG5cbiAgdmlldyAmJiB2aWV3W2V2ZW50TmFtZV0gJiYgdmlld1tldmVudE5hbWVdKCk7XG5cbiAgZm9yICh2YXIgaG9vayBpbiBob29rcykge1xuICAgIGlmIChob29rKSB7XG4gICAgICBob29rQ291bnQrKztcbiAgICB9XG4gIH1cblxuICBpZiAoaG9va0NvdW50KSB7XG4gICAgdmFyIHRyYXZlcnNlID0gZWwuZmlyc3RDaGlsZDtcblxuICAgIHdoaWxlICh0cmF2ZXJzZSkge1xuICAgICAgdmFyIG5leHQgPSB0cmF2ZXJzZS5uZXh0U2libGluZztcblxuICAgICAgdHJpZ2dlcih0cmF2ZXJzZSwgZXZlbnROYW1lKTtcblxuICAgICAgdHJhdmVyc2UgPSBuZXh0O1xuICAgIH1cbiAgfVxufVxuXG5mdW5jdGlvbiBkb01vdW50IChjaGlsZCwgY2hpbGRFbCwgcGFyZW50RWwsIG9sZFBhcmVudCkge1xuICB2YXIgaG9va3MgPSBjaGlsZEVsLl9fcmVkb21fbGlmZWN5Y2xlIHx8IChjaGlsZEVsLl9fcmVkb21fbGlmZWN5Y2xlID0ge30pO1xuICB2YXIgcmVtb3VudCA9IChwYXJlbnRFbCA9PT0gb2xkUGFyZW50KTtcbiAgdmFyIGhvb2tzRm91bmQgPSBmYWxzZTtcblxuICBmb3IgKHZhciBpID0gMCwgbGlzdCA9IGhvb2tOYW1lczsgaSA8IGxpc3QubGVuZ3RoOyBpICs9IDEpIHtcbiAgICB2YXIgaG9va05hbWUgPSBsaXN0W2ldO1xuXG4gICAgaWYgKCFyZW1vdW50KSB7IC8vIGlmIGFscmVhZHkgbW91bnRlZCwgc2tpcCB0aGlzIHBoYXNlXG4gICAgICBpZiAoY2hpbGQgIT09IGNoaWxkRWwpIHsgLy8gb25seSBWaWV3cyBjYW4gaGF2ZSBsaWZlY3ljbGUgZXZlbnRzXG4gICAgICAgIGlmIChob29rTmFtZSBpbiBjaGlsZCkge1xuICAgICAgICAgIGhvb2tzW2hvb2tOYW1lXSA9IChob29rc1tob29rTmFtZV0gfHwgMCkgKyAxO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuICAgIGlmIChob29rc1tob29rTmFtZV0pIHtcbiAgICAgIGhvb2tzRm91bmQgPSB0cnVlO1xuICAgIH1cbiAgfVxuXG4gIGlmICghaG9va3NGb3VuZCkge1xuICAgIGNoaWxkRWwuX19yZWRvbV9saWZlY3ljbGUgPSB7fTtcbiAgICByZXR1cm47XG4gIH1cblxuICB2YXIgdHJhdmVyc2UgPSBwYXJlbnRFbDtcbiAgdmFyIHRyaWdnZXJlZCA9IGZhbHNlO1xuXG4gIGlmIChyZW1vdW50IHx8ICh0cmF2ZXJzZSAmJiB0cmF2ZXJzZS5fX3JlZG9tX21vdW50ZWQpKSB7XG4gICAgdHJpZ2dlcihjaGlsZEVsLCByZW1vdW50ID8gJ29ucmVtb3VudCcgOiAnb25tb3VudCcpO1xuICAgIHRyaWdnZXJlZCA9IHRydWU7XG4gIH1cblxuICB3aGlsZSAodHJhdmVyc2UpIHtcbiAgICB2YXIgcGFyZW50ID0gdHJhdmVyc2UucGFyZW50Tm9kZTtcbiAgICB2YXIgcGFyZW50SG9va3MgPSB0cmF2ZXJzZS5fX3JlZG9tX2xpZmVjeWNsZSB8fCAodHJhdmVyc2UuX19yZWRvbV9saWZlY3ljbGUgPSB7fSk7XG5cbiAgICBmb3IgKHZhciBob29rIGluIGhvb2tzKSB7XG4gICAgICBwYXJlbnRIb29rc1tob29rXSA9IChwYXJlbnRIb29rc1tob29rXSB8fCAwKSArIGhvb2tzW2hvb2tdO1xuICAgIH1cblxuICAgIGlmICh0cmlnZ2VyZWQpIHtcbiAgICAgIGJyZWFrO1xuICAgIH0gZWxzZSB7XG4gICAgICBpZiAodHJhdmVyc2Uubm9kZVR5cGUgPT09IE5vZGUuRE9DVU1FTlRfTk9ERSB8fFxuICAgICAgICAoc2hhZG93Um9vdEF2YWlsYWJsZSAmJiAodHJhdmVyc2UgaW5zdGFuY2VvZiBTaGFkb3dSb290KSkgfHxcbiAgICAgICAgKHBhcmVudCAmJiBwYXJlbnQuX19yZWRvbV9tb3VudGVkKVxuICAgICAgKSB7XG4gICAgICAgIHRyaWdnZXIodHJhdmVyc2UsIHJlbW91bnQgPyAnb25yZW1vdW50JyA6ICdvbm1vdW50Jyk7XG4gICAgICAgIHRyaWdnZXJlZCA9IHRydWU7XG4gICAgICB9XG4gICAgICB0cmF2ZXJzZSA9IHBhcmVudDtcbiAgICB9XG4gIH1cbn1cblxuZnVuY3Rpb24gc2V0U3R5bGUgKHZpZXcsIGFyZzEsIGFyZzIpIHtcbiAgdmFyIGVsID0gZ2V0RWwodmlldyk7XG5cbiAgaWYgKHR5cGVvZiBhcmcxID09PSAnb2JqZWN0Jykge1xuICAgIGZvciAodmFyIGtleSBpbiBhcmcxKSB7XG4gICAgICBzZXRTdHlsZVZhbHVlKGVsLCBrZXksIGFyZzFba2V5XSk7XG4gICAgfVxuICB9IGVsc2Uge1xuICAgIHNldFN0eWxlVmFsdWUoZWwsIGFyZzEsIGFyZzIpO1xuICB9XG59XG5cbmZ1bmN0aW9uIHNldFN0eWxlVmFsdWUgKGVsLCBrZXksIHZhbHVlKSB7XG4gIGlmICh2YWx1ZSA9PSBudWxsKSB7XG4gICAgZWwuc3R5bGVba2V5XSA9ICcnO1xuICB9IGVsc2Uge1xuICAgIGVsLnN0eWxlW2tleV0gPSB2YWx1ZTtcbiAgfVxufVxuXG4vKiBnbG9iYWwgU1ZHRWxlbWVudCAqL1xuXG52YXIgeGxpbmtucyA9ICdodHRwOi8vd3d3LnczLm9yZy8xOTk5L3hsaW5rJztcblxuZnVuY3Rpb24gc2V0QXR0ciAodmlldywgYXJnMSwgYXJnMikge1xuICBzZXRBdHRySW50ZXJuYWwodmlldywgYXJnMSwgYXJnMik7XG59XG5cbmZ1bmN0aW9uIHNldEF0dHJJbnRlcm5hbCAodmlldywgYXJnMSwgYXJnMiwgaW5pdGlhbCkge1xuICB2YXIgZWwgPSBnZXRFbCh2aWV3KTtcblxuICB2YXIgaXNPYmogPSB0eXBlb2YgYXJnMSA9PT0gJ29iamVjdCc7XG5cbiAgaWYgKGlzT2JqKSB7XG4gICAgZm9yICh2YXIga2V5IGluIGFyZzEpIHtcbiAgICAgIHNldEF0dHJJbnRlcm5hbChlbCwga2V5LCBhcmcxW2tleV0sIGluaXRpYWwpO1xuICAgIH1cbiAgfSBlbHNlIHtcbiAgICB2YXIgaXNTVkcgPSBlbCBpbnN0YW5jZW9mIFNWR0VsZW1lbnQ7XG4gICAgdmFyIGlzRnVuYyA9IHR5cGVvZiBhcmcyID09PSAnZnVuY3Rpb24nO1xuXG4gICAgaWYgKGFyZzEgPT09ICdzdHlsZScgJiYgdHlwZW9mIGFyZzIgPT09ICdvYmplY3QnKSB7XG4gICAgICBzZXRTdHlsZShlbCwgYXJnMik7XG4gICAgfSBlbHNlIGlmIChpc1NWRyAmJiBpc0Z1bmMpIHtcbiAgICAgIGVsW2FyZzFdID0gYXJnMjtcbiAgICB9IGVsc2UgaWYgKGFyZzEgPT09ICdkYXRhc2V0Jykge1xuICAgICAgc2V0RGF0YShlbCwgYXJnMik7XG4gICAgfSBlbHNlIGlmICghaXNTVkcgJiYgKGFyZzEgaW4gZWwgfHwgaXNGdW5jKSAmJiAoYXJnMSAhPT0gJ2xpc3QnKSkge1xuICAgICAgZWxbYXJnMV0gPSBhcmcyO1xuICAgIH0gZWxzZSB7XG4gICAgICBpZiAoaXNTVkcgJiYgKGFyZzEgPT09ICd4bGluaycpKSB7XG4gICAgICAgIHNldFhsaW5rKGVsLCBhcmcyKTtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuICAgICAgaWYgKGluaXRpYWwgJiYgYXJnMSA9PT0gJ2NsYXNzJykge1xuICAgICAgICBhcmcyID0gZWwuY2xhc3NOYW1lICsgJyAnICsgYXJnMjtcbiAgICAgIH1cbiAgICAgIGlmIChhcmcyID09IG51bGwpIHtcbiAgICAgICAgZWwucmVtb3ZlQXR0cmlidXRlKGFyZzEpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgZWwuc2V0QXR0cmlidXRlKGFyZzEsIGFyZzIpO1xuICAgICAgfVxuICAgIH1cbiAgfVxufVxuXG5mdW5jdGlvbiBzZXRYbGluayAoZWwsIGFyZzEsIGFyZzIpIHtcbiAgaWYgKHR5cGVvZiBhcmcxID09PSAnb2JqZWN0Jykge1xuICAgIGZvciAodmFyIGtleSBpbiBhcmcxKSB7XG4gICAgICBzZXRYbGluayhlbCwga2V5LCBhcmcxW2tleV0pO1xuICAgIH1cbiAgfSBlbHNlIHtcbiAgICBpZiAoYXJnMiAhPSBudWxsKSB7XG4gICAgICBlbC5zZXRBdHRyaWJ1dGVOUyh4bGlua25zLCBhcmcxLCBhcmcyKTtcbiAgICB9IGVsc2Uge1xuICAgICAgZWwucmVtb3ZlQXR0cmlidXRlTlMoeGxpbmtucywgYXJnMSwgYXJnMik7XG4gICAgfVxuICB9XG59XG5cbmZ1bmN0aW9uIHNldERhdGEgKGVsLCBhcmcxLCBhcmcyKSB7XG4gIGlmICh0eXBlb2YgYXJnMSA9PT0gJ29iamVjdCcpIHtcbiAgICBmb3IgKHZhciBrZXkgaW4gYXJnMSkge1xuICAgICAgc2V0RGF0YShlbCwga2V5LCBhcmcxW2tleV0pO1xuICAgIH1cbiAgfSBlbHNlIHtcbiAgICBpZiAoYXJnMiAhPSBudWxsKSB7XG4gICAgICBlbC5kYXRhc2V0W2FyZzFdID0gYXJnMjtcbiAgICB9IGVsc2Uge1xuICAgICAgZGVsZXRlIGVsLmRhdGFzZXRbYXJnMV07XG4gICAgfVxuICB9XG59XG5cbmZ1bmN0aW9uIHRleHQgKHN0cikge1xuICByZXR1cm4gZG9jdW1lbnQuY3JlYXRlVGV4dE5vZGUoKHN0ciAhPSBudWxsKSA/IHN0ciA6ICcnKTtcbn1cblxuZnVuY3Rpb24gcGFyc2VBcmd1bWVudHNJbnRlcm5hbCAoZWxlbWVudCwgYXJncywgaW5pdGlhbCkge1xuICBmb3IgKHZhciBpID0gMCwgbGlzdCA9IGFyZ3M7IGkgPCBsaXN0Lmxlbmd0aDsgaSArPSAxKSB7XG4gICAgdmFyIGFyZyA9IGxpc3RbaV07XG5cbiAgICBpZiAoYXJnICE9PSAwICYmICFhcmcpIHtcbiAgICAgIGNvbnRpbnVlO1xuICAgIH1cblxuICAgIHZhciB0eXBlID0gdHlwZW9mIGFyZztcblxuICAgIGlmICh0eXBlID09PSAnZnVuY3Rpb24nKSB7XG4gICAgICBhcmcoZWxlbWVudCk7XG4gICAgfSBlbHNlIGlmICh0eXBlID09PSAnc3RyaW5nJyB8fCB0eXBlID09PSAnbnVtYmVyJykge1xuICAgICAgZWxlbWVudC5hcHBlbmRDaGlsZCh0ZXh0KGFyZykpO1xuICAgIH0gZWxzZSBpZiAoaXNOb2RlKGdldEVsKGFyZykpKSB7XG4gICAgICBtb3VudChlbGVtZW50LCBhcmcpO1xuICAgIH0gZWxzZSBpZiAoYXJnLmxlbmd0aCkge1xuICAgICAgcGFyc2VBcmd1bWVudHNJbnRlcm5hbChlbGVtZW50LCBhcmcsIGluaXRpYWwpO1xuICAgIH0gZWxzZSBpZiAodHlwZSA9PT0gJ29iamVjdCcpIHtcbiAgICAgIHNldEF0dHJJbnRlcm5hbChlbGVtZW50LCBhcmcsIG51bGwsIGluaXRpYWwpO1xuICAgIH1cbiAgfVxufVxuXG5mdW5jdGlvbiBlbnN1cmVFbCAocGFyZW50KSB7XG4gIHJldHVybiB0eXBlb2YgcGFyZW50ID09PSAnc3RyaW5nJyA/IGh0bWwocGFyZW50KSA6IGdldEVsKHBhcmVudCk7XG59XG5cbmZ1bmN0aW9uIGdldEVsIChwYXJlbnQpIHtcbiAgcmV0dXJuIChwYXJlbnQubm9kZVR5cGUgJiYgcGFyZW50KSB8fCAoIXBhcmVudC5lbCAmJiBwYXJlbnQpIHx8IGdldEVsKHBhcmVudC5lbCk7XG59XG5cbmZ1bmN0aW9uIGlzTm9kZSAoYXJnKSB7XG4gIHJldHVybiBhcmcgJiYgYXJnLm5vZGVUeXBlO1xufVxuXG52YXIgaHRtbENhY2hlID0ge307XG5cbmZ1bmN0aW9uIGh0bWwgKHF1ZXJ5KSB7XG4gIHZhciBhcmdzID0gW10sIGxlbiA9IGFyZ3VtZW50cy5sZW5ndGggLSAxO1xuICB3aGlsZSAoIGxlbi0tID4gMCApIGFyZ3NbIGxlbiBdID0gYXJndW1lbnRzWyBsZW4gKyAxIF07XG5cbiAgdmFyIGVsZW1lbnQ7XG5cbiAgdmFyIHR5cGUgPSB0eXBlb2YgcXVlcnk7XG5cbiAgaWYgKHR5cGUgPT09ICdzdHJpbmcnKSB7XG4gICAgZWxlbWVudCA9IG1lbW9pemVIVE1MKHF1ZXJ5KS5jbG9uZU5vZGUoZmFsc2UpO1xuICB9IGVsc2UgaWYgKGlzTm9kZShxdWVyeSkpIHtcbiAgICBlbGVtZW50ID0gcXVlcnkuY2xvbmVOb2RlKGZhbHNlKTtcbiAgfSBlbHNlIGlmICh0eXBlID09PSAnZnVuY3Rpb24nKSB7XG4gICAgdmFyIFF1ZXJ5ID0gcXVlcnk7XG4gICAgZWxlbWVudCA9IG5ldyAoRnVuY3Rpb24ucHJvdG90eXBlLmJpbmQuYXBwbHkoIFF1ZXJ5LCBbIG51bGwgXS5jb25jYXQoIGFyZ3MpICkpO1xuICB9IGVsc2Uge1xuICAgIHRocm93IG5ldyBFcnJvcignQXQgbGVhc3Qgb25lIGFyZ3VtZW50IHJlcXVpcmVkJyk7XG4gIH1cblxuICBwYXJzZUFyZ3VtZW50c0ludGVybmFsKGdldEVsKGVsZW1lbnQpLCBhcmdzLCB0cnVlKTtcblxuICByZXR1cm4gZWxlbWVudDtcbn1cblxudmFyIGVsID0gaHRtbDtcbnZhciBoID0gaHRtbDtcblxuaHRtbC5leHRlbmQgPSBmdW5jdGlvbiBleHRlbmRIdG1sIChxdWVyeSkge1xuICB2YXIgYXJncyA9IFtdLCBsZW4gPSBhcmd1bWVudHMubGVuZ3RoIC0gMTtcbiAgd2hpbGUgKCBsZW4tLSA+IDAgKSBhcmdzWyBsZW4gXSA9IGFyZ3VtZW50c1sgbGVuICsgMSBdO1xuXG4gIHZhciBjbG9uZSA9IG1lbW9pemVIVE1MKHF1ZXJ5KTtcblxuICByZXR1cm4gaHRtbC5iaW5kLmFwcGx5KGh0bWwsIFsgdGhpcywgY2xvbmUgXS5jb25jYXQoIGFyZ3MgKSk7XG59O1xuXG5mdW5jdGlvbiBtZW1vaXplSFRNTCAocXVlcnkpIHtcbiAgcmV0dXJuIGh0bWxDYWNoZVtxdWVyeV0gfHwgKGh0bWxDYWNoZVtxdWVyeV0gPSBjcmVhdGVFbGVtZW50KHF1ZXJ5KSk7XG59XG5cbmZ1bmN0aW9uIHNldENoaWxkcmVuIChwYXJlbnQpIHtcbiAgdmFyIGNoaWxkcmVuID0gW10sIGxlbiA9IGFyZ3VtZW50cy5sZW5ndGggLSAxO1xuICB3aGlsZSAoIGxlbi0tID4gMCApIGNoaWxkcmVuWyBsZW4gXSA9IGFyZ3VtZW50c1sgbGVuICsgMSBdO1xuXG4gIHZhciBwYXJlbnRFbCA9IGdldEVsKHBhcmVudCk7XG4gIHZhciBjdXJyZW50ID0gdHJhdmVyc2UocGFyZW50LCBjaGlsZHJlbiwgcGFyZW50RWwuZmlyc3RDaGlsZCk7XG5cbiAgd2hpbGUgKGN1cnJlbnQpIHtcbiAgICB2YXIgbmV4dCA9IGN1cnJlbnQubmV4dFNpYmxpbmc7XG5cbiAgICB1bm1vdW50KHBhcmVudCwgY3VycmVudCk7XG5cbiAgICBjdXJyZW50ID0gbmV4dDtcbiAgfVxufVxuXG5mdW5jdGlvbiB0cmF2ZXJzZSAocGFyZW50LCBjaGlsZHJlbiwgX2N1cnJlbnQpIHtcbiAgdmFyIGN1cnJlbnQgPSBfY3VycmVudDtcblxuICB2YXIgY2hpbGRFbHMgPSBuZXcgQXJyYXkoY2hpbGRyZW4ubGVuZ3RoKTtcblxuICBmb3IgKHZhciBpID0gMDsgaSA8IGNoaWxkcmVuLmxlbmd0aDsgaSsrKSB7XG4gICAgY2hpbGRFbHNbaV0gPSBjaGlsZHJlbltpXSAmJiBnZXRFbChjaGlsZHJlbltpXSk7XG4gIH1cblxuICBmb3IgKHZhciBpJDEgPSAwOyBpJDEgPCBjaGlsZHJlbi5sZW5ndGg7IGkkMSsrKSB7XG4gICAgdmFyIGNoaWxkID0gY2hpbGRyZW5baSQxXTtcblxuICAgIGlmICghY2hpbGQpIHtcbiAgICAgIGNvbnRpbnVlO1xuICAgIH1cblxuICAgIHZhciBjaGlsZEVsID0gY2hpbGRFbHNbaSQxXTtcblxuICAgIGlmIChjaGlsZEVsID09PSBjdXJyZW50KSB7XG4gICAgICBjdXJyZW50ID0gY3VycmVudC5uZXh0U2libGluZztcbiAgICAgIGNvbnRpbnVlO1xuICAgIH1cblxuICAgIGlmIChpc05vZGUoY2hpbGRFbCkpIHtcbiAgICAgIHZhciBuZXh0ID0gY3VycmVudCAmJiBjdXJyZW50Lm5leHRTaWJsaW5nO1xuICAgICAgdmFyIGV4aXN0cyA9IGNoaWxkLl9fcmVkb21faW5kZXggIT0gbnVsbDtcbiAgICAgIHZhciByZXBsYWNlID0gZXhpc3RzICYmIG5leHQgPT09IGNoaWxkRWxzW2kkMSArIDFdO1xuXG4gICAgICBtb3VudChwYXJlbnQsIGNoaWxkLCBjdXJyZW50LCByZXBsYWNlKTtcblxuICAgICAgaWYgKHJlcGxhY2UpIHtcbiAgICAgICAgY3VycmVudCA9IG5leHQ7XG4gICAgICB9XG5cbiAgICAgIGNvbnRpbnVlO1xuICAgIH1cblxuICAgIGlmIChjaGlsZC5sZW5ndGggIT0gbnVsbCkge1xuICAgICAgY3VycmVudCA9IHRyYXZlcnNlKHBhcmVudCwgY2hpbGQsIGN1cnJlbnQpO1xuICAgIH1cbiAgfVxuXG4gIHJldHVybiBjdXJyZW50O1xufVxuXG5mdW5jdGlvbiBsaXN0UG9vbCAoVmlldywga2V5LCBpbml0RGF0YSkge1xuICByZXR1cm4gbmV3IExpc3RQb29sKFZpZXcsIGtleSwgaW5pdERhdGEpO1xufVxuXG52YXIgTGlzdFBvb2wgPSBmdW5jdGlvbiBMaXN0UG9vbCAoVmlldywga2V5LCBpbml0RGF0YSkge1xuICB0aGlzLlZpZXcgPSBWaWV3O1xuICB0aGlzLmluaXREYXRhID0gaW5pdERhdGE7XG4gIHRoaXMub2xkTG9va3VwID0ge307XG4gIHRoaXMubG9va3VwID0ge307XG4gIHRoaXMub2xkVmlld3MgPSBbXTtcbiAgdGhpcy52aWV3cyA9IFtdO1xuXG4gIGlmIChrZXkgIT0gbnVsbCkge1xuICAgIHRoaXMua2V5ID0gdHlwZW9mIGtleSA9PT0gJ2Z1bmN0aW9uJyA/IGtleSA6IHByb3BLZXkoa2V5KTtcbiAgfVxufTtcblxuTGlzdFBvb2wucHJvdG90eXBlLnVwZGF0ZSA9IGZ1bmN0aW9uIHVwZGF0ZSAoZGF0YSwgY29udGV4dCkge1xuICB2YXIgcmVmID0gdGhpcztcbiAgICB2YXIgVmlldyA9IHJlZi5WaWV3O1xuICAgIHZhciBrZXkgPSByZWYua2V5O1xuICAgIHZhciBpbml0RGF0YSA9IHJlZi5pbml0RGF0YTtcbiAgdmFyIGtleVNldCA9IGtleSAhPSBudWxsO1xuXG4gIHZhciBvbGRMb29rdXAgPSB0aGlzLmxvb2t1cDtcbiAgdmFyIG5ld0xvb2t1cCA9IHt9O1xuXG4gIHZhciBuZXdWaWV3cyA9IG5ldyBBcnJheShkYXRhLmxlbmd0aCk7XG4gIHZhciBvbGRWaWV3cyA9IHRoaXMudmlld3M7XG5cbiAgZm9yICh2YXIgaSA9IDA7IGkgPCBkYXRhLmxlbmd0aDsgaSsrKSB7XG4gICAgdmFyIGl0ZW0gPSBkYXRhW2ldO1xuICAgIHZhciB2aWV3ID0gKHZvaWQgMCk7XG5cbiAgICBpZiAoa2V5U2V0KSB7XG4gICAgICB2YXIgaWQgPSBrZXkoaXRlbSk7XG5cbiAgICAgIHZpZXcgPSBvbGRMb29rdXBbaWRdIHx8IG5ldyBWaWV3KGluaXREYXRhLCBpdGVtLCBpLCBkYXRhKTtcbiAgICAgIG5ld0xvb2t1cFtpZF0gPSB2aWV3O1xuICAgICAgdmlldy5fX3JlZG9tX2lkID0gaWQ7XG4gICAgfSBlbHNlIHtcbiAgICAgIHZpZXcgPSBvbGRWaWV3c1tpXSB8fCBuZXcgVmlldyhpbml0RGF0YSwgaXRlbSwgaSwgZGF0YSk7XG4gICAgfVxuICAgIHZpZXcudXBkYXRlICYmIHZpZXcudXBkYXRlKGl0ZW0sIGksIGRhdGEsIGNvbnRleHQpO1xuXG4gICAgdmFyIGVsID0gZ2V0RWwodmlldy5lbCk7XG5cbiAgICBlbC5fX3JlZG9tX3ZpZXcgPSB2aWV3O1xuICAgIG5ld1ZpZXdzW2ldID0gdmlldztcbiAgfVxuXG4gIHRoaXMub2xkVmlld3MgPSBvbGRWaWV3cztcbiAgdGhpcy52aWV3cyA9IG5ld1ZpZXdzO1xuXG4gIHRoaXMub2xkTG9va3VwID0gb2xkTG9va3VwO1xuICB0aGlzLmxvb2t1cCA9IG5ld0xvb2t1cDtcbn07XG5cbmZ1bmN0aW9uIHByb3BLZXkgKGtleSkge1xuICByZXR1cm4gZnVuY3Rpb24gKGl0ZW0pIHtcbiAgICByZXR1cm4gaXRlbVtrZXldO1xuICB9O1xufVxuXG5mdW5jdGlvbiBsaXN0IChwYXJlbnQsIFZpZXcsIGtleSwgaW5pdERhdGEpIHtcbiAgcmV0dXJuIG5ldyBMaXN0KHBhcmVudCwgVmlldywga2V5LCBpbml0RGF0YSk7XG59XG5cbnZhciBMaXN0ID0gZnVuY3Rpb24gTGlzdCAocGFyZW50LCBWaWV3LCBrZXksIGluaXREYXRhKSB7XG4gIHRoaXMuVmlldyA9IFZpZXc7XG4gIHRoaXMuaW5pdERhdGEgPSBpbml0RGF0YTtcbiAgdGhpcy52aWV3cyA9IFtdO1xuICB0aGlzLnBvb2wgPSBuZXcgTGlzdFBvb2woVmlldywga2V5LCBpbml0RGF0YSk7XG4gIHRoaXMuZWwgPSBlbnN1cmVFbChwYXJlbnQpO1xuICB0aGlzLmtleVNldCA9IGtleSAhPSBudWxsO1xufTtcblxuTGlzdC5wcm90b3R5cGUudXBkYXRlID0gZnVuY3Rpb24gdXBkYXRlIChkYXRhLCBjb250ZXh0KSB7XG4gICAgaWYgKCBkYXRhID09PSB2b2lkIDAgKSBkYXRhID0gW107XG5cbiAgdmFyIHJlZiA9IHRoaXM7XG4gICAgdmFyIGtleVNldCA9IHJlZi5rZXlTZXQ7XG4gIHZhciBvbGRWaWV3cyA9IHRoaXMudmlld3M7XG5cbiAgdGhpcy5wb29sLnVwZGF0ZShkYXRhLCBjb250ZXh0KTtcblxuICB2YXIgcmVmJDEgPSB0aGlzLnBvb2w7XG4gICAgdmFyIHZpZXdzID0gcmVmJDEudmlld3M7XG4gICAgdmFyIGxvb2t1cCA9IHJlZiQxLmxvb2t1cDtcblxuICBpZiAoa2V5U2V0KSB7XG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBvbGRWaWV3cy5sZW5ndGg7IGkrKykge1xuICAgICAgdmFyIG9sZFZpZXcgPSBvbGRWaWV3c1tpXTtcbiAgICAgIHZhciBpZCA9IG9sZFZpZXcuX19yZWRvbV9pZDtcblxuICAgICAgaWYgKGxvb2t1cFtpZF0gPT0gbnVsbCkge1xuICAgICAgICBvbGRWaWV3Ll9fcmVkb21faW5kZXggPSBudWxsO1xuICAgICAgICB1bm1vdW50KHRoaXMsIG9sZFZpZXcpO1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIGZvciAodmFyIGkkMSA9IDA7IGkkMSA8IHZpZXdzLmxlbmd0aDsgaSQxKyspIHtcbiAgICB2YXIgdmlldyA9IHZpZXdzW2kkMV07XG5cbiAgICB2aWV3Ll9fcmVkb21faW5kZXggPSBpJDE7XG4gIH1cblxuICBzZXRDaGlsZHJlbih0aGlzLCB2aWV3cyk7XG5cbiAgaWYgKGtleVNldCkge1xuICAgIHRoaXMubG9va3VwID0gbG9va3VwO1xuICB9XG4gIHRoaXMudmlld3MgPSB2aWV3cztcbn07XG5cbkxpc3QuZXh0ZW5kID0gZnVuY3Rpb24gZXh0ZW5kTGlzdCAocGFyZW50LCBWaWV3LCBrZXksIGluaXREYXRhKSB7XG4gIHJldHVybiBMaXN0LmJpbmQoTGlzdCwgcGFyZW50LCBWaWV3LCBrZXksIGluaXREYXRhKTtcbn07XG5cbmxpc3QuZXh0ZW5kID0gTGlzdC5leHRlbmQ7XG5cbi8qIGdsb2JhbCBOb2RlICovXG5cbmZ1bmN0aW9uIHBsYWNlIChWaWV3LCBpbml0RGF0YSkge1xuICByZXR1cm4gbmV3IFBsYWNlKFZpZXcsIGluaXREYXRhKTtcbn1cblxudmFyIFBsYWNlID0gZnVuY3Rpb24gUGxhY2UgKFZpZXcsIGluaXREYXRhKSB7XG4gIHRoaXMuZWwgPSB0ZXh0KCcnKTtcbiAgdGhpcy52aXNpYmxlID0gZmFsc2U7XG4gIHRoaXMudmlldyA9IG51bGw7XG4gIHRoaXMuX3BsYWNlaG9sZGVyID0gdGhpcy5lbDtcblxuICBpZiAoVmlldyBpbnN0YW5jZW9mIE5vZGUpIHtcbiAgICB0aGlzLl9lbCA9IFZpZXc7XG4gIH0gZWxzZSBpZiAoVmlldy5lbCBpbnN0YW5jZW9mIE5vZGUpIHtcbiAgICB0aGlzLl9lbCA9IFZpZXc7XG4gICAgdGhpcy52aWV3ID0gVmlldztcbiAgfSBlbHNlIHtcbiAgICB0aGlzLl9WaWV3ID0gVmlldztcbiAgfVxuXG4gIHRoaXMuX2luaXREYXRhID0gaW5pdERhdGE7XG59O1xuXG5QbGFjZS5wcm90b3R5cGUudXBkYXRlID0gZnVuY3Rpb24gdXBkYXRlICh2aXNpYmxlLCBkYXRhKSB7XG4gIHZhciBwbGFjZWhvbGRlciA9IHRoaXMuX3BsYWNlaG9sZGVyO1xuICB2YXIgcGFyZW50Tm9kZSA9IHRoaXMuZWwucGFyZW50Tm9kZTtcblxuICBpZiAodmlzaWJsZSkge1xuICAgIGlmICghdGhpcy52aXNpYmxlKSB7XG4gICAgICBpZiAodGhpcy5fZWwpIHtcbiAgICAgICAgbW91bnQocGFyZW50Tm9kZSwgdGhpcy5fZWwsIHBsYWNlaG9sZGVyKTtcbiAgICAgICAgdW5tb3VudChwYXJlbnROb2RlLCBwbGFjZWhvbGRlcik7XG5cbiAgICAgICAgdGhpcy5lbCA9IGdldEVsKHRoaXMuX2VsKTtcbiAgICAgICAgdGhpcy52aXNpYmxlID0gdmlzaWJsZTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHZhciBWaWV3ID0gdGhpcy5fVmlldztcbiAgICAgICAgdmFyIHZpZXcgPSBuZXcgVmlldyh0aGlzLl9pbml0RGF0YSk7XG5cbiAgICAgICAgdGhpcy5lbCA9IGdldEVsKHZpZXcpO1xuICAgICAgICB0aGlzLnZpZXcgPSB2aWV3O1xuXG4gICAgICAgIG1vdW50KHBhcmVudE5vZGUsIHZpZXcsIHBsYWNlaG9sZGVyKTtcbiAgICAgICAgdW5tb3VudChwYXJlbnROb2RlLCBwbGFjZWhvbGRlcik7XG4gICAgICB9XG4gICAgfVxuICAgIHRoaXMudmlldyAmJiB0aGlzLnZpZXcudXBkYXRlICYmIHRoaXMudmlldy51cGRhdGUoZGF0YSk7XG4gIH0gZWxzZSB7XG4gICAgaWYgKHRoaXMudmlzaWJsZSkge1xuICAgICAgaWYgKHRoaXMuX2VsKSB7XG4gICAgICAgIG1vdW50KHBhcmVudE5vZGUsIHBsYWNlaG9sZGVyLCB0aGlzLl9lbCk7XG4gICAgICAgIHVubW91bnQocGFyZW50Tm9kZSwgdGhpcy5fZWwpO1xuXG4gICAgICAgIHRoaXMuZWwgPSBwbGFjZWhvbGRlcjtcbiAgICAgICAgdGhpcy52aXNpYmxlID0gdmlzaWJsZTtcblxuICAgICAgICByZXR1cm47XG4gICAgICB9XG4gICAgICBtb3VudChwYXJlbnROb2RlLCBwbGFjZWhvbGRlciwgdGhpcy52aWV3KTtcbiAgICAgIHVubW91bnQocGFyZW50Tm9kZSwgdGhpcy52aWV3KTtcblxuICAgICAgdGhpcy5lbCA9IHBsYWNlaG9sZGVyO1xuICAgICAgdGhpcy52aWV3ID0gbnVsbDtcbiAgICB9XG4gIH1cbiAgdGhpcy52aXNpYmxlID0gdmlzaWJsZTtcbn07XG5cbi8qIGdsb2JhbCBOb2RlICovXG5cbmZ1bmN0aW9uIHJvdXRlciAocGFyZW50LCBWaWV3cywgaW5pdERhdGEpIHtcbiAgcmV0dXJuIG5ldyBSb3V0ZXIocGFyZW50LCBWaWV3cywgaW5pdERhdGEpO1xufVxuXG52YXIgUm91dGVyID0gZnVuY3Rpb24gUm91dGVyIChwYXJlbnQsIFZpZXdzLCBpbml0RGF0YSkge1xuICB0aGlzLmVsID0gZW5zdXJlRWwocGFyZW50KTtcbiAgdGhpcy5WaWV3cyA9IFZpZXdzO1xuICB0aGlzLmluaXREYXRhID0gaW5pdERhdGE7XG59O1xuXG5Sb3V0ZXIucHJvdG90eXBlLnVwZGF0ZSA9IGZ1bmN0aW9uIHVwZGF0ZSAocm91dGUsIGRhdGEpIHtcbiAgaWYgKHJvdXRlICE9PSB0aGlzLnJvdXRlKSB7XG4gICAgdmFyIFZpZXdzID0gdGhpcy5WaWV3cztcbiAgICB2YXIgVmlldyA9IFZpZXdzW3JvdXRlXTtcblxuICAgIHRoaXMucm91dGUgPSByb3V0ZTtcblxuICAgIGlmIChWaWV3ICYmIChWaWV3IGluc3RhbmNlb2YgTm9kZSB8fCBWaWV3LmVsIGluc3RhbmNlb2YgTm9kZSkpIHtcbiAgICAgIHRoaXMudmlldyA9IFZpZXc7XG4gICAgfSBlbHNlIHtcbiAgICAgIHRoaXMudmlldyA9IFZpZXcgJiYgbmV3IFZpZXcodGhpcy5pbml0RGF0YSwgZGF0YSk7XG4gICAgfVxuXG4gICAgc2V0Q2hpbGRyZW4odGhpcy5lbCwgW3RoaXMudmlld10pO1xuICB9XG4gIHRoaXMudmlldyAmJiB0aGlzLnZpZXcudXBkYXRlICYmIHRoaXMudmlldy51cGRhdGUoZGF0YSwgcm91dGUpO1xufTtcblxudmFyIG5zID0gJ2h0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnJztcblxudmFyIHN2Z0NhY2hlID0ge307XG5cbmZ1bmN0aW9uIHN2ZyAocXVlcnkpIHtcbiAgdmFyIGFyZ3MgPSBbXSwgbGVuID0gYXJndW1lbnRzLmxlbmd0aCAtIDE7XG4gIHdoaWxlICggbGVuLS0gPiAwICkgYXJnc1sgbGVuIF0gPSBhcmd1bWVudHNbIGxlbiArIDEgXTtcblxuICB2YXIgZWxlbWVudDtcblxuICB2YXIgdHlwZSA9IHR5cGVvZiBxdWVyeTtcblxuICBpZiAodHlwZSA9PT0gJ3N0cmluZycpIHtcbiAgICBlbGVtZW50ID0gbWVtb2l6ZVNWRyhxdWVyeSkuY2xvbmVOb2RlKGZhbHNlKTtcbiAgfSBlbHNlIGlmIChpc05vZGUocXVlcnkpKSB7XG4gICAgZWxlbWVudCA9IHF1ZXJ5LmNsb25lTm9kZShmYWxzZSk7XG4gIH0gZWxzZSBpZiAodHlwZSA9PT0gJ2Z1bmN0aW9uJykge1xuICAgIHZhciBRdWVyeSA9IHF1ZXJ5O1xuICAgIGVsZW1lbnQgPSBuZXcgKEZ1bmN0aW9uLnByb3RvdHlwZS5iaW5kLmFwcGx5KCBRdWVyeSwgWyBudWxsIF0uY29uY2F0KCBhcmdzKSApKTtcbiAgfSBlbHNlIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ0F0IGxlYXN0IG9uZSBhcmd1bWVudCByZXF1aXJlZCcpO1xuICB9XG5cbiAgcGFyc2VBcmd1bWVudHNJbnRlcm5hbChnZXRFbChlbGVtZW50KSwgYXJncywgdHJ1ZSk7XG5cbiAgcmV0dXJuIGVsZW1lbnQ7XG59XG5cbnZhciBzID0gc3ZnO1xuXG5zdmcuZXh0ZW5kID0gZnVuY3Rpb24gZXh0ZW5kU3ZnIChxdWVyeSkge1xuICB2YXIgY2xvbmUgPSBtZW1vaXplU1ZHKHF1ZXJ5KTtcblxuICByZXR1cm4gc3ZnLmJpbmQodGhpcywgY2xvbmUpO1xufTtcblxuc3ZnLm5zID0gbnM7XG5cbmZ1bmN0aW9uIG1lbW9pemVTVkcgKHF1ZXJ5KSB7XG4gIHJldHVybiBzdmdDYWNoZVtxdWVyeV0gfHwgKHN2Z0NhY2hlW3F1ZXJ5XSA9IGNyZWF0ZUVsZW1lbnQocXVlcnksIG5zKSk7XG59XG5cbmV4cG9ydCB7IExpc3QsIExpc3RQb29sLCBQbGFjZSwgUm91dGVyLCBlbCwgaCwgaHRtbCwgbGlzdCwgbGlzdFBvb2wsIG1vdW50LCBwbGFjZSwgcm91dGVyLCBzLCBzZXRBdHRyLCBzZXRDaGlsZHJlbiwgc2V0RGF0YSwgc2V0U3R5bGUsIHNldFhsaW5rLCBzdmcsIHRleHQsIHVubW91bnQgfTtcbiIsImV4cG9ydCBmdW5jdGlvbiBhcm91bmQob2JqLCBmYWN0b3JpZXMpIHtcbiAgICBjb25zdCByZW1vdmVycyA9IE9iamVjdC5rZXlzKGZhY3RvcmllcykubWFwKGtleSA9PiBhcm91bmQxKG9iaiwga2V5LCBmYWN0b3JpZXNba2V5XSkpO1xuICAgIHJldHVybiByZW1vdmVycy5sZW5ndGggPT09IDEgPyByZW1vdmVyc1swXSA6IGZ1bmN0aW9uICgpIHsgcmVtb3ZlcnMuZm9yRWFjaChyID0+IHIoKSk7IH07XG59XG5mdW5jdGlvbiBhcm91bmQxKG9iaiwgbWV0aG9kLCBjcmVhdGVXcmFwcGVyKSB7XG4gICAgY29uc3Qgb3JpZ2luYWwgPSBvYmpbbWV0aG9kXSwgaGFkT3duID0gb2JqLmhhc093blByb3BlcnR5KG1ldGhvZCk7XG4gICAgbGV0IGN1cnJlbnQgPSBjcmVhdGVXcmFwcGVyKG9yaWdpbmFsKTtcbiAgICAvLyBMZXQgb3VyIHdyYXBwZXIgaW5oZXJpdCBzdGF0aWMgcHJvcHMgZnJvbSB0aGUgd3JhcHBpbmcgbWV0aG9kLFxuICAgIC8vIGFuZCB0aGUgd3JhcHBpbmcgbWV0aG9kLCBwcm9wcyBmcm9tIHRoZSBvcmlnaW5hbCBtZXRob2RcbiAgICBpZiAob3JpZ2luYWwpXG4gICAgICAgIE9iamVjdC5zZXRQcm90b3R5cGVPZihjdXJyZW50LCBvcmlnaW5hbCk7XG4gICAgT2JqZWN0LnNldFByb3RvdHlwZU9mKHdyYXBwZXIsIGN1cnJlbnQpO1xuICAgIG9ialttZXRob2RdID0gd3JhcHBlcjtcbiAgICAvLyBSZXR1cm4gYSBjYWxsYmFjayB0byBhbGxvdyBzYWZlIHJlbW92YWxcbiAgICByZXR1cm4gcmVtb3ZlO1xuICAgIGZ1bmN0aW9uIHdyYXBwZXIoLi4uYXJncykge1xuICAgICAgICAvLyBJZiB3ZSBoYXZlIGJlZW4gZGVhY3RpdmF0ZWQgYW5kIGFyZSBubyBsb25nZXIgd3JhcHBlZCwgcmVtb3ZlIG91cnNlbHZlc1xuICAgICAgICBpZiAoY3VycmVudCA9PT0gb3JpZ2luYWwgJiYgb2JqW21ldGhvZF0gPT09IHdyYXBwZXIpXG4gICAgICAgICAgICByZW1vdmUoKTtcbiAgICAgICAgcmV0dXJuIGN1cnJlbnQuYXBwbHkodGhpcywgYXJncyk7XG4gICAgfVxuICAgIGZ1bmN0aW9uIHJlbW92ZSgpIHtcbiAgICAgICAgLy8gSWYgbm8gb3RoZXIgcGF0Y2hlcywganVzdCBkbyBhIGRpcmVjdCByZW1vdmFsXG4gICAgICAgIGlmIChvYmpbbWV0aG9kXSA9PT0gd3JhcHBlcikge1xuICAgICAgICAgICAgaWYgKGhhZE93bilcbiAgICAgICAgICAgICAgICBvYmpbbWV0aG9kXSA9IG9yaWdpbmFsO1xuICAgICAgICAgICAgZWxzZVxuICAgICAgICAgICAgICAgIGRlbGV0ZSBvYmpbbWV0aG9kXTtcbiAgICAgICAgfVxuICAgICAgICBpZiAoY3VycmVudCA9PT0gb3JpZ2luYWwpXG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIC8vIEVsc2UgcGFzcyBmdXR1cmUgY2FsbHMgdGhyb3VnaCwgYW5kIHJlbW92ZSB3cmFwcGVyIGZyb20gdGhlIHByb3RvdHlwZSBjaGFpblxuICAgICAgICBjdXJyZW50ID0gb3JpZ2luYWw7XG4gICAgICAgIE9iamVjdC5zZXRQcm90b3R5cGVPZih3cmFwcGVyLCBvcmlnaW5hbCB8fCBGdW5jdGlvbik7XG4gICAgfVxufVxuZXhwb3J0IGZ1bmN0aW9uIGFmdGVyKHByb21pc2UsIGNiKSB7XG4gICAgcmV0dXJuIHByb21pc2UudGhlbihjYiwgY2IpO1xufVxuZXhwb3J0IGZ1bmN0aW9uIHNlcmlhbGl6ZShhc3luY0Z1bmN0aW9uKSB7XG4gICAgbGV0IGxhc3RSdW4gPSBQcm9taXNlLnJlc29sdmUoKTtcbiAgICBmdW5jdGlvbiB3cmFwcGVyKC4uLmFyZ3MpIHtcbiAgICAgICAgcmV0dXJuIGxhc3RSdW4gPSBuZXcgUHJvbWlzZSgocmVzLCByZWopID0+IHtcbiAgICAgICAgICAgIGFmdGVyKGxhc3RSdW4sICgpID0+IHtcbiAgICAgICAgICAgICAgICBhc3luY0Z1bmN0aW9uLmFwcGx5KHRoaXMsIGFyZ3MpLnRoZW4ocmVzLCByZWopO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0pO1xuICAgIH1cbiAgICB3cmFwcGVyLmFmdGVyID0gZnVuY3Rpb24gKCkge1xuICAgICAgICByZXR1cm4gbGFzdFJ1biA9IG5ldyBQcm9taXNlKChyZXMsIHJlaikgPT4geyBhZnRlcihsYXN0UnVuLCByZXMpOyB9KTtcbiAgICB9O1xuICAgIHJldHVybiB3cmFwcGVyO1xufVxuIiwiaW1wb3J0IHtNZW51LCBBcHAsIE1lbnVJdGVtLCBkZWJvdW5jZSwgS2V5bWFwfSBmcm9tIFwib2JzaWRpYW5cIjtcbmltcG9ydCB7YXJvdW5kfSBmcm9tIFwibW9ua2V5LWFyb3VuZFwiO1xuXG5kZWNsYXJlIG1vZHVsZSBcIm9ic2lkaWFuXCIge1xuICAgIGludGVyZmFjZSBNZW51IHtcbiAgICAgICAgYXBwOiBBcHBcbiAgICAgICAgZG9tOiBIVE1MRGl2RWxlbWVudFxuICAgICAgICBzY29wZTogU2NvcGVcbiAgICAgICAgaXRlbXM6IE1lbnVJdGVtW11cblxuICAgICAgICAvLyAwLjEyLjEyK1xuICAgICAgICBzZWxlY3Q/KG46IG51bWJlcik6IHZvaWRcbiAgICAgICAgc2VsZWN0ZWQ6IG51bWJlclxuICAgICAgICBvbkFycm93RG93bj8oZTogS2V5Ym9hcmRFdmVudCk6IGZhbHNlXG4gICAgICAgIG9uQXJyb3dVcChlOiBLZXlib2FyZEV2ZW50KTogZmFsc2VcbiAgICB9XG5cbiAgICBleHBvcnQgY29uc3QgS2V5bWFwOiB7XG4gICAgICAgIGlzTW9kaWZpZXIoZXZlbnQ6IEV2ZW50LCBtb2RpZmllcjogc3RyaW5nKTogYm9vbGVhblxuICAgICAgICBnZXRNb2RpZmllcnMoZXZlbnQ6IEV2ZW50KTogc3RyaW5nXG4gICAgfVxuXG4gICAgaW50ZXJmYWNlIE1lbnVJdGVtIHtcbiAgICAgICAgZG9tOiBIVE1MRGl2RWxlbWVudFxuICAgICAgICBoYW5kbGVFdmVudChldmVudDogRXZlbnQpOiB2b2lkXG4gICAgICAgIGRpc2FibGVkOiBib29sZWFuXG4gICAgfVxufVxuXG5leHBvcnQgdHlwZSBNZW51UGFyZW50ID0gQXBwIHwgUG9wdXBNZW51O1xuXG5leHBvcnQgY2xhc3MgUG9wdXBNZW51IGV4dGVuZHMgTWVudSB7XG4gICAgLyoqIFRoZSBjaGlsZCBtZW51IHBvcHBlZCB1cCBvdmVyIHRoaXMgb25lICovXG4gICAgY2hpbGQ6IE1lbnVcblxuICAgIG1hdGNoOiBzdHJpbmcgPSBcIlwiXG4gICAgcmVzZXRTZWFyY2hPblRpbWVvdXQgPSBkZWJvdW5jZSgoKSA9PiB7dGhpcy5tYXRjaCA9IFwiXCI7fSwgMTUwMCwgdHJ1ZSlcblxuICAgIGNvbnN0cnVjdG9yKHB1YmxpYyBwYXJlbnQ6IE1lbnVQYXJlbnQpIHtcbiAgICAgICAgc3VwZXIocGFyZW50IGluc3RhbmNlb2YgQXBwID8gcGFyZW50IDogcGFyZW50LmFwcCk7XG4gICAgICAgIGlmIChwYXJlbnQgaW5zdGFuY2VvZiBQb3B1cE1lbnUpIHBhcmVudC5zZXRDaGlsZE1lbnUodGhpcyk7XG5cbiAgICAgICAgLy8gRXNjYXBlIHRvIGNsb3NlIHRoZSBtZW51XG4gICAgICAgIHRoaXMuc2NvcGUucmVnaXN0ZXIobnVsbCwgXCJFc2NhcGVcIiwgdGhpcy5oaWRlLmJpbmQodGhpcykpO1xuICAgICAgICB0aGlzLnNjb3BlLnJlZ2lzdGVyKFtdLCBcIkFycm93TGVmdFwiLCB0aGlzLm9uQXJyb3dMZWZ0LmJpbmQodGhpcykpO1xuXG4gICAgICAgIC8vIDAuMTIuMTIrXG4gICAgICAgIGlmIChNZW51LnByb3RvdHlwZS5zZWxlY3QpIHtcbiAgICAgICAgICAgIHRoaXMuc2NvcGUucmVnaXN0ZXIobnVsbCwgXCJIb21lXCIsIHRoaXMub25Ib21lLmJpbmQodGhpcykpO1xuICAgICAgICAgICAgdGhpcy5zY29wZS5yZWdpc3RlcihudWxsLCBcIkVuZFwiLCAgdGhpcy5vbkVuZC5iaW5kKHRoaXMpKTtcbiAgICAgICAgICAgIHRoaXMuc2NvcGUucmVnaXN0ZXIoW10sIFwiQXJyb3dSaWdodFwiLCB0aGlzLm9uQXJyb3dSaWdodC5iaW5kKHRoaXMpKTtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIE1ha2Ugb2JzaWRpYW4uTWVudSB0aGluayBtb3VzZWRvd25zIG9uIG91ciBjaGlsZCBtZW51KHMpIGFyZSBoYXBwZW5pbmdcbiAgICAgICAgLy8gb24gdXMsIHNvIHdlIHdvbid0IGNsb3NlIGJlZm9yZSBhbiBhY3R1YWwgY2xpY2sgb2NjdXJzXG4gICAgICAgIGNvbnN0IG1lbnUgPSB0aGlzO1xuICAgICAgICBhcm91bmQodGhpcy5kb20sIHtjb250YWlucyhwcmV2KXsgcmV0dXJuIGZ1bmN0aW9uKHRhcmdldDogTm9kZSkge1xuICAgICAgICAgICAgY29uc3QgcmV0ID0gcHJldi5jYWxsKHRoaXMsIHRhcmdldCkgfHwgbWVudS5jaGlsZD8uZG9tLmNvbnRhaW5zKHRhcmdldCk7XG4gICAgICAgICAgICByZXR1cm4gcmV0O1xuICAgICAgICB9fX0pO1xuICAgIH1cblxuICAgIG9ubG9hZCgpIHtcbiAgICAgICAgdGhpcy5zY29wZS5yZWdpc3RlcihudWxsLCBudWxsLCB0aGlzLm9uS2V5RG93bi5iaW5kKHRoaXMpKTtcbiAgICAgICAgc3VwZXIub25sb2FkKCk7XG4gICAgfVxuXG4gICAgb25LZXlEb3duKGV2ZW50OiBLZXlib2FyZEV2ZW50KSB7XG4gICAgICAgIGlmIChldmVudC5rZXkubGVuZ3RoID09PSAxICYmICFLZXltYXAuZ2V0TW9kaWZpZXJzKGV2ZW50KSkge1xuICAgICAgICAgICAgbGV0IG1hdGNoID0gdGhpcy5tYXRjaCArIGV2ZW50LmtleTtcbiAgICAgICAgICAgIC8vIFRocm93IGF3YXkgcGllY2VzIG9mIHRoZSBtYXRjaCB1bnRpbCBzb21ldGhpbmcgbWF0Y2hlcyBvciBub3RoaW5nJ3MgbGVmdFxuICAgICAgICAgICAgd2hpbGUgKG1hdGNoICYmICF0aGlzLnNlYXJjaEZvcihtYXRjaCkpIG1hdGNoID0gbWF0Y2guc3Vic3RyKDEpO1xuICAgICAgICAgICAgdGhpcy5tYXRjaCA9IG1hdGNoO1xuICAgICAgICAgICAgdGhpcy5yZXNldFNlYXJjaE9uVGltZW91dCgpO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBmYWxzZTsgICAvLyBibG9jayBhbGwga2V5cyBvdGhlciB0aGFuIG91cnNcbiAgICB9XG5cbiAgICBzZWFyY2hGb3IobWF0Y2g6IHN0cmluZykge1xuICAgICAgICBjb25zdCBwYXJ0cyA9IG1hdGNoLnNwbGl0KFwiXCIpLm1hcChlc2NhcGVSZWdleCk7XG4gICAgICAgIHJldHVybiAoXG4gICAgICAgICAgICB0aGlzLmZpbmQobmV3IFJlZ0V4cChcIl5cIisgcGFydHMuam9pbihcIlwiKSwgXCJ1aVwiKSkgfHxcbiAgICAgICAgICAgIHRoaXMuZmluZChuZXcgUmVnRXhwKFwiXlwiKyBwYXJ0cy5qb2luKFwiLipcIiksIFwidWlcIikpIHx8XG4gICAgICAgICAgICB0aGlzLmZpbmQobmV3IFJlZ0V4cChwYXJ0cy5qb2luKFwiLipcIiksIFwidWlcIikpXG4gICAgICAgICk7XG4gICAgfVxuXG4gICAgZmluZChwYXR0ZXJuOiBSZWdFeHApIHtcbiAgICAgICAgbGV0IHBvcyA9IE1hdGgubWluKDAsIHRoaXMuc2VsZWN0ZWQpO1xuICAgICAgICBmb3IgKGxldCBpPXRoaXMuaXRlbXMubGVuZ3RoOyBpOyArK3BvcywgaS0tKSB7XG4gICAgICAgICAgICBpZiAodGhpcy5pdGVtc1twb3NdLmRpc2FibGVkKSBjb250aW51ZTtcbiAgICAgICAgICAgIGlmICh0aGlzLml0ZW1zW3Bvc10uZG9tLnRleHRDb250ZW50Lm1hdGNoKHBhdHRlcm4pKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5zZWxlY3QocG9zKTtcbiAgICAgICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gZmFsc2VcbiAgICB9XG5cbiAgICBvbkVudGVyKGV2ZW50OiBLZXlib2FyZEV2ZW50KSB7XG4gICAgICAgIGNvbnN0IGl0ZW0gPSB0aGlzLml0ZW1zW3RoaXMuc2VsZWN0ZWRdO1xuICAgICAgICBpZiAoaXRlbSkge1xuICAgICAgICAgICAgaXRlbS5oYW5kbGVFdmVudChldmVudCk7XG4gICAgICAgICAgICAvLyBPbmx5IGhpZGUgaWYgd2UgZG9uJ3QgaGF2ZSBhIHN1Ym1lbnVcbiAgICAgICAgICAgIGlmICghdGhpcy5jaGlsZCkgdGhpcy5oaWRlKCk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cblxuICAgIHNlbGVjdChuOiBudW1iZXIpIHtcbiAgICAgICAgdGhpcy5tYXRjaCA9IFwiXCIgLy8gcmVzZXQgc2VhcmNoIG9uIG1vdmVcbiAgICAgICAgaWYgKCFNZW51LnByb3RvdHlwZS5zZWxlY3QpIHJldHVybjsgIC8vIDwwLjEyLjEyXG4gICAgICAgIHN1cGVyLnNlbGVjdChuKTtcbiAgICAgICAgdGhpcy5pdGVtc1t0aGlzLnNlbGVjdGVkXS5kb20uc2Nyb2xsSW50b1ZpZXcoKVxuICAgIH1cblxuICAgIHVuc2VsZWN0KCkge1xuICAgICAgICB0aGlzLml0ZW1zW3RoaXMuc2VsZWN0ZWRdPy5kb20ucmVtb3ZlQ2xhc3MoXCJzZWxlY3RlZFwiKTtcbiAgICB9XG5cbiAgICBvbkVuZChlOiBLZXlib2FyZEV2ZW50KSB7XG4gICAgICAgIHRoaXMudW5zZWxlY3QoKTtcbiAgICAgICAgdGhpcy5zZWxlY3RlZCA9IHRoaXMuaXRlbXMubGVuZ3RoO1xuICAgICAgICB0aGlzLm9uQXJyb3dVcChlKTtcbiAgICAgICAgaWYgKHRoaXMuc2VsZWN0ZWQgPT09IHRoaXMuaXRlbXMubGVuZ3RoKSB0aGlzLnNlbGVjdGVkID0gLTE7XG4gICAgfVxuXG4gICAgb25Ib21lKGU6IEtleWJvYXJkRXZlbnQpIHtcbiAgICAgICAgdGhpcy51bnNlbGVjdCgpO1xuICAgICAgICB0aGlzLnNlbGVjdGVkID0gLTE7XG4gICAgICAgIHRoaXMub25BcnJvd0Rvd24oZSk7XG4gICAgfVxuXG4gICAgb25BcnJvd0xlZnQoKTogYm9vbGVhbiB8IHVuZGVmaW5lZCB7XG4gICAgICAgIGlmICh0aGlzLnJvb3RNZW51KCkgIT09IHRoaXMpIHtcbiAgICAgICAgICAgIHRoaXMuaGlkZSgpO1xuICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgb25BcnJvd1JpZ2h0KCk6IGJvb2xlYW4gfCB1bmRlZmluZWQge1xuICAgICAgICAvLyBuby1vcCBpbiBiYXNlIGNsYXNzXG4gICAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBoaWRlKCkge1xuICAgICAgICB0aGlzLnNldENoaWxkTWVudSgpOyAgLy8gaGlkZSBjaGlsZCBtZW51KHMpIGZpcnN0XG4gICAgICAgIHJldHVybiBzdXBlci5oaWRlKCk7XG4gICAgfVxuXG4gICAgc2V0Q2hpbGRNZW51KG1lbnU/OiBNZW51KSB7XG4gICAgICAgIHRoaXMuY2hpbGQ/LmhpZGUoKTtcbiAgICAgICAgdGhpcy5jaGlsZCA9IG1lbnU7XG4gICAgfVxuXG4gICAgcm9vdE1lbnUoKTogUG9wdXBNZW51IHtcbiAgICAgICAgcmV0dXJuIHRoaXMucGFyZW50IGluc3RhbmNlb2YgQXBwID8gdGhpcyA6IHRoaXMucGFyZW50LnJvb3RNZW51KCk7XG4gICAgfVxuXG4gICAgY2FzY2FkZSh0YXJnZXQ6IEhUTUxFbGVtZW50LCBldmVudD86IE1vdXNlRXZlbnQsICBoT3ZlcmxhcCA9IDE1LCB2T3ZlcmxhcCA9IDUpIHtcbiAgICAgICAgY29uc3Qge2xlZnQsIHJpZ2h0LCB0b3AsIGJvdHRvbX0gPSB0YXJnZXQuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCk7XG4gICAgICAgIGNvbnN0IGNlbnRlclggPSAobGVmdCtyaWdodCkvMiwgY2VudGVyWSA9ICh0b3ArYm90dG9tKS8yO1xuICAgICAgICBjb25zdCB7aW5uZXJIZWlnaHQsIGlubmVyV2lkdGh9ID0gd2luZG93O1xuXG4gICAgICAgIC8vIFRyeSB0byBjYXNjYWRlIGRvd24gYW5kIHRvIHRoZSByaWdodCBmcm9tIHRoZSBtb3VzZSBvciBob3Jpem9udGFsIGNlbnRlclxuICAgICAgICAvLyBvZiB0aGUgY2xpY2tlZCBpdGVtXG4gICAgICAgIGNvbnN0IHBvaW50ID0ge3g6IGV2ZW50ID8gZXZlbnQuY2xpZW50WCAgLSBoT3ZlcmxhcCA6IGNlbnRlclggLCB5OiBib3R0b20gLSB2T3ZlcmxhcH07XG5cbiAgICAgICAgLy8gTWVhc3VyZSB0aGUgbWVudSBhbmQgc2VlIGlmIGl0IGZpdHNcbiAgICAgICAgZG9jdW1lbnQuYm9keS5hcHBlbmRDaGlsZCh0aGlzLmRvbSk7XG4gICAgICAgIGNvbnN0IHtvZmZzZXRXaWR0aCwgb2Zmc2V0SGVpZ2h0fSA9IHRoaXMuZG9tO1xuICAgICAgICBjb25zdCBmaXRzQmVsb3cgPSBwb2ludC55ICsgb2Zmc2V0SGVpZ2h0IDwgaW5uZXJIZWlnaHQ7XG4gICAgICAgIGNvbnN0IGZpdHNSaWdodCA9IHBvaW50LnggKyBvZmZzZXRXaWR0aCA8PSBpbm5lcldpZHRoO1xuXG4gICAgICAgIC8vIElmIGl0IGRvZXNuJ3QgZml0IHVuZGVybmVhdGggdXMsIHBvc2l0aW9uIGl0IGF0IHRoZSBib3R0b20gb2YgdGhlIHNjcmVlbiwgdW5sZXNzXG4gICAgICAgIC8vIHRoZSBjbGlja2VkIGl0ZW0gaXMgY2xvc2UgdG8gdGhlIGJvdHRvbSAoaW4gd2hpY2ggY2FzZSwgcG9zaXRpb24gaXQgYWJvdmUgc29cbiAgICAgICAgLy8gdGhlIGl0ZW0gd2lsbCBzdGlsbCBiZSB2aXNpYmxlLilcbiAgICAgICAgaWYgKCFmaXRzQmVsb3cpIHtcbiAgICAgICAgICAgIHBvaW50LnkgPSAoYm90dG9tID4gaW5uZXJIZWlnaHQgLSAoYm90dG9tLXRvcCkpID8gdG9wICsgdk92ZXJsYXA6IGlubmVySGVpZ2h0O1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gSWYgaXQgZG9lc24ndCBmaXQgdG8gdGhlIHJpZ2h0LCB0aGVuIHBvc2l0aW9uIGl0IGF0IHRoZSByaWdodCBlZGdlIG9mIHRoZSBzY3JlZW4sXG4gICAgICAgIC8vIHNvIGxvbmcgYXMgaXQgZml0cyBlbnRpcmVseSBhYm92ZSBvciBiZWxvdyB1cy4gIE90aGVyd2lzZSwgcG9zaXRpb24gaXQgdXNpbmcgdGhlXG4gICAgICAgIC8vIGl0ZW0gY2VudGVyLCBzbyBhdCBsZWFzdCBvbmUgc2lkZSBvZiB0aGUgcHJldmlvdXMgbWVudS9pdGVtIHdpbGwgc3RpbGwgYmUgc2Vlbi5cbiAgICAgICAgaWYgKCFmaXRzUmlnaHQpIHtcbiAgICAgICAgICAgIHBvaW50LnggPSAob2Zmc2V0SGVpZ2h0IDwgKGJvdHRvbSAtIHZPdmVybGFwKSB8fCBmaXRzQmVsb3cpID8gaW5uZXJXaWR0aCA6IGNlbnRlclg7XG4gICAgICAgIH1cblxuICAgICAgICAvLyBEb25lISAgU2hvdyBvdXIgd29yay5cbiAgICAgICAgdGhpcy5zaG93QXRQb3NpdGlvbihwb2ludCk7XG5cbiAgICAgICAgLy8gRmxhZyB0aGUgY2xpY2tlZCBpdGVtIGFzIGFjdGl2ZSwgdW50aWwgd2UgY2xvc2VcbiAgICAgICAgdGFyZ2V0LnRvZ2dsZUNsYXNzKFwic2VsZWN0ZWRcIiwgdHJ1ZSk7XG4gICAgICAgIGlmICh0aGlzLnBhcmVudCBpbnN0YW5jZW9mIEFwcCB8fCAhTWVudS5wcm90b3R5cGUuc2VsZWN0KSB0aGlzLm9uSGlkZSgoKSA9PiB0YXJnZXQudG9nZ2xlQ2xhc3MoXCJzZWxlY3RlZFwiLCBmYWxzZSkpO1xuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9XG59XG5cbmZ1bmN0aW9uIGVzY2FwZVJlZ2V4KHM6IHN0cmluZykge1xuICAgIHJldHVybiBzLnJlcGxhY2UoL1suKis/XiR7fSgpfFtcXF1cXFxcXS9nLCAnXFxcXCQmJyk7XG59IiwiaW1wb3J0IHsgS2V5bWFwLCBOb3RpY2UsIFRBYnN0cmFjdEZpbGUsIFRGaWxlLCBURm9sZGVyLCBWaWV3IH0gZnJvbSBcIm9ic2lkaWFuXCI7XG5pbXBvcnQgeyBQb3B1cE1lbnUsIE1lbnVQYXJlbnQgfSBmcm9tIFwiLi9tZW51c1wiO1xuaW1wb3J0IHtpMThufSBmcm9tIFwiaTE4bmV4dFwiO1xuXG5kZWNsYXJlIGdsb2JhbCB7XG4gICAgY29uc3QgaTE4bmV4dDogaTE4blxufVxuXG5kZWNsYXJlIG1vZHVsZSBcIm9ic2lkaWFuXCIge1xuICAgIGludGVyZmFjZSBBcHAge1xuICAgICAgICBzZXRBdHRhY2htZW50Rm9sZGVyKGZvbGRlcjogVEZvbGRlcik6IHZvaWRcbiAgICAgICAgaW50ZXJuYWxQbHVnaW5zOiB7XG4gICAgICAgICAgICBwbHVnaW5zOiB7XG4gICAgICAgICAgICAgICAgXCJmaWxlLWV4cGxvcmVyXCI6IHtcbiAgICAgICAgICAgICAgICAgICAgZW5hYmxlZDogYm9vbGVhblxuICAgICAgICAgICAgICAgICAgICBpbnN0YW5jZToge1xuICAgICAgICAgICAgICAgICAgICAgICAgcmV2ZWFsSW5Gb2xkZXIoZmlsZTogVEFic3RyYWN0RmlsZSk6IHZvaWRcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cbiAgICBpbnRlcmZhY2UgRmlsZU1hbmFnZXIge1xuICAgICAgICBwcm9tcHRGb3JGb2xkZXJEZWxldGlvbihmb2xkZXI6IFRGb2xkZXIpOiB2b2lkXG4gICAgICAgIHByb21wdEZvckZpbGVEZWxldGlvbihmaWxlOiBURmlsZSk6IHZvaWRcbiAgICAgICAgcHJvbXB0Rm9yRmlsZVJlbmFtZShmaWxlOiBURmlsZSk6IHZvaWRcbiAgICAgICAgY3JlYXRlTmV3TWFya2Rvd25GaWxlKHBhcmVudEZvbGRlcj86IFRGb2xkZXIsIHBhdHRlcm4/OiBzdHJpbmcpOiBQcm9taXNlPFRGaWxlPlxuICAgIH1cbn1cblxuaW50ZXJmYWNlIEZpbGVFeHBsb3JlclZpZXcgZXh0ZW5kcyBWaWV3IHtcbiAgICBjcmVhdGVBYnN0cmFjdEZpbGUoa2luZDogXCJmaWxlXCIgfCBcImZvbGRlclwiLCBwYXJlbnQ6IFRGb2xkZXIsIG5ld0xlYWY/OiBib29sZWFuKTogUHJvbWlzZTx2b2lkPlxuICAgIHN0YXJ0UmVuYW1lRmlsZShmaWxlOiBUQWJzdHJhY3RGaWxlKTogUHJvbWlzZTx2b2lkPlxufVxuXG5mdW5jdGlvbiBvcHROYW1lKG5hbWU6IHN0cmluZykge1xuICAgIHJldHVybiBpMThuZXh0LnQoYHBsdWdpbnMuZmlsZS1leHBsb3Jlci5tZW51LW9wdC0ke25hbWV9YCk7XG59XG5cbmV4cG9ydCBjbGFzcyBDb250ZXh0TWVudSBleHRlbmRzIFBvcHVwTWVudSB7XG4gICAgY29uc3RydWN0b3IocGFyZW50OiBNZW51UGFyZW50LCBmaWxlOiBUQWJzdHJhY3RGaWxlKSB7XG4gICAgICAgIHN1cGVyKHBhcmVudCk7XG4gICAgICAgIGNvbnN0IHsgd29ya3NwYWNlIH0gPSB0aGlzLmFwcDtcbiAgICAgICAgY29uc3QgaGF2ZUZpbGVFeHBsb3JlciA9IHRoaXMuYXBwLmludGVybmFsUGx1Z2lucy5wbHVnaW5zW1wiZmlsZS1leHBsb3JlclwiXS5lbmFibGVkO1xuXG4gICAgICAgIGlmIChmaWxlIGluc3RhbmNlb2YgVEZvbGRlcikge1xuICAgICAgICAgICAgdGhpcy5hZGRJdGVtKGkgPT4gaS5zZXRUaXRsZShvcHROYW1lKFwibmV3LW5vdGVcIikpLnNldEljb24oXCJjcmVhdGUtbmV3XCIpLm9uQ2xpY2soYXN5bmMgZSA9PiB7XG4gICAgICAgICAgICAgICAgY29uc3QgbmV3RmlsZSA9IGF3YWl0IHRoaXMuYXBwLmZpbGVNYW5hZ2VyLmNyZWF0ZU5ld01hcmtkb3duRmlsZShmaWxlKTtcbiAgICAgICAgICAgICAgICBpZiAobmV3RmlsZSkgYXdhaXQgdGhpcy5hcHAud29ya3NwYWNlLmdldExlYWYoS2V5bWFwLmlzTW9kaWZpZXIoZSwgXCJNb2RcIikpLm9wZW5GaWxlKG5ld0ZpbGUsIHtcbiAgICAgICAgICAgICAgICAgICAgYWN0aXZlOiAhMCwgc3RhdGU6IHsgbW9kZTogXCJzb3VyY2VcIiB9LCBlU3RhdGU6IHsgcmVuYW1lOiBcImFsbFwiIH1cbiAgICAgICAgICAgICAgICB9KVxuICAgICAgICAgICAgfSkpO1xuICAgICAgICAgICAgdGhpcy5hZGRJdGVtKGkgPT4gaS5zZXRUaXRsZShvcHROYW1lKFwibmV3LWZvbGRlclwiKSkuc2V0SWNvbihcImZvbGRlclwiKS5zZXREaXNhYmxlZCghaGF2ZUZpbGVFeHBsb3Jlcikub25DbGljayhldmVudCA9PiB7XG4gICAgICAgICAgICAgICAgaWYgKGhhdmVGaWxlRXhwbG9yZXIpIHtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy53aXRoRXhwbG9yZXIoZmlsZSk/LmNyZWF0ZUFic3RyYWN0RmlsZShcImZvbGRlclwiLCBmaWxlKTtcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICBuZXcgTm90aWNlKFwiVGhlIEZpbGUgRXhwbG9yZXIgY29yZSBwbHVnaW4gbXVzdCBiZSBlbmFibGVkIHRvIHJlbmFtZSBmb2xkZXJzXCIpXG4gICAgICAgICAgICAgICAgICAgIGV2ZW50LnN0b3BQcm9wYWdhdGlvbigpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0pKTtcbiAgICAgICAgICAgIHRoaXMuYWRkSXRlbShpID0+IGkuc2V0VGl0bGUob3B0TmFtZShcInNldC1hdHRhY2htZW50LWZvbGRlclwiKSkuc2V0SWNvbihcImltYWdlLWZpbGVcIikub25DbGljaygoKSA9PiB7XG4gICAgICAgICAgICAgICAgdGhpcy5hcHAuc2V0QXR0YWNobWVudEZvbGRlcihmaWxlKTtcbiAgICAgICAgICAgIH0pKTtcbiAgICAgICAgICAgIHRoaXMuYWRkU2VwYXJhdG9yKCk7XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy5hZGRJdGVtKGkgPT4ge1xuICAgICAgICAgICAgLy8gQ2FuJ3QgcmVuYW1lIGZvbGRlciB3aXRob3V0IGZpbGUgZXhwbG9yZXJcbiAgICAgICAgICAgIGkuc2V0RGlzYWJsZWQoZmlsZSBpbnN0YW5jZW9mIFRGb2xkZXIgJiYgIWhhdmVGaWxlRXhwbG9yZXIpO1xuICAgICAgICAgICAgaS5zZXRUaXRsZShvcHROYW1lKFwicmVuYW1lXCIpKS5zZXRJY29uKFwicGVuY2lsXCIpLm9uQ2xpY2soZXZlbnQgPT4ge1xuICAgICAgICAgICAgICAgIGlmIChmaWxlIGluc3RhbmNlb2YgVEZpbGUpIHtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5hcHAuZmlsZU1hbmFnZXIucHJvbXB0Rm9yRmlsZVJlbmFtZShmaWxlKTtcbiAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKGhhdmVGaWxlRXhwbG9yZXIpIHtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy53aXRoRXhwbG9yZXIoZmlsZSk/LnN0YXJ0UmVuYW1lRmlsZShmaWxlKTtcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICBuZXcgTm90aWNlKFwiVGhlIEZpbGUgRXhwbG9yZXIgY29yZSBwbHVnaW4gbXVzdCBiZSBlbmFibGVkIHRvIHJlbmFtZSBmb2xkZXJzXCIpXG4gICAgICAgICAgICAgICAgICAgIGV2ZW50LnN0b3BQcm9wYWdhdGlvbigpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9KTtcbiAgICAgICAgdGhpcy5hZGRJdGVtKGkgPT4gaS5zZXRUaXRsZShvcHROYW1lKFwiZGVsZXRlXCIpKS5zZXRJY29uKFwidHJhc2hcIikub25DbGljaygoKSA9PiB7XG4gICAgICAgICAgICBpZiAoZmlsZSBpbnN0YW5jZW9mIFRGb2xkZXIpIHtcbiAgICAgICAgICAgICAgICB0aGlzLmFwcC5maWxlTWFuYWdlci5wcm9tcHRGb3JGb2xkZXJEZWxldGlvbihmaWxlKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2UgaWYgKGZpbGUgaW5zdGFuY2VvZiBURmlsZSkge1xuICAgICAgICAgICAgICAgIHRoaXMuYXBwLmZpbGVNYW5hZ2VyLnByb21wdEZvckZpbGVEZWxldGlvbihmaWxlKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSkpO1xuICAgICAgICBpZiAoZmlsZSBpbnN0YW5jZW9mIFRGb2xkZXIgJiYgaGF2ZUZpbGVFeHBsb3Jlcikge1xuICAgICAgICAgICAgdGhpcy5hZGRJdGVtKGkgPT4gaS5zZXRJY29uKFwiZm9sZGVyXCIpLnNldFRpdGxlKGkxOG5leHQudCgncGx1Z2lucy5maWxlLWV4cGxvcmVyLmFjdGlvbi1yZXZlYWwtZmlsZScpKS5vbkNsaWNrKCgpID0+IHtcbiAgICAgICAgICAgICAgICB0aGlzLndpdGhFeHBsb3JlcihmaWxlKTtcbiAgICAgICAgICAgIH0pKTtcbiAgICAgICAgfVxuICAgICAgICBpZiAoZmlsZSA9PT0gd29ya3NwYWNlLmdldEFjdGl2ZUZpbGUoKSkge1xuICAgICAgICAgICAgd29ya3NwYWNlLnRyaWdnZXIoXCJmaWxlLW1lbnVcIiwgdGhpcywgZmlsZSwgXCJxdWljay1leHBsb3JlclwiLCB3b3Jrc3BhY2UuYWN0aXZlTGVhZik7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB3b3Jrc3BhY2UudHJpZ2dlcihcImZpbGUtbWVudVwiLCB0aGlzLCBmaWxlLCBcInF1aWNrLWV4cGxvcmVyXCIpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgd2l0aEV4cGxvcmVyKGZpbGU6IFRBYnN0cmFjdEZpbGUpIHtcbiAgICAgICAgY29uc3QgZXhwbG9yZXIgPSB0aGlzLmFwcC5pbnRlcm5hbFBsdWdpbnMucGx1Z2luc1tcImZpbGUtZXhwbG9yZXJcIl07XG4gICAgICAgIGlmIChleHBsb3Jlci5lbmFibGVkKSB7XG4gICAgICAgICAgICBleHBsb3Jlci5pbnN0YW5jZS5yZXZlYWxJbkZvbGRlcihmaWxlKTtcbiAgICAgICAgICAgIHJldHVybiB0aGlzLmFwcC53b3Jrc3BhY2UuZ2V0TGVhdmVzT2ZUeXBlKFwiZmlsZS1leHBsb3JlclwiKVswXS52aWV3IGFzIEZpbGVFeHBsb3JlclZpZXdcbiAgICAgICAgfVxuICAgIH1cbn1cbiIsImltcG9ydCB7IFRBYnN0cmFjdEZpbGUsIFRGaWxlLCBURm9sZGVyLCBLZXltYXAsIE5vdGljZSwgQXBwLCBNZW51IH0gZnJvbSBcIm9ic2lkaWFuXCI7XG5pbXBvcnQgeyBob3ZlclNvdXJjZSwgc3RhcnREcmFnIH0gZnJvbSBcIi4vRXhwbG9yZXJcIjtcbmltcG9ydCB7IFBvcHVwTWVudSwgTWVudVBhcmVudCB9IGZyb20gXCIuL21lbnVzXCI7XG5pbXBvcnQgeyBDb250ZXh0TWVudSB9IGZyb20gXCIuL0NvbnRleHRNZW51XCI7XG5cbmRlY2xhcmUgbW9kdWxlIFwib2JzaWRpYW5cIiB7XG4gICAgaW50ZXJmYWNlIEFwcCB7XG4gICAgICAgIHZpZXdSZWdpc3RyeToge1xuICAgICAgICAgICAgaXNFeHRlbnNpb25SZWdpc3RlcmVkKGV4dDogc3RyaW5nKTogYm9vbGVhblxuICAgICAgICAgICAgZ2V0VHlwZUJ5RXh0ZW5zaW9uKGV4dDogc3RyaW5nKTogc3RyaW5nXG4gICAgICAgIH1cbiAgICB9XG4gICAgaW50ZXJmYWNlIFZhdWx0IHtcbiAgICAgICAgZ2V0Q29uZmlnKG9wdGlvbjogc3RyaW5nKTogYW55XG4gICAgICAgIGdldENvbmZpZyhvcHRpb246XCJzaG93VW5zdXBwb3J0ZWRGaWxlc1wiKTogYm9vbGVhblxuICAgIH1cbn1cblxuY29uc3QgYWxwaGFTb3J0ID0gbmV3IEludGwuQ29sbGF0b3IodW5kZWZpbmVkLCB7dXNhZ2U6IFwic29ydFwiLCBzZW5zaXRpdml0eTogXCJiYXNlXCIsIG51bWVyaWM6IHRydWV9KS5jb21wYXJlO1xuXG5jb25zdCBwcmV2aWV3SWNvbnM6IFJlY29yZDxzdHJpbmcsIHN0cmluZz4gPSB7XG4gICAgbWFya2Rvd246IFwiZG9jdW1lbnRcIixcbiAgICBpbWFnZTogXCJpbWFnZS1maWxlXCIsXG4gICAgYXVkaW86IFwiYXVkaW8tZmlsZVwiLFxuICAgIHBkZjogXCJwZGYtZmlsZVwiLFxufVxuXG5jb25zdCB2aWV3dHlwZUljb25zOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+ID0ge1xuICAgIC4uLnByZXZpZXdJY29ucyxcbiAgICAvLyBhZGQgdGhpcmQtcGFydHkgcGx1Z2luc1xuICAgIGV4Y2FsaWRyYXc6IFwiZXhjYWxpZHJhdy1pY29uXCIsXG59O1xuXG5cbmZ1bmN0aW9uIGZpbGVJY29uKGFwcDogQXBwLCBmaWxlOiBUQWJzdHJhY3RGaWxlKSB7XG4gICAgaWYgKGZpbGUgaW5zdGFuY2VvZiBURm9sZGVyKSByZXR1cm4gXCJmb2xkZXJcIjtcbiAgICBpZiAoZmlsZSBpbnN0YW5jZW9mIFRGaWxlKSB7XG4gICAgICAgIGNvbnN0IHZpZXdUeXBlID0gYXBwLnZpZXdSZWdpc3RyeS5nZXRUeXBlQnlFeHRlbnNpb24oZmlsZS5leHRlbnNpb24pO1xuICAgICAgICBpZiAodmlld1R5cGUpIHJldHVybiB2aWV3dHlwZUljb25zW3ZpZXdUeXBlXSA/PyBcImRvY3VtZW50XCI7XG4gICAgfVxufVxuXG5leHBvcnQgY2xhc3MgRm9sZGVyTWVudSBleHRlbmRzIFBvcHVwTWVudSB7XG5cbiAgICBwYXJlbnRGb2xkZXI6IFRGb2xkZXIgPSB0aGlzLnBhcmVudCBpbnN0YW5jZW9mIEZvbGRlck1lbnUgPyB0aGlzLnBhcmVudC5mb2xkZXIgOiBudWxsO1xuICAgIGxhc3RPdmVyOiBIVE1MRWxlbWVudCA9IG51bGw7XG5cbiAgICBjb25zdHJ1Y3RvcihwdWJsaWMgcGFyZW50OiBNZW51UGFyZW50LCBwdWJsaWMgZm9sZGVyOiBURm9sZGVyLCBwdWJsaWMgc2VsZWN0ZWRGaWxlPzogVEFic3RyYWN0RmlsZSwgcHVibGljIG9wZW5lcj86IEhUTUxFbGVtZW50KSB7XG4gICAgICAgIHN1cGVyKHBhcmVudCk7XG4gICAgICAgIHRoaXMubG9hZEZpbGVzKGZvbGRlcik7XG5cbiAgICAgICAgY29uc3QgeyBkb20gfSA9IHRoaXM7XG4gICAgICAgIGRvbS5zdHlsZS5zZXRQcm9wZXJ0eShcbiAgICAgICAgICAgIC8vIEFsbG93IHBvcG92ZXJzIChob3ZlciBwcmV2aWV3KSB0byBvdmVybGF5IHRoaXMgbWVudVxuICAgICAgICAgICAgXCItLWxheWVyLW1lbnVcIiwgXCJcIiArIChwYXJzZUludChnZXRDb21wdXRlZFN0eWxlKGRvY3VtZW50LmJvZHkpLmdldFByb3BlcnR5VmFsdWUoXCItLWxheWVyLXBvcG92ZXJcIikpIC0gMSlcbiAgICAgICAgKTtcblxuICAgICAgICBjb25zdCBtZW51SXRlbSA9IFwiLm1lbnUtaXRlbVtkYXRhLWZpbGUtcGF0aF1cIjtcbiAgICAgICAgZG9tLm9uKFwiY2xpY2tcIiwgICAgICAgbWVudUl0ZW0sIHRoaXMub25JdGVtQ2xpY2ssIHRydWUpO1xuICAgICAgICBkb20ub24oXCJjb250ZXh0bWVudVwiLCBtZW51SXRlbSwgdGhpcy5vbkl0ZW1NZW51ICk7XG4gICAgICAgIGRvbS5vbignbW91c2VvdmVyJyAgLCBtZW51SXRlbSwgdGhpcy5vbkl0ZW1Ib3Zlcik7XG4gICAgICAgIGRvbS5vbihcIm1vdXNlZG93blwiLCAgIG1lbnVJdGVtLCBlID0+IHtlLnN0b3BQcm9wYWdhdGlvbigpfSwgdHJ1ZSk7ICAvLyBGaXggZHJhZyBjYW5jZWxsaW5nXG4gICAgICAgIGRvbS5vbignZHJhZ3N0YXJ0JywgICBtZW51SXRlbSwgKGV2ZW50LCB0YXJnZXQpID0+IHtcbiAgICAgICAgICAgIHN0YXJ0RHJhZyh0aGlzLmFwcCwgdGFyZ2V0LmRhdGFzZXQuZmlsZVBhdGgsIGV2ZW50KTtcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgb25BcnJvd0xlZnQoKTogYm9vbGVhbiB8IHVuZGVmaW5lZCB7XG4gICAgICAgIHJldHVybiBzdXBlci5vbkFycm93TGVmdCgpID8/IHRoaXMub3BlbkJyZWFkY3J1bWIodGhpcy5vcGVuZXI/LnByZXZpb3VzRWxlbWVudFNpYmxpbmcpO1xuICAgIH1cblxuICAgIG9wZW5CcmVhZGNydW1iKGVsZW1lbnQ6IEVsZW1lbnQpIHtcbiAgICAgICAgaWYgKGVsZW1lbnQgJiYgdGhpcy5yb290TWVudSgpID09PSB0aGlzKSB7XG4gICAgICAgICAgICBjb25zdCBwcmV2RXhwbG9yYWJsZSA9IHRoaXMub3BlbmVyLnByZXZpb3VzRWxlbWVudFNpYmxpbmc7XG4gICAgICAgICAgICB0aGlzLmhpZGUoKTtcbiAgICAgICAgICAgIChlbGVtZW50IGFzIEhUTUxEaXZFbGVtZW50KS5jbGljaygpXG4gICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBvbkFycm93UmlnaHQoKTogYm9vbGVhbiB8IHVuZGVmaW5lZCB7XG4gICAgICAgIGNvbnN0IHRhcmdldEVsID0gdGhpcy5pdGVtc1t0aGlzLnNlbGVjdGVkXT8uZG9tO1xuICAgICAgICBjb25zdCB7IGZpbGVQYXRoIH0gPSB0YXJnZXRFbD8uZGF0YXNldDtcbiAgICAgICAgY29uc3QgZmlsZSA9IGZpbGVQYXRoICYmIHRoaXMuYXBwLnZhdWx0LmdldEFic3RyYWN0RmlsZUJ5UGF0aChmaWxlUGF0aCk7XG4gICAgICAgIGlmIChmaWxlIGluc3RhbmNlb2YgVEZvbGRlciAmJiBmaWxlICE9PSB0aGlzLnNlbGVjdGVkRmlsZSkge1xuICAgICAgICAgICAgdGhpcy5vbkNsaWNrRmlsZShmaWxlLCB0YXJnZXRFbCk7XG4gICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHRoaXMub3BlbkJyZWFkY3J1bWIodGhpcy5vcGVuZXI/Lm5leHRFbGVtZW50U2libGluZyk7XG4gICAgfVxuXG4gICAgbG9hZEZpbGVzKGZvbGRlcjogVEZvbGRlcikge1xuICAgICAgICBjb25zdCBhbGxGaWxlcyA9IHRoaXMuYXBwLnZhdWx0LmdldENvbmZpZyhcInNob3dVbnN1cHBvcnRlZEZpbGVzXCIpO1xuICAgICAgICBjb25zdCB7Y2hpbGRyZW4sIHBhcmVudH0gPSBmb2xkZXI7XG4gICAgICAgIGNvbnN0IGl0ZW1zID0gY2hpbGRyZW4uc2xpY2UoKS5zb3J0KChhOiBUQWJzdHJhY3RGaWxlLCBiOiBUQWJzdHJhY3RGaWxlKSA9PiBhbHBoYVNvcnQoYS5uYW1lLCBiLm5hbWUpKVxuICAgICAgICBjb25zdCBmb2xkZXJzID0gaXRlbXMuZmlsdGVyKGYgPT4gZiBpbnN0YW5jZW9mIFRGb2xkZXIpIGFzIFRGb2xkZXJbXTtcbiAgICAgICAgY29uc3QgZmlsZXMgICA9IGl0ZW1zLmZpbHRlcihmID0+IGYgaW5zdGFuY2VvZiBURmlsZSAmJiAoYWxsRmlsZXMgfHwgZmlsZUljb24odGhpcy5hcHAsIGYpKSkgYXMgVEZpbGVbXTtcbiAgICAgICAgZm9sZGVycy5zb3J0KChhLCBiKSA9PiBhbHBoYVNvcnQoYS5uYW1lLCBiLm5hbWUpKTtcbiAgICAgICAgZmlsZXMuc29ydCgoYSwgYikgPT4gYWxwaGFTb3J0KGEuYmFzZW5hbWUsIGIuYmFzZW5hbWUpKTtcbiAgICAgICAgaWYgKHBhcmVudCkgZm9sZGVycy51bnNoaWZ0KHBhcmVudCk7XG4gICAgICAgIGZvbGRlcnMubWFwKHRoaXMuYWRkRmlsZSwgdGhpcyk7XG4gICAgICAgIGlmIChmb2xkZXJzLmxlbmd0aCAmJiBmaWxlcy5sZW5ndGgpIHRoaXMuYWRkU2VwYXJhdG9yKCk7XG4gICAgICAgIGZpbGVzLm1hcCggIHRoaXMuYWRkRmlsZSwgdGhpcyk7XG4gICAgfVxuXG4gICAgYWRkRmlsZShmaWxlOiBUQWJzdHJhY3RGaWxlKSB7XG4gICAgICAgIGNvbnN0IGljb24gPSBmaWxlSWNvbih0aGlzLmFwcCwgZmlsZSk7XG4gICAgICAgIHRoaXMuYWRkSXRlbShpID0+IHtcbiAgICAgICAgICAgIGkuc2V0VGl0bGUoKGZpbGUgPT09IHRoaXMuZm9sZGVyLnBhcmVudCkgPyBcIi4uXCIgOiBmaWxlLm5hbWUpO1xuICAgICAgICAgICAgaS5kb20uZGF0YXNldC5maWxlUGF0aCA9IGZpbGUucGF0aDtcbiAgICAgICAgICAgIGkuZG9tLnNldEF0dHIoXCJkcmFnZ2FibGVcIiwgXCJ0cnVlXCIpO1xuICAgICAgICAgICAgaWYgKGljb24pIGkuc2V0SWNvbihpY29uKTtcbiAgICAgICAgICAgIGlmIChmaWxlIGluc3RhbmNlb2YgVEZpbGUpIHtcbiAgICAgICAgICAgICAgICBpLnNldFRpdGxlKGZpbGUuYmFzZW5hbWUpO1xuICAgICAgICAgICAgICAgIGlmIChmaWxlLmV4dGVuc2lvbiAhPT0gXCJtZFwiKSBpLmRvbS5jcmVhdGVEaXYoe3RleHQ6IGZpbGUuZXh0ZW5zaW9uLCBjbHM6IFwibmF2LWZpbGUtdGFnXCJ9KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGkub25DbGljayhlID0+IHRoaXMub25DbGlja0ZpbGUoZmlsZSwgaS5kb20pKVxuICAgICAgICAgICAgaWYgKGZpbGUgPT09IHRoaXMuc2VsZWN0ZWRGaWxlKSB7XG4gICAgICAgICAgICAgICAgaS5kb20uYWRkQ2xhc3MoXCJzZWxlY3RlZFwiKTsgLy8gPCAwLjEyLjEyXG4gICAgICAgICAgICAgICAgdGhpcy5zZWxlY3QodGhpcy5pdGVtcy5sZW5ndGgtMSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIG9uSXRlbUhvdmVyID0gKGV2ZW50OiBNb3VzZUV2ZW50LCB0YXJnZXRFbDogSFRNTERpdkVsZW1lbnQpID0+IHtcbiAgICAgICAgY29uc3QgeyBmaWxlUGF0aCB9ID0gdGFyZ2V0RWwuZGF0YXNldDtcbiAgICAgICAgY29uc3QgZmlsZSA9IHRoaXMuYXBwLnZhdWx0LmdldEFic3RyYWN0RmlsZUJ5UGF0aChmaWxlUGF0aCk7XG4gICAgICAgIGlmICghZmlsZSkgcmV0dXJuO1xuICAgICAgICBpZiAodGFyZ2V0RWwgIT0gdGhpcy5sYXN0T3Zlcikge1xuICAgICAgICAgICAgdGhpcy5zZXRDaGlsZE1lbnUoKTsgIC8vIGNsb3NlIHN1Ym1lbnVcbiAgICAgICAgICAgIHRoaXMubGFzdE92ZXIgPSB0YXJnZXRFbDtcbiAgICAgICAgfVxuICAgICAgICBpZiAoZmlsZSBpbnN0YW5jZW9mIFRGaWxlICYmIHByZXZpZXdJY29uc1t0aGlzLmFwcC52aWV3UmVnaXN0cnkuZ2V0VHlwZUJ5RXh0ZW5zaW9uKGZpbGUuZXh0ZW5zaW9uKV0pIHtcbiAgICAgICAgICAgIHRoaXMuYXBwLndvcmtzcGFjZS50cmlnZ2VyKCdob3Zlci1saW5rJywge1xuICAgICAgICAgICAgICAgIGV2ZW50LCBzb3VyY2U6IGhvdmVyU291cmNlLCBob3ZlclBhcmVudDogdGhpcy5kb20sIHRhcmdldEVsLCBsaW5rdGV4dDogZmlsZVBhdGhcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgb25JdGVtQ2xpY2sgPSAoZXZlbnQ6IE1vdXNlRXZlbnQsIHRhcmdldDogSFRNTERpdkVsZW1lbnQpID0+IHtcbiAgICAgICAgY29uc3QgeyBmaWxlUGF0aCB9ID0gdGFyZ2V0LmRhdGFzZXQ7XG4gICAgICAgIGNvbnN0IGZpbGUgPSB0aGlzLmFwcC52YXVsdC5nZXRBYnN0cmFjdEZpbGVCeVBhdGgoZmlsZVBhdGgpO1xuICAgICAgICB0aGlzLmxhc3RPdmVyID0gdGFyZ2V0O1xuICAgICAgICBpZiAoIWZpbGUpIHJldHVybjtcbiAgICAgICAgaWYgKCF0aGlzLm9uQ2xpY2tGaWxlKGZpbGUsIHRhcmdldCkpIHtcbiAgICAgICAgICAgIC8vIEtlZXAgY3VycmVudCBtZW51IHRyZWUgb3BlblxuICAgICAgICAgICAgZXZlbnQuc3RvcFByb3BhZ2F0aW9uKCk7XG4gICAgICAgICAgICBldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgb25DbGlja0ZpbGUoZmlsZTogVEFic3RyYWN0RmlsZSwgdGFyZ2V0OiBIVE1MRGl2RWxlbWVudCwgZXZlbnQ/OiBNb3VzZUV2ZW50fEtleWJvYXJkRXZlbnQpIHtcbiAgICAgICAgaWYgKGZpbGUgaW5zdGFuY2VvZiBURmlsZSkge1xuICAgICAgICAgICAgaWYgKHRoaXMuYXBwLnZpZXdSZWdpc3RyeS5pc0V4dGVuc2lvblJlZ2lzdGVyZWQoZmlsZS5leHRlbnNpb24pKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5hcHAud29ya3NwYWNlLm9wZW5MaW5rVGV4dChmaWxlLnBhdGgsIFwiXCIsIGV2ZW50ICYmIEtleW1hcC5pc01vZGlmaWVyKGV2ZW50LCBcIk1vZFwiKSk7XG4gICAgICAgICAgICAgICAgLy8gQ2xvc2UgdGhlIGVudGlyZSBtZW51IHRyZWVcbiAgICAgICAgICAgICAgICB0aGlzLnJvb3RNZW51KCkuaGlkZSgpO1xuICAgICAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBuZXcgTm90aWNlKGAuJHtmaWxlLmV4dGVuc2lvbn0gZmlsZXMgY2Fubm90IGJlIG9wZW5lZCBpbiBPYnNpZGlhbjsgVXNlIFwiT3BlbiBpbiBEZWZhdWx0IEFwcFwiIHRvIG9wZW4gdGhlbSBleHRlcm5hbGx5YCk7XG4gICAgICAgICAgICAgICAgLy8gZmFsbCB0aHJvdWdoXG4gICAgICAgICAgICB9XG4gICAgICAgIH0gZWxzZSBpZiAoZmlsZSA9PT0gdGhpcy5wYXJlbnRGb2xkZXIpIHtcbiAgICAgICAgICAgIC8vIFdlJ3JlIGEgY2hpbGQgbWVudSBhbmQgc2VsZWN0ZWQgXCIuLlwiOiBqdXN0IHJldHVybiB0byBwcmV2aW91cyBtZW51XG4gICAgICAgICAgICB0aGlzLmhpZGUoKTtcbiAgICAgICAgfSBlbHNlIGlmIChmaWxlID09PSB0aGlzLmZvbGRlci5wYXJlbnQpIHtcbiAgICAgICAgICAgIC8vIE5vdCBhIGNoaWxkIG1lbnUsIGJ1dCBzZWxlY3RlZCBcIi4uXCI6IGdvIHRvIHByZXZpb3VzIGJyZWFkY3J1bWJcbiAgICAgICAgICAgIHRoaXMub25BcnJvd0xlZnQoKTtcbiAgICAgICAgfSBlbHNlIGlmIChmaWxlID09PSB0aGlzLnNlbGVjdGVkRmlsZSkge1xuICAgICAgICAgICAgLy8gVGFyZ2V0aW5nIHRoZSBpbml0aWFsbHktc2VsZWN0ZWQgc3ViZm9sZGVyOiBnbyB0byBuZXh0IGJyZWFkY3J1bWJcbiAgICAgICAgICAgIHRoaXMub3BlbkJyZWFkY3J1bWIodGhpcy5vcGVuZXI/Lm5leHRFbGVtZW50U2libGluZyk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAvLyBPdGhlcndpc2UsIHBvcCBhIG5ldyBtZW51IGZvciB0aGUgc3ViZm9sZGVyXG4gICAgICAgICAgICBjb25zdCBmb2xkZXJNZW51ID0gbmV3IEZvbGRlck1lbnUodGhpcywgZmlsZSBhcyBURm9sZGVyLCB0aGlzLmZvbGRlcik7XG4gICAgICAgICAgICBmb2xkZXJNZW51LmNhc2NhZGUodGFyZ2V0LCBldmVudCBpbnN0YW5jZW9mIE1vdXNlRXZlbnQgPyBldmVudCA6IHVuZGVmaW5lZCk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBvbkl0ZW1NZW51ID0gKGV2ZW50OiBNb3VzZUV2ZW50LCB0YXJnZXQ6IEhUTUxEaXZFbGVtZW50KSA9PiB7XG4gICAgICAgIGNvbnN0IHsgZmlsZVBhdGggfSA9IHRhcmdldC5kYXRhc2V0O1xuICAgICAgICBjb25zdCBmaWxlID0gdGhpcy5hcHAudmF1bHQuZ2V0QWJzdHJhY3RGaWxlQnlQYXRoKGZpbGVQYXRoKTtcbiAgICAgICAgaWYgKGZpbGUpIHtcbiAgICAgICAgICAgIHRoaXMubGFzdE92ZXIgPSB0YXJnZXQ7XG4gICAgICAgICAgICBuZXcgQ29udGV4dE1lbnUodGhpcywgZmlsZSkuY2FzY2FkZSh0YXJnZXQsIGV2ZW50KTtcbiAgICAgICAgICAgIC8vIEtlZXAgY3VycmVudCBtZW51IHRyZWUgb3BlblxuICAgICAgICAgICAgZXZlbnQuc3RvcFByb3BhZ2F0aW9uKCk7XG4gICAgICAgIH1cbiAgICB9XG59XG4iLCJpbXBvcnQgeyBBcHAsIFRBYnN0cmFjdEZpbGUsIFRGaWxlLCBURm9sZGVyIH0gZnJvbSBcIm9ic2lkaWFuXCI7XG5pbXBvcnQgeyBsaXN0LCBlbCB9IGZyb20gXCJyZWRvbVwiO1xuaW1wb3J0IHsgQ29udGV4dE1lbnUgfSBmcm9tIFwiLi9Db250ZXh0TWVudVwiO1xuaW1wb3J0IHsgRm9sZGVyTWVudSB9IGZyb20gXCIuL0ZvbGRlck1lbnVcIjtcblxuZXhwb3J0IGNvbnN0IGhvdmVyU291cmNlID0gXCJxdWljay1leHBsb3Jlcjpmb2xkZXItbWVudVwiO1xuXG5kZWNsYXJlIG1vZHVsZSBcIm9ic2lkaWFuXCIge1xuICAgIGludGVyZmFjZSBBcHAge1xuICAgICAgICBkcmFnTWFuYWdlcjogYW55XG4gICAgfVxufVxuXG5leHBvcnQgZnVuY3Rpb24gc3RhcnREcmFnKGFwcDogQXBwLCBwYXRoOiBzdHJpbmcsIGV2ZW50OiBEcmFnRXZlbnQpIHtcbiAgICBpZiAoIXBhdGggfHwgcGF0aCA9PT0gXCIvXCIpIHJldHVybjtcbiAgICBjb25zdCBmaWxlID0gYXBwLnZhdWx0LmdldEFic3RyYWN0RmlsZUJ5UGF0aChwYXRoKTtcbiAgICBpZiAoIWZpbGUpIHJldHVybjtcbiAgICBjb25zdCB7IGRyYWdNYW5hZ2VyIH0gPSBhcHA7XG4gICAgY29uc3QgZHJhZ0RhdGEgPSBmaWxlIGluc3RhbmNlb2YgVEZpbGUgPyBkcmFnTWFuYWdlci5kcmFnRmlsZShldmVudCwgZmlsZSkgOiBkcmFnTWFuYWdlci5kcmFnRm9sZGVyKGV2ZW50LCBmaWxlKTtcbiAgICBkcmFnTWFuYWdlci5vbkRyYWdTdGFydChldmVudCwgZHJhZ0RhdGEpO1xufVxuXG5jbGFzcyBFeHBsb3JhYmxlIHtcbiAgICBlbDogSFRNTFNwYW5FbGVtZW50ID0gPHNwYW4gZHJhZ2dhYmxlIGNsYXNzPVwiZXhwbG9yYWJsZSB0aXRsZWJhci1idXR0b25cIiAvPlxuICAgIHVwZGF0ZShkYXRhOiB7ZmlsZTogVEFic3RyYWN0RmlsZSwgcGF0aDogc3RyaW5nfSwgaW5kZXg6IG51bWJlciwgaXRlbXM6IGFueVtdKSB7XG4gICAgICAgIGNvbnN0IHtmaWxlLCBwYXRofSA9IGRhdGE7XG4gICAgICAgIGxldCBuYW1lID0gZmlsZS5uYW1lIHx8IHBhdGg7XG4gICAgICAgIGlmIChpbmRleCA8IGl0ZW1zLmxlbmd0aC0xKSBuYW1lICs9IFwiXFx1MDBBMC9cXHUwMEEwXCI7XG4gICAgICAgIHRoaXMuZWwudGV4dENvbnRlbnQgPSBuYW1lO1xuICAgICAgICB0aGlzLmVsLmRhdGFzZXQucGFyZW50UGF0aCA9IGZpbGUucGFyZW50Py5wYXRoID8/IFwiL1wiO1xuICAgICAgICB0aGlzLmVsLmRhdGFzZXQuZmlsZVBhdGggPSBwYXRoO1xuICAgIH1cbn1cblxuZXhwb3J0IGNsYXNzIEV4cGxvcmVyIHtcbiAgICBsYXN0RmlsZTogVEFic3RyYWN0RmlsZSA9IG51bGw7XG4gICAgbGFzdFBhdGg6IHN0cmluZyA9IG51bGw7XG4gICAgZWw6IEhUTUxFbGVtZW50ID0gPGRpdiBpZD1cInF1aWNrLWV4cGxvcmVyXCIgLz47XG4gICAgbGlzdCA9IGxpc3QodGhpcy5lbCwgRXhwbG9yYWJsZSk7XG5cbiAgICBjb25zdHJ1Y3RvcihwdWJsaWMgYXBwOiBBcHApIHtcbiAgICAgICAgdGhpcy5lbC5vbihcImNvbnRleHRtZW51XCIsIFwiLmV4cGxvcmFibGVcIiwgKGV2ZW50LCB0YXJnZXQpID0+IHtcbiAgICAgICAgICAgIGNvbnN0IHsgZmlsZVBhdGggfSA9IHRhcmdldC5kYXRhc2V0O1xuICAgICAgICAgICAgY29uc3QgZmlsZSA9IGFwcC52YXVsdC5nZXRBYnN0cmFjdEZpbGVCeVBhdGgoZmlsZVBhdGgpO1xuICAgICAgICAgICAgbmV3IENvbnRleHRNZW51KGFwcCwgZmlsZSkuY2FzY2FkZSh0YXJnZXQsIGV2ZW50KTtcbiAgICAgICAgfSk7XG4gICAgICAgIHRoaXMuZWwub24oXCJjbGlja1wiLCBcIi5leHBsb3JhYmxlXCIsIChldmVudCwgdGFyZ2V0KSA9PiB7XG4gICAgICAgICAgICBjb25zdCB7IHBhcmVudFBhdGgsIGZpbGVQYXRoIH0gPSB0YXJnZXQuZGF0YXNldDtcbiAgICAgICAgICAgIGNvbnN0IGZvbGRlciA9IGFwcC52YXVsdC5nZXRBYnN0cmFjdEZpbGVCeVBhdGgocGFyZW50UGF0aCk7XG4gICAgICAgICAgICBjb25zdCBzZWxlY3RlZCA9IGFwcC52YXVsdC5nZXRBYnN0cmFjdEZpbGVCeVBhdGgoZmlsZVBhdGgpO1xuICAgICAgICAgICAgbmV3IEZvbGRlck1lbnUoYXBwLCBmb2xkZXIgYXMgVEZvbGRlciwgc2VsZWN0ZWQsIHRhcmdldCkuY2FzY2FkZSh0YXJnZXQsIGV2ZW50LmlzVHJ1c3RlZCAmJiBldmVudCk7XG4gICAgICAgIH0pO1xuICAgICAgICB0aGlzLmVsLm9uKCdkcmFnc3RhcnQnLCBcIi5leHBsb3JhYmxlXCIsIChldmVudCwgdGFyZ2V0KSA9PiB7XG4gICAgICAgICAgICBzdGFydERyYWcoYXBwLCB0YXJnZXQuZGF0YXNldC5maWxlUGF0aCwgZXZlbnQpO1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBicm93c2VWYXVsdCgpIHtcbiAgICAgICAgKHRoaXMuZWwuZmlyc3RFbGVtZW50Q2hpbGQgYXMgSFRNTERpdkVsZW1lbnQpLmNsaWNrKCk7XG4gICAgfVxuXG4gICAgYnJvd3NlQ3VycmVudCgpIHtcbiAgICAgICAgKHRoaXMuZWwubGFzdEVsZW1lbnRDaGlsZCBhcyBIVE1MRGl2RWxlbWVudCkuY2xpY2soKTtcbiAgICB9XG5cbiAgICB1cGRhdGUoZmlsZTogVEFic3RyYWN0RmlsZSkge1xuICAgICAgICBmaWxlID8/PSB0aGlzLmFwcC52YXVsdC5nZXRBYnN0cmFjdEZpbGVCeVBhdGgoXCIvXCIpO1xuICAgICAgICBpZiAoZmlsZSA9PSB0aGlzLmxhc3RGaWxlICYmIGZpbGUucGF0aCA9PSB0aGlzLmxhc3RQYXRoKSByZXR1cm47XG4gICAgICAgIHRoaXMubGFzdEZpbGUgPSBmaWxlO1xuICAgICAgICB0aGlzLmxhc3RQYXRoID0gZmlsZS5wYXRoO1xuICAgICAgICBjb25zdCBwYXJ0cyA9IFtdO1xuICAgICAgICB3aGlsZSAoZmlsZSkge1xuICAgICAgICAgICAgcGFydHMudW5zaGlmdCh7IGZpbGUsIHBhdGg6IGZpbGUucGF0aCB9KTtcbiAgICAgICAgICAgIGZpbGUgPSBmaWxlLnBhcmVudDtcbiAgICAgICAgfVxuICAgICAgICBpZiAocGFydHMubGVuZ3RoID4gMSkgcGFydHMuc2hpZnQoKTtcbiAgICAgICAgdGhpcy5saXN0LnVwZGF0ZShwYXJ0cyk7XG4gICAgfVxuXG59XG4iLCJpbXBvcnQge1BsdWdpbiwgVEFic3RyYWN0RmlsZX0gZnJvbSBcIm9ic2lkaWFuXCI7XG5pbXBvcnQge21vdW50LCB1bm1vdW50fSBmcm9tIFwicmVkb21cIjtcbmltcG9ydCB7RXhwbG9yZXIsIGhvdmVyU291cmNlfSBmcm9tIFwiLi9FeHBsb3JlclwiO1xuXG5pbXBvcnQgXCIuL3JlZG9tLWpzeFwiO1xuaW1wb3J0IFwiLi9zdHlsZXMuc2Nzc1wiXG5cbmRlY2xhcmUgbW9kdWxlIFwib2JzaWRpYW5cIiB7XG4gICAgaW50ZXJmYWNlIFdvcmtzcGFjZSB7XG4gICAgICAgIHJlZ2lzdGVySG92ZXJMaW5rU291cmNlKHNvdXJjZTogc3RyaW5nLCBpbmZvOiB7ZGlzcGxheTogc3RyaW5nLCBkZWZhdWx0TW9kPzogYm9vbGVhbn0pOiB2b2lkXG4gICAgICAgIHVucmVnaXN0ZXJIb3ZlckxpbmtTb3VyY2Uoc291cmNlOiBzdHJpbmcpOiB2b2lkXG4gICAgfVxufVxuXG5leHBvcnQgZGVmYXVsdCBjbGFzcyBleHRlbmRzIFBsdWdpbiB7XG4gICAgc3RhdHVzYmFySXRlbTogSFRNTEVsZW1lbnRcbiAgICBleHBsb3JlcjogRXhwbG9yZXJcblxuICAgIG9ubG9hZCgpIHtcbiAgICAgICAgdGhpcy5hcHAud29ya3NwYWNlLm9uTGF5b3V0UmVhZHkoICgpID0+IHtcbiAgICAgICAgICAgIGNvbnN0IGJ1dHRvbkNvbnRhaW5lciA9IGRvY3VtZW50LmJvZHkuZmluZChcIi50aXRsZWJhciAudGl0bGViYXItYnV0dG9uLWNvbnRhaW5lci5tb2QtbGVmdFwiKTtcbiAgICAgICAgICAgIHRoaXMucmVnaXN0ZXIoKCkgPT4gdW5tb3VudChidXR0b25Db250YWluZXIsIHRoaXMuZXhwbG9yZXIpKTtcbiAgICAgICAgICAgIG1vdW50KGJ1dHRvbkNvbnRhaW5lciwgdGhpcy5leHBsb3JlciA9IG5ldyBFeHBsb3Jlcih0aGlzLmFwcCkpO1xuICAgICAgICAgICAgdGhpcy5leHBsb3Jlci51cGRhdGUodGhpcy5hcHAud29ya3NwYWNlLmdldEFjdGl2ZUZpbGUoKSlcbiAgICAgICAgICAgIHRoaXMucmVnaXN0ZXJFdmVudCh0aGlzLmFwcC53b3Jrc3BhY2Uub24oXCJmaWxlLW9wZW5cIiwgdGhpcy5leHBsb3Jlci51cGRhdGUsIHRoaXMuZXhwbG9yZXIpKTtcbiAgICAgICAgICAgIHRoaXMucmVnaXN0ZXJFdmVudCh0aGlzLmFwcC52YXVsdC5vbihcInJlbmFtZVwiLCB0aGlzLm9uRmlsZUNoYW5nZSwgdGhpcykpO1xuICAgICAgICAgICAgdGhpcy5yZWdpc3RlckV2ZW50KHRoaXMuYXBwLnZhdWx0Lm9uKFwiZGVsZXRlXCIsIHRoaXMub25GaWxlQ2hhbmdlLCB0aGlzKSk7XG4gICAgICAgIH0pO1xuICAgICAgICB0aGlzLmFwcC53b3Jrc3BhY2UucmVnaXN0ZXJIb3ZlckxpbmtTb3VyY2UoaG92ZXJTb3VyY2UsIHtcbiAgICAgICAgICAgIGRpc3BsYXk6ICdRdWljayBFeHBsb3JlcicsIGRlZmF1bHRNb2Q6IHRydWVcbiAgICAgICAgfSk7XG5cbiAgICAgICAgdGhpcy5hZGRDb21tYW5kKHsgaWQ6IFwiYnJvd3NlLXZhdWx0XCIsICAgbmFtZTogXCJCcm93c2UgdmF1bHRcIiwgICAgICAgICAgY2FsbGJhY2s6ICgpID0+IHsgdGhpcy5leHBsb3Jlcj8uYnJvd3NlVmF1bHQoKTsgfSwgfSk7XG4gICAgICAgIHRoaXMuYWRkQ29tbWFuZCh7IGlkOiBcImJyb3dzZS1jdXJyZW50XCIsIG5hbWU6IFwiQnJvd3NlIGN1cnJlbnQgZm9sZGVyXCIsIGNhbGxiYWNrOiAoKSA9PiB7IHRoaXMuZXhwbG9yZXI/LmJyb3dzZUN1cnJlbnQoKTsgfSwgfSk7XG4gICAgfVxuXG4gICAgb251bmxvYWQoKSB7XG4gICAgICAgIHRoaXMuYXBwLndvcmtzcGFjZS51bnJlZ2lzdGVySG92ZXJMaW5rU291cmNlKGhvdmVyU291cmNlKTtcbiAgICB9XG5cbiAgICBvbkZpbGVDaGFuZ2UoZmlsZTogVEFic3RyYWN0RmlsZSkge1xuICAgICAgICBpZiAoZmlsZSA9PT0gdGhpcy5leHBsb3Jlci5sYXN0RmlsZSkgdGhpcy5leHBsb3Jlci51cGRhdGUoZmlsZSk7XG4gICAgfVxufVxuIl0sIm5hbWVzIjpbIk1lbnUiLCJBcHAiLCJkZWJvdW5jZSIsIktleW1hcCIsIlRGb2xkZXIiLCJOb3RpY2UiLCJURmlsZSIsIlBsdWdpbiJdLCJtYXBwaW5ncyI6Ijs7OztBQUFBLFNBQVMsVUFBVSxFQUFFLEtBQUssRUFBRTtBQUM1QixFQUFFLElBQUksTUFBTSxHQUFHLEtBQUssQ0FBQyxLQUFLLENBQUMsUUFBUSxDQUFDLENBQUM7QUFDckMsRUFBRSxJQUFJLE9BQU8sR0FBRyxFQUFFLENBQUM7QUFDbkIsRUFBRSxJQUFJLEVBQUUsR0FBRyxFQUFFLENBQUM7QUFDZCxFQUFFLElBQUksVUFBVSxHQUFHLEVBQUUsQ0FBQztBQUN0QjtBQUNBLEVBQUUsS0FBSyxJQUFJLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxHQUFHLE1BQU0sQ0FBQyxNQUFNLEVBQUUsQ0FBQyxFQUFFLEVBQUU7QUFDMUMsSUFBSSxJQUFJLEtBQUssR0FBRyxNQUFNLENBQUMsQ0FBQyxDQUFDLENBQUM7QUFDMUIsSUFB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
