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
        this.visible = false;
        if (parent instanceof PopupMenu)
            parent.setChildMenu(this);
        // Escape to close the menu
        this.scope.register(null, "Escape", this.hide.bind(this));
        this.scope.register([], "ArrowLeft", this.onArrowLeft.bind(this));
        this.scope.register(null, "Home", this.onHome.bind(this));
        this.scope.register(null, "End", this.onEnd.bind(this));
        this.scope.register([], "ArrowRight", this.onArrowRight.bind(this));
        // Make obsidian.Menu think mousedowns on our child menu(s) are happening
        // on us, so we won't close before an actual click occurs
        const menu = this;
        around(this.dom, { contains(prev) {
                return function (target) {
                    const ret = prev.call(this, target) || menu.child?.dom.contains(target);
                    return ret;
                };
            } });
        this.dom.addClass("qe-popup-menu");
    }
    onload() {
        this.scope.register(null, null, this.onKeyDown.bind(this));
        super.onload();
        this.visible = true;
        // We wait until now to register so that any initial mouseover of the old mouse position will be skipped
        this.register(onElement(this.dom, "mouseover", ".menu-item", (event, target) => {
            if (mouseMoved(event) && !target.hasClass("is-disabled")) {
                this.select(this.items.findIndex(i => i.dom === target), false);
            }
        }));
    }
    onunload() {
        this.visible = false;
        super.onunload();
    }
    // Override to avoid having a mouseover event handler
    addItem(cb) {
        const i = new obsidian.MenuItem(this);
        this.items.push(i);
        cb(i);
        return this;
    }
    onKeyDown(event) {
        const mod = obsidian.Keymap.getModifiers(event);
        if (event.key.length === 1 && !event.isComposing && (!mod || mod === "Shift")) {
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
            if (this.items[pos]?.disabled)
                continue;
            if (this.items[pos]?.dom.textContent.match(pattern)) {
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
    select(n, scroll = true) {
        this.match = ""; // reset search on move
        super.select(n);
        if (scroll) {
            const el = this.items[this.selected].dom;
            const me = this.dom.getBoundingClientRect(), my = el.getBoundingClientRect();
            if (my.top < me.top || my.bottom > me.bottom)
                el.scrollIntoView();
        }
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
        if (event instanceof MouseEvent)
            mouseMoved(event);
        this.showAtPosition(point);
        // Flag the clicked item as active, until we close
        target.toggleClass("selected", true);
        this.onHide(() => {
            if (this.parent instanceof obsidian.App)
                target.toggleClass("selected", false);
            else if (this.parent instanceof PopupMenu)
                this.parent.setChildMenu();
        });
        return this;
    }
}
function escapeRegex(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
let oldX = 0, oldY = 0;
function mouseMoved({ clientX, clientY }) {
    if (Math.abs(oldX - clientX) || Math.abs(oldY - clientY)) {
        oldX = clientX;
        oldY = clientY;
        return true;
    }
    return false;
}
function onElement(el, type, selector, listener, options = false) {
    el.on(type, selector, listener, options);
    return () => el.off(type, selector, listener, options);
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
                    new obsidian.Notice("The File Explorer core plugin must be enabled to create new folders");
                    event.stopPropagation();
                }
            }));
            this.addItem(i => i.setTitle(optName("set-attachment-folder")).setIcon("image-file").onClick(() => {
                this.app.setAttachmentFolder(file);
            }));
            this.addSeparator();
        }
        this.addItem(i => {
            i.setTitle(optName("rename")).setIcon("pencil").onClick(event => {
                this.app.fileManager.promptForFileRename(file);
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
// Global auto preview mode
let autoPreview = false;
class FolderMenu extends PopupMenu {
    constructor(parent, folder, selectedFile, opener) {
        super(parent);
        this.parent = parent;
        this.folder = folder;
        this.selectedFile = selectedFile;
        this.opener = opener;
        this.parentFolder = this.parent instanceof FolderMenu ? this.parent.folder : null;
        this.lastOver = null;
        this.showPopover = obsidian.debounce(() => {
            this.hidePopover();
            if (!autoPreview)
                return;
            this.maybeHover(this.currentItem()?.dom, file => this.app.workspace.trigger('link-hover', this, null, file.path, ""));
        }, 50, true);
        this.onItemHover = (event, targetEl) => {
            if (!autoPreview)
                this.maybeHover(targetEl, file => this.app.workspace.trigger('hover-link', {
                    event, source: hoverSource, hoverParent: this, targetEl, linktext: file.path
                }));
        };
        this.onItemClick = (event, target) => {
            const file = this.fileForDom(target);
            this.lastOver = target;
            if (!file)
                return;
            if (!this.onClickFile(file, target, event)) {
                // Keep current menu tree open
                event.stopPropagation();
                event.preventDefault();
                return false;
            }
        };
        this.onItemMenu = (event, target) => {
            const file = this.fileForDom(target);
            if (file) {
                this.lastOver = target;
                new ContextMenu(this, file).cascade(target, event);
                // Keep current menu tree open
                event.stopPropagation();
            }
        };
        this.loadFiles(folder, selectedFile);
        this.scope.register([], "Tab", this.togglePreviewMode.bind(this));
        this.scope.register(["Mod"], "Enter", this.onEnter.bind(this));
        this.scope.register(["Alt"], "Enter", this.onEnter.bind(this));
        this.scope.register([], "F2", this.doRename.bind(this));
        this.scope.register(["Shift"], "F2", this.doMove.bind(this));
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
        // When we unload, reactivate parent menu's hover, if needed
        this.register(() => { autoPreview && this.parent instanceof FolderMenu && this.parent.showPopover(); });
    }
    onArrowLeft() {
        return super.onArrowLeft() ?? this.openBreadcrumb(this.opener?.previousElementSibling);
    }
    doRename() {
        const file = this.currentFile();
        if (file)
            this.app.fileManager.promptForFileRename(file);
    }
    doMove() {
        const explorerPlugin = this.app.internalPlugins.plugins["file-explorer"];
        if (!explorerPlugin.enabled) {
            new obsidian.Notice("File explorer core plugin must be enabled to move files or folders");
            return;
        }
        const modal = explorerPlugin.instance.moveFileModal;
        modal.setCurrentFile(this.currentFile());
        modal.open();
    }
    currentItem() {
        return this.items[this.selected];
    }
    currentFile() {
        return this.fileForDom(this.currentItem()?.dom);
    }
    fileForDom(targetEl) {
        const { filePath } = targetEl?.dataset;
        if (filePath)
            return this.app.vault.getAbstractFileByPath(filePath);
    }
    itemForPath(filePath) {
        return this.items.findIndex(i => i.dom.dataset.filePath === filePath);
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
        const file = this.currentFile();
        if (file instanceof obsidian.TFolder && file !== this.selectedFile) {
            this.onClickFile(file, this.currentItem().dom);
            return false;
        }
        return this.openBreadcrumb(this.opener?.nextElementSibling);
    }
    loadFiles(folder, selectedFile) {
        this.dom.empty();
        this.items = [];
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
        if (selectedFile)
            this.select(this.itemForPath(selectedFile.path));
        else
            this.selected = -1;
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
            i.onClick(e => this.onClickFile(file, i.dom, e));
        });
    }
    togglePreviewMode() {
        if (autoPreview = !autoPreview)
            this.showPopover();
        else
            this.hidePopover();
    }
    onload() {
        super.onload();
        this.registerEvent(this.app.vault.on("rename", (file, oldPath) => {
            if (this.folder === file.parent) {
                // Destination was here; refresh the list
                const selectedFile = this.itemForPath(oldPath) >= 0 ? file : this.currentFile();
                this.loadFiles(this.folder, selectedFile);
            }
            else {
                // Remove it if it was moved out of here
                this.removeItemForPath(oldPath);
            }
        }));
        this.registerEvent(this.app.vault.on("delete", file => this.removeItemForPath(file.path)));
        // Activate preview immediately if applicable
        if (autoPreview && this.selected != -1)
            this.showPopover();
    }
    removeItemForPath(path) {
        const posn = this.itemForPath(path);
        if (posn < 0)
            return;
        const item = this.items[posn];
        if (this.selected > posn)
            this.selected -= 1;
        item.dom.detach();
        this.items.remove(item);
    }
    hide() {
        this.hidePopover();
        return super.hide();
    }
    select(idx, scroll = true) {
        const old = this.selected;
        super.select(idx, scroll);
        if (old !== this.selected) {
            // selected item changed; trigger new popover or hide the old one
            if (autoPreview)
                this.showPopover();
            else
                this.hidePopover();
        }
    }
    hidePopover() {
        this.hoverPopover?.hide();
    }
    canShowPopover() {
        return !this.child && this.visible;
    }
    maybeHover(targetEl, cb) {
        if (!this.canShowPopover())
            return;
        let file = this.fileForDom(targetEl);
        if (file instanceof obsidian.TFolder) {
            file = this.app.vault.getAbstractFileByPath(file.path + "/" + file.name + ".md");
        }
        if (file instanceof obsidian.TFile && previewIcons[this.app.viewRegistry.getTypeByExtension(file.extension)]) {
            cb(file);
        }
    }
    get hoverPopover() { return this._popover; }
    set hoverPopover(popover) {
        if (popover && !this.canShowPopover()) {
            popover.hide();
            return;
        }
        this._popover = popover;
        if (autoPreview && popover && this.currentItem()) {
            // Position the popover so it doesn't overlap the menu horizontally (as long as it fits)
            // and so that its vertical position overlaps the selected menu item (placing the top a
            // bit above the current item, unless it would go off the bottom of the screen)
            const hoverEl = popover.hoverEl;
            hoverEl.show();
            const menu = this.dom.getBoundingClientRect(), selected = this.currentItem().dom.getBoundingClientRect(), container = hoverEl.offsetParent || document.documentElement, popupHeight = hoverEl.offsetHeight, left = Math.min(menu.right + 2, container.clientWidth - hoverEl.offsetWidth), top = Math.min(Math.max(0, selected.top - popupHeight / 8), container.clientHeight - popupHeight);
            hoverEl.style.top = top + "px";
            hoverEl.style.left = left + "px";
        }
    }
    onClickFile(file, target, event) {
        this.hidePopover();
        if (event instanceof KeyboardEvent && event.key === "Enter" && obsidian.Keymap.getModifiers(event) === "Alt") {
            // Open context menu w/Alt-Enter
            new ContextMenu(this, file).cascade(target);
            return;
        }
        if (file instanceof obsidian.TFile) {
            if (this.app.viewRegistry.isExtensionRegistered(file.extension)) {
                this.app.workspace.openLinkText(file.path, "", event && obsidian.Keymap.isModifier(event, "Mod"));
                // Close the entire menu tree
                this.rootMenu().hide();
                event?.stopPropagation();
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
        Object.defineProperty(obsidian.TFolder.prototype, "basename", { get() { return this.name; }, configurable: true });
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWFpbi5qcyIsInNvdXJjZXMiOlsiLnlhcm4vY2FjaGUvcmVkb20tbnBtLTMuMjcuMS0xNDhjZWZjMzI2LWY2OWI3YTVmMzQuemlwL25vZGVfbW9kdWxlcy9yZWRvbS9kaXN0L3JlZG9tLmVzLmpzIiwiLnlhcm4vY2FjaGUvbW9ua2V5LWFyb3VuZC1ucG0tMi4xLjAtNzBkZjMyZDJhYy0xYmQ3MmQyNWY5LnppcC9ub2RlX21vZHVsZXMvbW9ua2V5LWFyb3VuZC9tanMvaW5kZXguanMiLCJzcmMvbWVudXMudHMiLCJzcmMvQ29udGV4dE1lbnUudHMiLCJzcmMvRm9sZGVyTWVudS50cyIsInNyYy9FeHBsb3Jlci50c3giLCJzcmMvcXVpY2stZXhwbG9yZXIudHN4Il0sInNvdXJjZXNDb250ZW50IjpbImZ1bmN0aW9uIHBhcnNlUXVlcnkgKHF1ZXJ5KSB7XG4gIHZhciBjaHVua3MgPSBxdWVyeS5zcGxpdCgvKFsjLl0pLyk7XG4gIHZhciB0YWdOYW1lID0gJyc7XG4gIHZhciBpZCA9ICcnO1xuICB2YXIgY2xhc3NOYW1lcyA9IFtdO1xuXG4gIGZvciAodmFyIGkgPSAwOyBpIDwgY2h1bmtzLmxlbmd0aDsgaSsrKSB7XG4gICAgdmFyIGNodW5rID0gY2h1bmtzW2ldO1xuICAgIGlmIChjaHVuayA9PT0gJyMnKSB7XG4gICAgICBpZCA9IGNodW5rc1srK2ldO1xuICAgIH0gZWxzZSBpZiAoY2h1bmsgPT09ICcuJykge1xuICAgICAgY2xhc3NOYW1lcy5wdXNoKGNodW5rc1srK2ldKTtcbiAgICB9IGVsc2UgaWYgKGNodW5rLmxlbmd0aCkge1xuICAgICAgdGFnTmFtZSA9IGNodW5rO1xuICAgIH1cbiAgfVxuXG4gIHJldHVybiB7XG4gICAgdGFnOiB0YWdOYW1lIHx8ICdkaXYnLFxuICAgIGlkOiBpZCxcbiAgICBjbGFzc05hbWU6IGNsYXNzTmFtZXMuam9pbignICcpXG4gIH07XG59XG5cbmZ1bmN0aW9uIGNyZWF0ZUVsZW1lbnQgKHF1ZXJ5LCBucykge1xuICB2YXIgcmVmID0gcGFyc2VRdWVyeShxdWVyeSk7XG4gIHZhciB0YWcgPSByZWYudGFnO1xuICB2YXIgaWQgPSByZWYuaWQ7XG4gIHZhciBjbGFzc05hbWUgPSByZWYuY2xhc3NOYW1lO1xuICB2YXIgZWxlbWVudCA9IG5zID8gZG9jdW1lbnQuY3JlYXRlRWxlbWVudE5TKG5zLCB0YWcpIDogZG9jdW1lbnQuY3JlYXRlRWxlbWVudCh0YWcpO1xuXG4gIGlmIChpZCkge1xuICAgIGVsZW1lbnQuaWQgPSBpZDtcbiAgfVxuXG4gIGlmIChjbGFzc05hbWUpIHtcbiAgICBpZiAobnMpIHtcbiAgICAgIGVsZW1lbnQuc2V0QXR0cmlidXRlKCdjbGFzcycsIGNsYXNzTmFtZSk7XG4gICAgfSBlbHNlIHtcbiAgICAgIGVsZW1lbnQuY2xhc3NOYW1lID0gY2xhc3NOYW1lO1xuICAgIH1cbiAgfVxuXG4gIHJldHVybiBlbGVtZW50O1xufVxuXG5mdW5jdGlvbiB1bm1vdW50IChwYXJlbnQsIGNoaWxkKSB7XG4gIHZhciBwYXJlbnRFbCA9IGdldEVsKHBhcmVudCk7XG4gIHZhciBjaGlsZEVsID0gZ2V0RWwoY2hpbGQpO1xuXG4gIGlmIChjaGlsZCA9PT0gY2hpbGRFbCAmJiBjaGlsZEVsLl9fcmVkb21fdmlldykge1xuICAgIC8vIHRyeSB0byBsb29rIHVwIHRoZSB2aWV3IGlmIG5vdCBwcm92aWRlZFxuICAgIGNoaWxkID0gY2hpbGRFbC5fX3JlZG9tX3ZpZXc7XG4gIH1cblxuICBpZiAoY2hpbGRFbC5wYXJlbnROb2RlKSB7XG4gICAgZG9Vbm1vdW50KGNoaWxkLCBjaGlsZEVsLCBwYXJlbnRFbCk7XG5cbiAgICBwYXJlbnRFbC5yZW1vdmVDaGlsZChjaGlsZEVsKTtcbiAgfVxuXG4gIHJldHVybiBjaGlsZDtcbn1cblxuZnVuY3Rpb24gZG9Vbm1vdW50IChjaGlsZCwgY2hpbGRFbCwgcGFyZW50RWwpIHtcbiAgdmFyIGhvb2tzID0gY2hpbGRFbC5fX3JlZG9tX2xpZmVjeWNsZTtcblxuICBpZiAoaG9va3NBcmVFbXB0eShob29rcykpIHtcbiAgICBjaGlsZEVsLl9fcmVkb21fbGlmZWN5Y2xlID0ge307XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgdmFyIHRyYXZlcnNlID0gcGFyZW50RWw7XG5cbiAgaWYgKGNoaWxkRWwuX19yZWRvbV9tb3VudGVkKSB7XG4gICAgdHJpZ2dlcihjaGlsZEVsLCAnb251bm1vdW50Jyk7XG4gIH1cblxuICB3aGlsZSAodHJhdmVyc2UpIHtcbiAgICB2YXIgcGFyZW50SG9va3MgPSB0cmF2ZXJzZS5fX3JlZG9tX2xpZmVjeWNsZSB8fCB7fTtcblxuICAgIGZvciAodmFyIGhvb2sgaW4gaG9va3MpIHtcbiAgICAgIGlmIChwYXJlbnRIb29rc1tob29rXSkge1xuICAgICAgICBwYXJlbnRIb29rc1tob29rXSAtPSBob29rc1tob29rXTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICBpZiAoaG9va3NBcmVFbXB0eShwYXJlbnRIb29rcykpIHtcbiAgICAgIHRyYXZlcnNlLl9fcmVkb21fbGlmZWN5Y2xlID0gbnVsbDtcbiAgICB9XG5cbiAgICB0cmF2ZXJzZSA9IHRyYXZlcnNlLnBhcmVudE5vZGU7XG4gIH1cbn1cblxuZnVuY3Rpb24gaG9va3NBcmVFbXB0eSAoaG9va3MpIHtcbiAgaWYgKGhvb2tzID09IG51bGwpIHtcbiAgICByZXR1cm4gdHJ1ZTtcbiAgfVxuICBmb3IgKHZhciBrZXkgaW4gaG9va3MpIHtcbiAgICBpZiAoaG9va3Nba2V5XSkge1xuICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cbiAgfVxuICByZXR1cm4gdHJ1ZTtcbn1cblxuLyogZ2xvYmFsIE5vZGUsIFNoYWRvd1Jvb3QgKi9cblxudmFyIGhvb2tOYW1lcyA9IFsnb25tb3VudCcsICdvbnJlbW91bnQnLCAnb251bm1vdW50J107XG52YXIgc2hhZG93Um9vdEF2YWlsYWJsZSA9IHR5cGVvZiB3aW5kb3cgIT09ICd1bmRlZmluZWQnICYmICdTaGFkb3dSb290JyBpbiB3aW5kb3c7XG5cbmZ1bmN0aW9uIG1vdW50IChwYXJlbnQsIGNoaWxkLCBiZWZvcmUsIHJlcGxhY2UpIHtcbiAgdmFyIHBhcmVudEVsID0gZ2V0RWwocGFyZW50KTtcbiAgdmFyIGNoaWxkRWwgPSBnZXRFbChjaGlsZCk7XG5cbiAgaWYgKGNoaWxkID09PSBjaGlsZEVsICYmIGNoaWxkRWwuX19yZWRvbV92aWV3KSB7XG4gICAgLy8gdHJ5IHRvIGxvb2sgdXAgdGhlIHZpZXcgaWYgbm90IHByb3ZpZGVkXG4gICAgY2hpbGQgPSBjaGlsZEVsLl9fcmVkb21fdmlldztcbiAgfVxuXG4gIGlmIChjaGlsZCAhPT0gY2hpbGRFbCkge1xuICAgIGNoaWxkRWwuX19yZWRvbV92aWV3ID0gY2hpbGQ7XG4gIH1cblxuICB2YXIgd2FzTW91bnRlZCA9IGNoaWxkRWwuX19yZWRvbV9tb3VudGVkO1xuICB2YXIgb2xkUGFyZW50ID0gY2hpbGRFbC5wYXJlbnROb2RlO1xuXG4gIGlmICh3YXNNb3VudGVkICYmIChvbGRQYXJlbnQgIT09IHBhcmVudEVsKSkge1xuICAgIGRvVW5tb3VudChjaGlsZCwgY2hpbGRFbCwgb2xkUGFyZW50KTtcbiAgfVxuXG4gIGlmIChiZWZvcmUgIT0gbnVsbCkge1xuICAgIGlmIChyZXBsYWNlKSB7XG4gICAgICBwYXJlbnRFbC5yZXBsYWNlQ2hpbGQoY2hpbGRFbCwgZ2V0RWwoYmVmb3JlKSk7XG4gICAgfSBlbHNlIHtcbiAgICAgIHBhcmVudEVsLmluc2VydEJlZm9yZShjaGlsZEVsLCBnZXRFbChiZWZvcmUpKTtcbiAgICB9XG4gIH0gZWxzZSB7XG4gICAgcGFyZW50RWwuYXBwZW5kQ2hpbGQoY2hpbGRFbCk7XG4gIH1cblxuICBkb01vdW50KGNoaWxkLCBjaGlsZEVsLCBwYXJlbnRFbCwgb2xkUGFyZW50KTtcblxuICByZXR1cm4gY2hpbGQ7XG59XG5cbmZ1bmN0aW9uIHRyaWdnZXIgKGVsLCBldmVudE5hbWUpIHtcbiAgaWYgKGV2ZW50TmFtZSA9PT0gJ29ubW91bnQnIHx8IGV2ZW50TmFtZSA9PT0gJ29ucmVtb3VudCcpIHtcbiAgICBlbC5fX3JlZG9tX21vdW50ZWQgPSB0cnVlO1xuICB9IGVsc2UgaWYgKGV2ZW50TmFtZSA9PT0gJ29udW5tb3VudCcpIHtcbiAgICBlbC5fX3JlZG9tX21vdW50ZWQgPSBmYWxzZTtcbiAgfVxuXG4gIHZhciBob29rcyA9IGVsLl9fcmVkb21fbGlmZWN5Y2xlO1xuXG4gIGlmICghaG9va3MpIHtcbiAgICByZXR1cm47XG4gIH1cblxuICB2YXIgdmlldyA9IGVsLl9fcmVkb21fdmlldztcbiAgdmFyIGhvb2tDb3VudCA9IDA7XG5cbiAgdmlldyAmJiB2aWV3W2V2ZW50TmFtZV0gJiYgdmlld1tldmVudE5hbWVdKCk7XG5cbiAgZm9yICh2YXIgaG9vayBpbiBob29rcykge1xuICAgIGlmIChob29rKSB7XG4gICAgICBob29rQ291bnQrKztcbiAgICB9XG4gIH1cblxuICBpZiAoaG9va0NvdW50KSB7XG4gICAgdmFyIHRyYXZlcnNlID0gZWwuZmlyc3RDaGlsZDtcblxuICAgIHdoaWxlICh0cmF2ZXJzZSkge1xuICAgICAgdmFyIG5leHQgPSB0cmF2ZXJzZS5uZXh0U2libGluZztcblxuICAgICAgdHJpZ2dlcih0cmF2ZXJzZSwgZXZlbnROYW1lKTtcblxuICAgICAgdHJhdmVyc2UgPSBuZXh0O1xuICAgIH1cbiAgfVxufVxuXG5mdW5jdGlvbiBkb01vdW50IChjaGlsZCwgY2hpbGRFbCwgcGFyZW50RWwsIG9sZFBhcmVudCkge1xuICB2YXIgaG9va3MgPSBjaGlsZEVsLl9fcmVkb21fbGlmZWN5Y2xlIHx8IChjaGlsZEVsLl9fcmVkb21fbGlmZWN5Y2xlID0ge30pO1xuICB2YXIgcmVtb3VudCA9IChwYXJlbnRFbCA9PT0gb2xkUGFyZW50KTtcbiAgdmFyIGhvb2tzRm91bmQgPSBmYWxzZTtcblxuICBmb3IgKHZhciBpID0gMCwgbGlzdCA9IGhvb2tOYW1lczsgaSA8IGxpc3QubGVuZ3RoOyBpICs9IDEpIHtcbiAgICB2YXIgaG9va05hbWUgPSBsaXN0W2ldO1xuXG4gICAgaWYgKCFyZW1vdW50KSB7IC8vIGlmIGFscmVhZHkgbW91bnRlZCwgc2tpcCB0aGlzIHBoYXNlXG4gICAgICBpZiAoY2hpbGQgIT09IGNoaWxkRWwpIHsgLy8gb25seSBWaWV3cyBjYW4gaGF2ZSBsaWZlY3ljbGUgZXZlbnRzXG4gICAgICAgIGlmIChob29rTmFtZSBpbiBjaGlsZCkge1xuICAgICAgICAgIGhvb2tzW2hvb2tOYW1lXSA9IChob29rc1tob29rTmFtZV0gfHwgMCkgKyAxO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuICAgIGlmIChob29rc1tob29rTmFtZV0pIHtcbiAgICAgIGhvb2tzRm91bmQgPSB0cnVlO1xuICAgIH1cbiAgfVxuXG4gIGlmICghaG9va3NGb3VuZCkge1xuICAgIGNoaWxkRWwuX19yZWRvbV9saWZlY3ljbGUgPSB7fTtcbiAgICByZXR1cm47XG4gIH1cblxuICB2YXIgdHJhdmVyc2UgPSBwYXJlbnRFbDtcbiAgdmFyIHRyaWdnZXJlZCA9IGZhbHNlO1xuXG4gIGlmIChyZW1vdW50IHx8ICh0cmF2ZXJzZSAmJiB0cmF2ZXJzZS5fX3JlZG9tX21vdW50ZWQpKSB7XG4gICAgdHJpZ2dlcihjaGlsZEVsLCByZW1vdW50ID8gJ29ucmVtb3VudCcgOiAnb25tb3VudCcpO1xuICAgIHRyaWdnZXJlZCA9IHRydWU7XG4gIH1cblxuICB3aGlsZSAodHJhdmVyc2UpIHtcbiAgICB2YXIgcGFyZW50ID0gdHJhdmVyc2UucGFyZW50Tm9kZTtcbiAgICB2YXIgcGFyZW50SG9va3MgPSB0cmF2ZXJzZS5fX3JlZG9tX2xpZmVjeWNsZSB8fCAodHJhdmVyc2UuX19yZWRvbV9saWZlY3ljbGUgPSB7fSk7XG5cbiAgICBmb3IgKHZhciBob29rIGluIGhvb2tzKSB7XG4gICAgICBwYXJlbnRIb29rc1tob29rXSA9IChwYXJlbnRIb29rc1tob29rXSB8fCAwKSArIGhvb2tzW2hvb2tdO1xuICAgIH1cblxuICAgIGlmICh0cmlnZ2VyZWQpIHtcbiAgICAgIGJyZWFrO1xuICAgIH0gZWxzZSB7XG4gICAgICBpZiAodHJhdmVyc2Uubm9kZVR5cGUgPT09IE5vZGUuRE9DVU1FTlRfTk9ERSB8fFxuICAgICAgICAoc2hhZG93Um9vdEF2YWlsYWJsZSAmJiAodHJhdmVyc2UgaW5zdGFuY2VvZiBTaGFkb3dSb290KSkgfHxcbiAgICAgICAgKHBhcmVudCAmJiBwYXJlbnQuX19yZWRvbV9tb3VudGVkKVxuICAgICAgKSB7XG4gICAgICAgIHRyaWdnZXIodHJhdmVyc2UsIHJlbW91bnQgPyAnb25yZW1vdW50JyA6ICdvbm1vdW50Jyk7XG4gICAgICAgIHRyaWdnZXJlZCA9IHRydWU7XG4gICAgICB9XG4gICAgICB0cmF2ZXJzZSA9IHBhcmVudDtcbiAgICB9XG4gIH1cbn1cblxuZnVuY3Rpb24gc2V0U3R5bGUgKHZpZXcsIGFyZzEsIGFyZzIpIHtcbiAgdmFyIGVsID0gZ2V0RWwodmlldyk7XG5cbiAgaWYgKHR5cGVvZiBhcmcxID09PSAnb2JqZWN0Jykge1xuICAgIGZvciAodmFyIGtleSBpbiBhcmcxKSB7XG4gICAgICBzZXRTdHlsZVZhbHVlKGVsLCBrZXksIGFyZzFba2V5XSk7XG4gICAgfVxuICB9IGVsc2Uge1xuICAgIHNldFN0eWxlVmFsdWUoZWwsIGFyZzEsIGFyZzIpO1xuICB9XG59XG5cbmZ1bmN0aW9uIHNldFN0eWxlVmFsdWUgKGVsLCBrZXksIHZhbHVlKSB7XG4gIGlmICh2YWx1ZSA9PSBudWxsKSB7XG4gICAgZWwuc3R5bGVba2V5XSA9ICcnO1xuICB9IGVsc2Uge1xuICAgIGVsLnN0eWxlW2tleV0gPSB2YWx1ZTtcbiAgfVxufVxuXG4vKiBnbG9iYWwgU1ZHRWxlbWVudCAqL1xuXG52YXIgeGxpbmtucyA9ICdodHRwOi8vd3d3LnczLm9yZy8xOTk5L3hsaW5rJztcblxuZnVuY3Rpb24gc2V0QXR0ciAodmlldywgYXJnMSwgYXJnMikge1xuICBzZXRBdHRySW50ZXJuYWwodmlldywgYXJnMSwgYXJnMik7XG59XG5cbmZ1bmN0aW9uIHNldEF0dHJJbnRlcm5hbCAodmlldywgYXJnMSwgYXJnMiwgaW5pdGlhbCkge1xuICB2YXIgZWwgPSBnZXRFbCh2aWV3KTtcblxuICB2YXIgaXNPYmogPSB0eXBlb2YgYXJnMSA9PT0gJ29iamVjdCc7XG5cbiAgaWYgKGlzT2JqKSB7XG4gICAgZm9yICh2YXIga2V5IGluIGFyZzEpIHtcbiAgICAgIHNldEF0dHJJbnRlcm5hbChlbCwga2V5LCBhcmcxW2tleV0sIGluaXRpYWwpO1xuICAgIH1cbiAgfSBlbHNlIHtcbiAgICB2YXIgaXNTVkcgPSBlbCBpbnN0YW5jZW9mIFNWR0VsZW1lbnQ7XG4gICAgdmFyIGlzRnVuYyA9IHR5cGVvZiBhcmcyID09PSAnZnVuY3Rpb24nO1xuXG4gICAgaWYgKGFyZzEgPT09ICdzdHlsZScgJiYgdHlwZW9mIGFyZzIgPT09ICdvYmplY3QnKSB7XG4gICAgICBzZXRTdHlsZShlbCwgYXJnMik7XG4gICAgfSBlbHNlIGlmIChpc1NWRyAmJiBpc0Z1bmMpIHtcbiAgICAgIGVsW2FyZzFdID0gYXJnMjtcbiAgICB9IGVsc2UgaWYgKGFyZzEgPT09ICdkYXRhc2V0Jykge1xuICAgICAgc2V0RGF0YShlbCwgYXJnMik7XG4gICAgfSBlbHNlIGlmICghaXNTVkcgJiYgKGFyZzEgaW4gZWwgfHwgaXNGdW5jKSAmJiAoYXJnMSAhPT0gJ2xpc3QnKSkge1xuICAgICAgZWxbYXJnMV0gPSBhcmcyO1xuICAgIH0gZWxzZSB7XG4gICAgICBpZiAoaXNTVkcgJiYgKGFyZzEgPT09ICd4bGluaycpKSB7XG4gICAgICAgIHNldFhsaW5rKGVsLCBhcmcyKTtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuICAgICAgaWYgKGluaXRpYWwgJiYgYXJnMSA9PT0gJ2NsYXNzJykge1xuICAgICAgICBhcmcyID0gZWwuY2xhc3NOYW1lICsgJyAnICsgYXJnMjtcbiAgICAgIH1cbiAgICAgIGlmIChhcmcyID09IG51bGwpIHtcbiAgICAgICAgZWwucmVtb3ZlQXR0cmlidXRlKGFyZzEpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgZWwuc2V0QXR0cmlidXRlKGFyZzEsIGFyZzIpO1xuICAgICAgfVxuICAgIH1cbiAgfVxufVxuXG5mdW5jdGlvbiBzZXRYbGluayAoZWwsIGFyZzEsIGFyZzIpIHtcbiAgaWYgKHR5cGVvZiBhcmcxID09PSAnb2JqZWN0Jykge1xuICAgIGZvciAodmFyIGtleSBpbiBhcmcxKSB7XG4gICAgICBzZXRYbGluayhlbCwga2V5LCBhcmcxW2tleV0pO1xuICAgIH1cbiAgfSBlbHNlIHtcbiAgICBpZiAoYXJnMiAhPSBudWxsKSB7XG4gICAgICBlbC5zZXRBdHRyaWJ1dGVOUyh4bGlua25zLCBhcmcxLCBhcmcyKTtcbiAgICB9IGVsc2Uge1xuICAgICAgZWwucmVtb3ZlQXR0cmlidXRlTlMoeGxpbmtucywgYXJnMSwgYXJnMik7XG4gICAgfVxuICB9XG59XG5cbmZ1bmN0aW9uIHNldERhdGEgKGVsLCBhcmcxLCBhcmcyKSB7XG4gIGlmICh0eXBlb2YgYXJnMSA9PT0gJ29iamVjdCcpIHtcbiAgICBmb3IgKHZhciBrZXkgaW4gYXJnMSkge1xuICAgICAgc2V0RGF0YShlbCwga2V5LCBhcmcxW2tleV0pO1xuICAgIH1cbiAgfSBlbHNlIHtcbiAgICBpZiAoYXJnMiAhPSBudWxsKSB7XG4gICAgICBlbC5kYXRhc2V0W2FyZzFdID0gYXJnMjtcbiAgICB9IGVsc2Uge1xuICAgICAgZGVsZXRlIGVsLmRhdGFzZXRbYXJnMV07XG4gICAgfVxuICB9XG59XG5cbmZ1bmN0aW9uIHRleHQgKHN0cikge1xuICByZXR1cm4gZG9jdW1lbnQuY3JlYXRlVGV4dE5vZGUoKHN0ciAhPSBudWxsKSA/IHN0ciA6ICcnKTtcbn1cblxuZnVuY3Rpb24gcGFyc2VBcmd1bWVudHNJbnRlcm5hbCAoZWxlbWVudCwgYXJncywgaW5pdGlhbCkge1xuICBmb3IgKHZhciBpID0gMCwgbGlzdCA9IGFyZ3M7IGkgPCBsaXN0Lmxlbmd0aDsgaSArPSAxKSB7XG4gICAgdmFyIGFyZyA9IGxpc3RbaV07XG5cbiAgICBpZiAoYXJnICE9PSAwICYmICFhcmcpIHtcbiAgICAgIGNvbnRpbnVlO1xuICAgIH1cblxuICAgIHZhciB0eXBlID0gdHlwZW9mIGFyZztcblxuICAgIGlmICh0eXBlID09PSAnZnVuY3Rpb24nKSB7XG4gICAgICBhcmcoZWxlbWVudCk7XG4gICAgfSBlbHNlIGlmICh0eXBlID09PSAnc3RyaW5nJyB8fCB0eXBlID09PSAnbnVtYmVyJykge1xuICAgICAgZWxlbWVudC5hcHBlbmRDaGlsZCh0ZXh0KGFyZykpO1xuICAgIH0gZWxzZSBpZiAoaXNOb2RlKGdldEVsKGFyZykpKSB7XG4gICAgICBtb3VudChlbGVtZW50LCBhcmcpO1xuICAgIH0gZWxzZSBpZiAoYXJnLmxlbmd0aCkge1xuICAgICAgcGFyc2VBcmd1bWVudHNJbnRlcm5hbChlbGVtZW50LCBhcmcsIGluaXRpYWwpO1xuICAgIH0gZWxzZSBpZiAodHlwZSA9PT0gJ29iamVjdCcpIHtcbiAgICAgIHNldEF0dHJJbnRlcm5hbChlbGVtZW50LCBhcmcsIG51bGwsIGluaXRpYWwpO1xuICAgIH1cbiAgfVxufVxuXG5mdW5jdGlvbiBlbnN1cmVFbCAocGFyZW50KSB7XG4gIHJldHVybiB0eXBlb2YgcGFyZW50ID09PSAnc3RyaW5nJyA/IGh0bWwocGFyZW50KSA6IGdldEVsKHBhcmVudCk7XG59XG5cbmZ1bmN0aW9uIGdldEVsIChwYXJlbnQpIHtcbiAgcmV0dXJuIChwYXJlbnQubm9kZVR5cGUgJiYgcGFyZW50KSB8fCAoIXBhcmVudC5lbCAmJiBwYXJlbnQpIHx8IGdldEVsKHBhcmVudC5lbCk7XG59XG5cbmZ1bmN0aW9uIGlzTm9kZSAoYXJnKSB7XG4gIHJldHVybiBhcmcgJiYgYXJnLm5vZGVUeXBlO1xufVxuXG52YXIgaHRtbENhY2hlID0ge307XG5cbmZ1bmN0aW9uIGh0bWwgKHF1ZXJ5KSB7XG4gIHZhciBhcmdzID0gW10sIGxlbiA9IGFyZ3VtZW50cy5sZW5ndGggLSAxO1xuICB3aGlsZSAoIGxlbi0tID4gMCApIGFyZ3NbIGxlbiBdID0gYXJndW1lbnRzWyBsZW4gKyAxIF07XG5cbiAgdmFyIGVsZW1lbnQ7XG5cbiAgdmFyIHR5cGUgPSB0eXBlb2YgcXVlcnk7XG5cbiAgaWYgKHR5cGUgPT09ICdzdHJpbmcnKSB7XG4gICAgZWxlbWVudCA9IG1lbW9pemVIVE1MKHF1ZXJ5KS5jbG9uZU5vZGUoZmFsc2UpO1xuICB9IGVsc2UgaWYgKGlzTm9kZShxdWVyeSkpIHtcbiAgICBlbGVtZW50ID0gcXVlcnkuY2xvbmVOb2RlKGZhbHNlKTtcbiAgfSBlbHNlIGlmICh0eXBlID09PSAnZnVuY3Rpb24nKSB7XG4gICAgdmFyIFF1ZXJ5ID0gcXVlcnk7XG4gICAgZWxlbWVudCA9IG5ldyAoRnVuY3Rpb24ucHJvdG90eXBlLmJpbmQuYXBwbHkoIFF1ZXJ5LCBbIG51bGwgXS5jb25jYXQoIGFyZ3MpICkpO1xuICB9IGVsc2Uge1xuICAgIHRocm93IG5ldyBFcnJvcignQXQgbGVhc3Qgb25lIGFyZ3VtZW50IHJlcXVpcmVkJyk7XG4gIH1cblxuICBwYXJzZUFyZ3VtZW50c0ludGVybmFsKGdldEVsKGVsZW1lbnQpLCBhcmdzLCB0cnVlKTtcblxuICByZXR1cm4gZWxlbWVudDtcbn1cblxudmFyIGVsID0gaHRtbDtcbnZhciBoID0gaHRtbDtcblxuaHRtbC5leHRlbmQgPSBmdW5jdGlvbiBleHRlbmRIdG1sIChxdWVyeSkge1xuICB2YXIgYXJncyA9IFtdLCBsZW4gPSBhcmd1bWVudHMubGVuZ3RoIC0gMTtcbiAgd2hpbGUgKCBsZW4tLSA+IDAgKSBhcmdzWyBsZW4gXSA9IGFyZ3VtZW50c1sgbGVuICsgMSBdO1xuXG4gIHZhciBjbG9uZSA9IG1lbW9pemVIVE1MKHF1ZXJ5KTtcblxuICByZXR1cm4gaHRtbC5iaW5kLmFwcGx5KGh0bWwsIFsgdGhpcywgY2xvbmUgXS5jb25jYXQoIGFyZ3MgKSk7XG59O1xuXG5mdW5jdGlvbiBtZW1vaXplSFRNTCAocXVlcnkpIHtcbiAgcmV0dXJuIGh0bWxDYWNoZVtxdWVyeV0gfHwgKGh0bWxDYWNoZVtxdWVyeV0gPSBjcmVhdGVFbGVtZW50KHF1ZXJ5KSk7XG59XG5cbmZ1bmN0aW9uIHNldENoaWxkcmVuIChwYXJlbnQpIHtcbiAgdmFyIGNoaWxkcmVuID0gW10sIGxlbiA9IGFyZ3VtZW50cy5sZW5ndGggLSAxO1xuICB3aGlsZSAoIGxlbi0tID4gMCApIGNoaWxkcmVuWyBsZW4gXSA9IGFyZ3VtZW50c1sgbGVuICsgMSBdO1xuXG4gIHZhciBwYXJlbnRFbCA9IGdldEVsKHBhcmVudCk7XG4gIHZhciBjdXJyZW50ID0gdHJhdmVyc2UocGFyZW50LCBjaGlsZHJlbiwgcGFyZW50RWwuZmlyc3RDaGlsZCk7XG5cbiAgd2hpbGUgKGN1cnJlbnQpIHtcbiAgICB2YXIgbmV4dCA9IGN1cnJlbnQubmV4dFNpYmxpbmc7XG5cbiAgICB1bm1vdW50KHBhcmVudCwgY3VycmVudCk7XG5cbiAgICBjdXJyZW50ID0gbmV4dDtcbiAgfVxufVxuXG5mdW5jdGlvbiB0cmF2ZXJzZSAocGFyZW50LCBjaGlsZHJlbiwgX2N1cnJlbnQpIHtcbiAgdmFyIGN1cnJlbnQgPSBfY3VycmVudDtcblxuICB2YXIgY2hpbGRFbHMgPSBuZXcgQXJyYXkoY2hpbGRyZW4ubGVuZ3RoKTtcblxuICBmb3IgKHZhciBpID0gMDsgaSA8IGNoaWxkcmVuLmxlbmd0aDsgaSsrKSB7XG4gICAgY2hpbGRFbHNbaV0gPSBjaGlsZHJlbltpXSAmJiBnZXRFbChjaGlsZHJlbltpXSk7XG4gIH1cblxuICBmb3IgKHZhciBpJDEgPSAwOyBpJDEgPCBjaGlsZHJlbi5sZW5ndGg7IGkkMSsrKSB7XG4gICAgdmFyIGNoaWxkID0gY2hpbGRyZW5baSQxXTtcblxuICAgIGlmICghY2hpbGQpIHtcbiAgICAgIGNvbnRpbnVlO1xuICAgIH1cblxuICAgIHZhciBjaGlsZEVsID0gY2hpbGRFbHNbaSQxXTtcblxuICAgIGlmIChjaGlsZEVsID09PSBjdXJyZW50KSB7XG4gICAgICBjdXJyZW50ID0gY3VycmVudC5uZXh0U2libGluZztcbiAgICAgIGNvbnRpbnVlO1xuICAgIH1cblxuICAgIGlmIChpc05vZGUoY2hpbGRFbCkpIHtcbiAgICAgIHZhciBuZXh0ID0gY3VycmVudCAmJiBjdXJyZW50Lm5leHRTaWJsaW5nO1xuICAgICAgdmFyIGV4aXN0cyA9IGNoaWxkLl9fcmVkb21faW5kZXggIT0gbnVsbDtcbiAgICAgIHZhciByZXBsYWNlID0gZXhpc3RzICYmIG5leHQgPT09IGNoaWxkRWxzW2kkMSArIDFdO1xuXG4gICAgICBtb3VudChwYXJlbnQsIGNoaWxkLCBjdXJyZW50LCByZXBsYWNlKTtcblxuICAgICAgaWYgKHJlcGxhY2UpIHtcbiAgICAgICAgY3VycmVudCA9IG5leHQ7XG4gICAgICB9XG5cbiAgICAgIGNvbnRpbnVlO1xuICAgIH1cblxuICAgIGlmIChjaGlsZC5sZW5ndGggIT0gbnVsbCkge1xuICAgICAgY3VycmVudCA9IHRyYXZlcnNlKHBhcmVudCwgY2hpbGQsIGN1cnJlbnQpO1xuICAgIH1cbiAgfVxuXG4gIHJldHVybiBjdXJyZW50O1xufVxuXG5mdW5jdGlvbiBsaXN0UG9vbCAoVmlldywga2V5LCBpbml0RGF0YSkge1xuICByZXR1cm4gbmV3IExpc3RQb29sKFZpZXcsIGtleSwgaW5pdERhdGEpO1xufVxuXG52YXIgTGlzdFBvb2wgPSBmdW5jdGlvbiBMaXN0UG9vbCAoVmlldywga2V5LCBpbml0RGF0YSkge1xuICB0aGlzLlZpZXcgPSBWaWV3O1xuICB0aGlzLmluaXREYXRhID0gaW5pdERhdGE7XG4gIHRoaXMub2xkTG9va3VwID0ge307XG4gIHRoaXMubG9va3VwID0ge307XG4gIHRoaXMub2xkVmlld3MgPSBbXTtcbiAgdGhpcy52aWV3cyA9IFtdO1xuXG4gIGlmIChrZXkgIT0gbnVsbCkge1xuICAgIHRoaXMua2V5ID0gdHlwZW9mIGtleSA9PT0gJ2Z1bmN0aW9uJyA/IGtleSA6IHByb3BLZXkoa2V5KTtcbiAgfVxufTtcblxuTGlzdFBvb2wucHJvdG90eXBlLnVwZGF0ZSA9IGZ1bmN0aW9uIHVwZGF0ZSAoZGF0YSwgY29udGV4dCkge1xuICB2YXIgcmVmID0gdGhpcztcbiAgICB2YXIgVmlldyA9IHJlZi5WaWV3O1xuICAgIHZhciBrZXkgPSByZWYua2V5O1xuICAgIHZhciBpbml0RGF0YSA9IHJlZi5pbml0RGF0YTtcbiAgdmFyIGtleVNldCA9IGtleSAhPSBudWxsO1xuXG4gIHZhciBvbGRMb29rdXAgPSB0aGlzLmxvb2t1cDtcbiAgdmFyIG5ld0xvb2t1cCA9IHt9O1xuXG4gIHZhciBuZXdWaWV3cyA9IG5ldyBBcnJheShkYXRhLmxlbmd0aCk7XG4gIHZhciBvbGRWaWV3cyA9IHRoaXMudmlld3M7XG5cbiAgZm9yICh2YXIgaSA9IDA7IGkgPCBkYXRhLmxlbmd0aDsgaSsrKSB7XG4gICAgdmFyIGl0ZW0gPSBkYXRhW2ldO1xuICAgIHZhciB2aWV3ID0gKHZvaWQgMCk7XG5cbiAgICBpZiAoa2V5U2V0KSB7XG4gICAgICB2YXIgaWQgPSBrZXkoaXRlbSk7XG5cbiAgICAgIHZpZXcgPSBvbGRMb29rdXBbaWRdIHx8IG5ldyBWaWV3KGluaXREYXRhLCBpdGVtLCBpLCBkYXRhKTtcbiAgICAgIG5ld0xvb2t1cFtpZF0gPSB2aWV3O1xuICAgICAgdmlldy5fX3JlZG9tX2lkID0gaWQ7XG4gICAgfSBlbHNlIHtcbiAgICAgIHZpZXcgPSBvbGRWaWV3c1tpXSB8fCBuZXcgVmlldyhpbml0RGF0YSwgaXRlbSwgaSwgZGF0YSk7XG4gICAgfVxuICAgIHZpZXcudXBkYXRlICYmIHZpZXcudXBkYXRlKGl0ZW0sIGksIGRhdGEsIGNvbnRleHQpO1xuXG4gICAgdmFyIGVsID0gZ2V0RWwodmlldy5lbCk7XG5cbiAgICBlbC5fX3JlZG9tX3ZpZXcgPSB2aWV3O1xuICAgIG5ld1ZpZXdzW2ldID0gdmlldztcbiAgfVxuXG4gIHRoaXMub2xkVmlld3MgPSBvbGRWaWV3cztcbiAgdGhpcy52aWV3cyA9IG5ld1ZpZXdzO1xuXG4gIHRoaXMub2xkTG9va3VwID0gb2xkTG9va3VwO1xuICB0aGlzLmxvb2t1cCA9IG5ld0xvb2t1cDtcbn07XG5cbmZ1bmN0aW9uIHByb3BLZXkgKGtleSkge1xuICByZXR1cm4gZnVuY3Rpb24gKGl0ZW0pIHtcbiAgICByZXR1cm4gaXRlbVtrZXldO1xuICB9O1xufVxuXG5mdW5jdGlvbiBsaXN0IChwYXJlbnQsIFZpZXcsIGtleSwgaW5pdERhdGEpIHtcbiAgcmV0dXJuIG5ldyBMaXN0KHBhcmVudCwgVmlldywga2V5LCBpbml0RGF0YSk7XG59XG5cbnZhciBMaXN0ID0gZnVuY3Rpb24gTGlzdCAocGFyZW50LCBWaWV3LCBrZXksIGluaXREYXRhKSB7XG4gIHRoaXMuVmlldyA9IFZpZXc7XG4gIHRoaXMuaW5pdERhdGEgPSBpbml0RGF0YTtcbiAgdGhpcy52aWV3cyA9IFtdO1xuICB0aGlzLnBvb2wgPSBuZXcgTGlzdFBvb2woVmlldywga2V5LCBpbml0RGF0YSk7XG4gIHRoaXMuZWwgPSBlbnN1cmVFbChwYXJlbnQpO1xuICB0aGlzLmtleVNldCA9IGtleSAhPSBudWxsO1xufTtcblxuTGlzdC5wcm90b3R5cGUudXBkYXRlID0gZnVuY3Rpb24gdXBkYXRlIChkYXRhLCBjb250ZXh0KSB7XG4gICAgaWYgKCBkYXRhID09PSB2b2lkIDAgKSBkYXRhID0gW107XG5cbiAgdmFyIHJlZiA9IHRoaXM7XG4gICAgdmFyIGtleVNldCA9IHJlZi5rZXlTZXQ7XG4gIHZhciBvbGRWaWV3cyA9IHRoaXMudmlld3M7XG5cbiAgdGhpcy5wb29sLnVwZGF0ZShkYXRhLCBjb250ZXh0KTtcblxuICB2YXIgcmVmJDEgPSB0aGlzLnBvb2w7XG4gICAgdmFyIHZpZXdzID0gcmVmJDEudmlld3M7XG4gICAgdmFyIGxvb2t1cCA9IHJlZiQxLmxvb2t1cDtcblxuICBpZiAoa2V5U2V0KSB7XG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBvbGRWaWV3cy5sZW5ndGg7IGkrKykge1xuICAgICAgdmFyIG9sZFZpZXcgPSBvbGRWaWV3c1tpXTtcbiAgICAgIHZhciBpZCA9IG9sZFZpZXcuX19yZWRvbV9pZDtcblxuICAgICAgaWYgKGxvb2t1cFtpZF0gPT0gbnVsbCkge1xuICAgICAgICBvbGRWaWV3Ll9fcmVkb21faW5kZXggPSBudWxsO1xuICAgICAgICB1bm1vdW50KHRoaXMsIG9sZFZpZXcpO1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIGZvciAodmFyIGkkMSA9IDA7IGkkMSA8IHZpZXdzLmxlbmd0aDsgaSQxKyspIHtcbiAgICB2YXIgdmlldyA9IHZpZXdzW2kkMV07XG5cbiAgICB2aWV3Ll9fcmVkb21faW5kZXggPSBpJDE7XG4gIH1cblxuICBzZXRDaGlsZHJlbih0aGlzLCB2aWV3cyk7XG5cbiAgaWYgKGtleVNldCkge1xuICAgIHRoaXMubG9va3VwID0gbG9va3VwO1xuICB9XG4gIHRoaXMudmlld3MgPSB2aWV3cztcbn07XG5cbkxpc3QuZXh0ZW5kID0gZnVuY3Rpb24gZXh0ZW5kTGlzdCAocGFyZW50LCBWaWV3LCBrZXksIGluaXREYXRhKSB7XG4gIHJldHVybiBMaXN0LmJpbmQoTGlzdCwgcGFyZW50LCBWaWV3LCBrZXksIGluaXREYXRhKTtcbn07XG5cbmxpc3QuZXh0ZW5kID0gTGlzdC5leHRlbmQ7XG5cbi8qIGdsb2JhbCBOb2RlICovXG5cbmZ1bmN0aW9uIHBsYWNlIChWaWV3LCBpbml0RGF0YSkge1xuICByZXR1cm4gbmV3IFBsYWNlKFZpZXcsIGluaXREYXRhKTtcbn1cblxudmFyIFBsYWNlID0gZnVuY3Rpb24gUGxhY2UgKFZpZXcsIGluaXREYXRhKSB7XG4gIHRoaXMuZWwgPSB0ZXh0KCcnKTtcbiAgdGhpcy52aXNpYmxlID0gZmFsc2U7XG4gIHRoaXMudmlldyA9IG51bGw7XG4gIHRoaXMuX3BsYWNlaG9sZGVyID0gdGhpcy5lbDtcblxuICBpZiAoVmlldyBpbnN0YW5jZW9mIE5vZGUpIHtcbiAgICB0aGlzLl9lbCA9IFZpZXc7XG4gIH0gZWxzZSBpZiAoVmlldy5lbCBpbnN0YW5jZW9mIE5vZGUpIHtcbiAgICB0aGlzLl9lbCA9IFZpZXc7XG4gICAgdGhpcy52aWV3ID0gVmlldztcbiAgfSBlbHNlIHtcbiAgICB0aGlzLl9WaWV3ID0gVmlldztcbiAgfVxuXG4gIHRoaXMuX2luaXREYXRhID0gaW5pdERhdGE7XG59O1xuXG5QbGFjZS5wcm90b3R5cGUudXBkYXRlID0gZnVuY3Rpb24gdXBkYXRlICh2aXNpYmxlLCBkYXRhKSB7XG4gIHZhciBwbGFjZWhvbGRlciA9IHRoaXMuX3BsYWNlaG9sZGVyO1xuICB2YXIgcGFyZW50Tm9kZSA9IHRoaXMuZWwucGFyZW50Tm9kZTtcblxuICBpZiAodmlzaWJsZSkge1xuICAgIGlmICghdGhpcy52aXNpYmxlKSB7XG4gICAgICBpZiAodGhpcy5fZWwpIHtcbiAgICAgICAgbW91bnQocGFyZW50Tm9kZSwgdGhpcy5fZWwsIHBsYWNlaG9sZGVyKTtcbiAgICAgICAgdW5tb3VudChwYXJlbnROb2RlLCBwbGFjZWhvbGRlcik7XG5cbiAgICAgICAgdGhpcy5lbCA9IGdldEVsKHRoaXMuX2VsKTtcbiAgICAgICAgdGhpcy52aXNpYmxlID0gdmlzaWJsZTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHZhciBWaWV3ID0gdGhpcy5fVmlldztcbiAgICAgICAgdmFyIHZpZXcgPSBuZXcgVmlldyh0aGlzLl9pbml0RGF0YSk7XG5cbiAgICAgICAgdGhpcy5lbCA9IGdldEVsKHZpZXcpO1xuICAgICAgICB0aGlzLnZpZXcgPSB2aWV3O1xuXG4gICAgICAgIG1vdW50KHBhcmVudE5vZGUsIHZpZXcsIHBsYWNlaG9sZGVyKTtcbiAgICAgICAgdW5tb3VudChwYXJlbnROb2RlLCBwbGFjZWhvbGRlcik7XG4gICAgICB9XG4gICAgfVxuICAgIHRoaXMudmlldyAmJiB0aGlzLnZpZXcudXBkYXRlICYmIHRoaXMudmlldy51cGRhdGUoZGF0YSk7XG4gIH0gZWxzZSB7XG4gICAgaWYgKHRoaXMudmlzaWJsZSkge1xuICAgICAgaWYgKHRoaXMuX2VsKSB7XG4gICAgICAgIG1vdW50KHBhcmVudE5vZGUsIHBsYWNlaG9sZGVyLCB0aGlzLl9lbCk7XG4gICAgICAgIHVubW91bnQocGFyZW50Tm9kZSwgdGhpcy5fZWwpO1xuXG4gICAgICAgIHRoaXMuZWwgPSBwbGFjZWhvbGRlcjtcbiAgICAgICAgdGhpcy52aXNpYmxlID0gdmlzaWJsZTtcblxuICAgICAgICByZXR1cm47XG4gICAgICB9XG4gICAgICBtb3VudChwYXJlbnROb2RlLCBwbGFjZWhvbGRlciwgdGhpcy52aWV3KTtcbiAgICAgIHVubW91bnQocGFyZW50Tm9kZSwgdGhpcy52aWV3KTtcblxuICAgICAgdGhpcy5lbCA9IHBsYWNlaG9sZGVyO1xuICAgICAgdGhpcy52aWV3ID0gbnVsbDtcbiAgICB9XG4gIH1cbiAgdGhpcy52aXNpYmxlID0gdmlzaWJsZTtcbn07XG5cbi8qIGdsb2JhbCBOb2RlICovXG5cbmZ1bmN0aW9uIHJvdXRlciAocGFyZW50LCBWaWV3cywgaW5pdERhdGEpIHtcbiAgcmV0dXJuIG5ldyBSb3V0ZXIocGFyZW50LCBWaWV3cywgaW5pdERhdGEpO1xufVxuXG52YXIgUm91dGVyID0gZnVuY3Rpb24gUm91dGVyIChwYXJlbnQsIFZpZXdzLCBpbml0RGF0YSkge1xuICB0aGlzLmVsID0gZW5zdXJlRWwocGFyZW50KTtcbiAgdGhpcy5WaWV3cyA9IFZpZXdzO1xuICB0aGlzLmluaXREYXRhID0gaW5pdERhdGE7XG59O1xuXG5Sb3V0ZXIucHJvdG90eXBlLnVwZGF0ZSA9IGZ1bmN0aW9uIHVwZGF0ZSAocm91dGUsIGRhdGEpIHtcbiAgaWYgKHJvdXRlICE9PSB0aGlzLnJvdXRlKSB7XG4gICAgdmFyIFZpZXdzID0gdGhpcy5WaWV3cztcbiAgICB2YXIgVmlldyA9IFZpZXdzW3JvdXRlXTtcblxuICAgIHRoaXMucm91dGUgPSByb3V0ZTtcblxuICAgIGlmIChWaWV3ICYmIChWaWV3IGluc3RhbmNlb2YgTm9kZSB8fCBWaWV3LmVsIGluc3RhbmNlb2YgTm9kZSkpIHtcbiAgICAgIHRoaXMudmlldyA9IFZpZXc7XG4gICAgfSBlbHNlIHtcbiAgICAgIHRoaXMudmlldyA9IFZpZXcgJiYgbmV3IFZpZXcodGhpcy5pbml0RGF0YSwgZGF0YSk7XG4gICAgfVxuXG4gICAgc2V0Q2hpbGRyZW4odGhpcy5lbCwgW3RoaXMudmlld10pO1xuICB9XG4gIHRoaXMudmlldyAmJiB0aGlzLnZpZXcudXBkYXRlICYmIHRoaXMudmlldy51cGRhdGUoZGF0YSwgcm91dGUpO1xufTtcblxudmFyIG5zID0gJ2h0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnJztcblxudmFyIHN2Z0NhY2hlID0ge307XG5cbmZ1bmN0aW9uIHN2ZyAocXVlcnkpIHtcbiAgdmFyIGFyZ3MgPSBbXSwgbGVuID0gYXJndW1lbnRzLmxlbmd0aCAtIDE7XG4gIHdoaWxlICggbGVuLS0gPiAwICkgYXJnc1sgbGVuIF0gPSBhcmd1bWVudHNbIGxlbiArIDEgXTtcblxuICB2YXIgZWxlbWVudDtcblxuICB2YXIgdHlwZSA9IHR5cGVvZiBxdWVyeTtcblxuICBpZiAodHlwZSA9PT0gJ3N0cmluZycpIHtcbiAgICBlbGVtZW50ID0gbWVtb2l6ZVNWRyhxdWVyeSkuY2xvbmVOb2RlKGZhbHNlKTtcbiAgfSBlbHNlIGlmIChpc05vZGUocXVlcnkpKSB7XG4gICAgZWxlbWVudCA9IHF1ZXJ5LmNsb25lTm9kZShmYWxzZSk7XG4gIH0gZWxzZSBpZiAodHlwZSA9PT0gJ2Z1bmN0aW9uJykge1xuICAgIHZhciBRdWVyeSA9IHF1ZXJ5O1xuICAgIGVsZW1lbnQgPSBuZXcgKEZ1bmN0aW9uLnByb3RvdHlwZS5iaW5kLmFwcGx5KCBRdWVyeSwgWyBudWxsIF0uY29uY2F0KCBhcmdzKSApKTtcbiAgfSBlbHNlIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ0F0IGxlYXN0IG9uZSBhcmd1bWVudCByZXF1aXJlZCcpO1xuICB9XG5cbiAgcGFyc2VBcmd1bWVudHNJbnRlcm5hbChnZXRFbChlbGVtZW50KSwgYXJncywgdHJ1ZSk7XG5cbiAgcmV0dXJuIGVsZW1lbnQ7XG59XG5cbnZhciBzID0gc3ZnO1xuXG5zdmcuZXh0ZW5kID0gZnVuY3Rpb24gZXh0ZW5kU3ZnIChxdWVyeSkge1xuICB2YXIgY2xvbmUgPSBtZW1vaXplU1ZHKHF1ZXJ5KTtcblxuICByZXR1cm4gc3ZnLmJpbmQodGhpcywgY2xvbmUpO1xufTtcblxuc3ZnLm5zID0gbnM7XG5cbmZ1bmN0aW9uIG1lbW9pemVTVkcgKHF1ZXJ5KSB7XG4gIHJldHVybiBzdmdDYWNoZVtxdWVyeV0gfHwgKHN2Z0NhY2hlW3F1ZXJ5XSA9IGNyZWF0ZUVsZW1lbnQocXVlcnksIG5zKSk7XG59XG5cbmV4cG9ydCB7IExpc3QsIExpc3RQb29sLCBQbGFjZSwgUm91dGVyLCBlbCwgaCwgaHRtbCwgbGlzdCwgbGlzdFBvb2wsIG1vdW50LCBwbGFjZSwgcm91dGVyLCBzLCBzZXRBdHRyLCBzZXRDaGlsZHJlbiwgc2V0RGF0YSwgc2V0U3R5bGUsIHNldFhsaW5rLCBzdmcsIHRleHQsIHVubW91bnQgfTtcbiIsImV4cG9ydCBmdW5jdGlvbiBhcm91bmQob2JqLCBmYWN0b3JpZXMpIHtcbiAgICBjb25zdCByZW1vdmVycyA9IE9iamVjdC5rZXlzKGZhY3RvcmllcykubWFwKGtleSA9PiBhcm91bmQxKG9iaiwga2V5LCBmYWN0b3JpZXNba2V5XSkpO1xuICAgIHJldHVybiByZW1vdmVycy5sZW5ndGggPT09IDEgPyByZW1vdmVyc1swXSA6IGZ1bmN0aW9uICgpIHsgcmVtb3ZlcnMuZm9yRWFjaChyID0+IHIoKSk7IH07XG59XG5mdW5jdGlvbiBhcm91bmQxKG9iaiwgbWV0aG9kLCBjcmVhdGVXcmFwcGVyKSB7XG4gICAgY29uc3Qgb3JpZ2luYWwgPSBvYmpbbWV0aG9kXSwgaGFkT3duID0gb2JqLmhhc093blByb3BlcnR5KG1ldGhvZCk7XG4gICAgbGV0IGN1cnJlbnQgPSBjcmVhdGVXcmFwcGVyKG9yaWdpbmFsKTtcbiAgICAvLyBMZXQgb3VyIHdyYXBwZXIgaW5oZXJpdCBzdGF0aWMgcHJvcHMgZnJvbSB0aGUgd3JhcHBpbmcgbWV0aG9kLFxuICAgIC8vIGFuZCB0aGUgd3JhcHBpbmcgbWV0aG9kLCBwcm9wcyBmcm9tIHRoZSBvcmlnaW5hbCBtZXRob2RcbiAgICBpZiAob3JpZ2luYWwpXG4gICAgICAgIE9iamVjdC5zZXRQcm90b3R5cGVPZihjdXJyZW50LCBvcmlnaW5hbCk7XG4gICAgT2JqZWN0LnNldFByb3RvdHlwZU9mKHdyYXBwZXIsIGN1cnJlbnQpO1xuICAgIG9ialttZXRob2RdID0gd3JhcHBlcjtcbiAgICAvLyBSZXR1cm4gYSBjYWxsYmFjayB0byBhbGxvdyBzYWZlIHJlbW92YWxcbiAgICByZXR1cm4gcmVtb3ZlO1xuICAgIGZ1bmN0aW9uIHdyYXBwZXIoLi4uYXJncykge1xuICAgICAgICAvLyBJZiB3ZSBoYXZlIGJlZW4gZGVhY3RpdmF0ZWQgYW5kIGFyZSBubyBsb25nZXIgd3JhcHBlZCwgcmVtb3ZlIG91cnNlbHZlc1xuICAgICAgICBpZiAoY3VycmVudCA9PT0gb3JpZ2luYWwgJiYgb2JqW21ldGhvZF0gPT09IHdyYXBwZXIpXG4gICAgICAgICAgICByZW1vdmUoKTtcbiAgICAgICAgcmV0dXJuIGN1cnJlbnQuYXBwbHkodGhpcywgYXJncyk7XG4gICAgfVxuICAgIGZ1bmN0aW9uIHJlbW92ZSgpIHtcbiAgICAgICAgLy8gSWYgbm8gb3RoZXIgcGF0Y2hlcywganVzdCBkbyBhIGRpcmVjdCByZW1vdmFsXG4gICAgICAgIGlmIChvYmpbbWV0aG9kXSA9PT0gd3JhcHBlcikge1xuICAgICAgICAgICAgaWYgKGhhZE93bilcbiAgICAgICAgICAgICAgICBvYmpbbWV0aG9kXSA9IG9yaWdpbmFsO1xuICAgICAgICAgICAgZWxzZVxuICAgICAgICAgICAgICAgIGRlbGV0ZSBvYmpbbWV0aG9kXTtcbiAgICAgICAgfVxuICAgICAgICBpZiAoY3VycmVudCA9PT0gb3JpZ2luYWwpXG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIC8vIEVsc2UgcGFzcyBmdXR1cmUgY2FsbHMgdGhyb3VnaCwgYW5kIHJlbW92ZSB3cmFwcGVyIGZyb20gdGhlIHByb3RvdHlwZSBjaGFpblxuICAgICAgICBjdXJyZW50ID0gb3JpZ2luYWw7XG4gICAgICAgIE9iamVjdC5zZXRQcm90b3R5cGVPZih3cmFwcGVyLCBvcmlnaW5hbCB8fCBGdW5jdGlvbik7XG4gICAgfVxufVxuZXhwb3J0IGZ1bmN0aW9uIGFmdGVyKHByb21pc2UsIGNiKSB7XG4gICAgcmV0dXJuIHByb21pc2UudGhlbihjYiwgY2IpO1xufVxuZXhwb3J0IGZ1bmN0aW9uIHNlcmlhbGl6ZShhc3luY0Z1bmN0aW9uKSB7XG4gICAgbGV0IGxhc3RSdW4gPSBQcm9taXNlLnJlc29sdmUoKTtcbiAgICBmdW5jdGlvbiB3cmFwcGVyKC4uLmFyZ3MpIHtcbiAgICAgICAgcmV0dXJuIGxhc3RSdW4gPSBuZXcgUHJvbWlzZSgocmVzLCByZWopID0+IHtcbiAgICAgICAgICAgIGFmdGVyKGxhc3RSdW4sICgpID0+IHtcbiAgICAgICAgICAgICAgICBhc3luY0Z1bmN0aW9uLmFwcGx5KHRoaXMsIGFyZ3MpLnRoZW4ocmVzLCByZWopO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0pO1xuICAgIH1cbiAgICB3cmFwcGVyLmFmdGVyID0gZnVuY3Rpb24gKCkge1xuICAgICAgICByZXR1cm4gbGFzdFJ1biA9IG5ldyBQcm9taXNlKChyZXMsIHJlaikgPT4geyBhZnRlcihsYXN0UnVuLCByZXMpOyB9KTtcbiAgICB9O1xuICAgIHJldHVybiB3cmFwcGVyO1xufVxuIiwiaW1wb3J0IHtNZW51LCBBcHAsIE1lbnVJdGVtLCBkZWJvdW5jZSwgS2V5bWFwfSBmcm9tIFwib2JzaWRpYW5cIjtcbmltcG9ydCB7YXJvdW5kfSBmcm9tIFwibW9ua2V5LWFyb3VuZFwiO1xuXG5kZWNsYXJlIG1vZHVsZSBcIm9ic2lkaWFuXCIge1xuICAgIGludGVyZmFjZSBNZW51IHtcbiAgICAgICAgYXBwOiBBcHBcbiAgICAgICAgZG9tOiBIVE1MRGl2RWxlbWVudFxuICAgICAgICBzY29wZTogU2NvcGVcbiAgICAgICAgaXRlbXM6IE1lbnVJdGVtW11cblxuICAgICAgICBzZWxlY3QobjogbnVtYmVyKTogdm9pZFxuICAgICAgICBzZWxlY3RlZDogbnVtYmVyXG4gICAgICAgIG9uQXJyb3dEb3duKGU6IEtleWJvYXJkRXZlbnQpOiBmYWxzZVxuICAgICAgICBvbkFycm93VXAoZTogS2V5Ym9hcmRFdmVudCk6IGZhbHNlXG4gICAgfVxuXG4gICAgZXhwb3J0IGNvbnN0IEtleW1hcDoge1xuICAgICAgICBpc01vZGlmaWVyKGV2ZW50OiBFdmVudCwgbW9kaWZpZXI6IHN0cmluZyk6IGJvb2xlYW5cbiAgICAgICAgZ2V0TW9kaWZpZXJzKGV2ZW50OiBFdmVudCk6IHN0cmluZ1xuICAgIH1cblxuICAgIGludGVyZmFjZSBNZW51SXRlbSB7XG4gICAgICAgIGRvbTogSFRNTERpdkVsZW1lbnRcbiAgICAgICAgaGFuZGxlRXZlbnQoZXZlbnQ6IEV2ZW50KTogdm9pZFxuICAgICAgICBkaXNhYmxlZDogYm9vbGVhblxuICAgIH1cbn1cblxuZXhwb3J0IHR5cGUgTWVudVBhcmVudCA9IEFwcCB8IFBvcHVwTWVudTtcblxuZXhwb3J0IGNsYXNzIFBvcHVwTWVudSBleHRlbmRzIE1lbnUge1xuICAgIC8qKiBUaGUgY2hpbGQgbWVudSBwb3BwZWQgdXAgb3ZlciB0aGlzIG9uZSAqL1xuICAgIGNoaWxkOiBNZW51XG5cbiAgICBtYXRjaDogc3RyaW5nID0gXCJcIlxuICAgIHJlc2V0U2VhcmNoT25UaW1lb3V0ID0gZGVib3VuY2UoKCkgPT4ge3RoaXMubWF0Y2ggPSBcIlwiO30sIDE1MDAsIHRydWUpXG4gICAgdmlzaWJsZTogYm9vbGVhbiA9IGZhbHNlXG5cbiAgICBjb25zdHJ1Y3RvcihwdWJsaWMgcGFyZW50OiBNZW51UGFyZW50KSB7XG4gICAgICAgIHN1cGVyKHBhcmVudCBpbnN0YW5jZW9mIEFwcCA/IHBhcmVudCA6IHBhcmVudC5hcHApO1xuICAgICAgICBpZiAocGFyZW50IGluc3RhbmNlb2YgUG9wdXBNZW51KSBwYXJlbnQuc2V0Q2hpbGRNZW51KHRoaXMpO1xuXG4gICAgICAgIC8vIEVzY2FwZSB0byBjbG9zZSB0aGUgbWVudVxuICAgICAgICB0aGlzLnNjb3BlLnJlZ2lzdGVyKG51bGwsIFwiRXNjYXBlXCIsIHRoaXMuaGlkZS5iaW5kKHRoaXMpKTtcbiAgICAgICAgdGhpcy5zY29wZS5yZWdpc3RlcihbXSwgXCJBcnJvd0xlZnRcIiwgdGhpcy5vbkFycm93TGVmdC5iaW5kKHRoaXMpKTtcblxuICAgICAgICB0aGlzLnNjb3BlLnJlZ2lzdGVyKG51bGwsIFwiSG9tZVwiLCB0aGlzLm9uSG9tZS5iaW5kKHRoaXMpKTtcbiAgICAgICAgdGhpcy5zY29wZS5yZWdpc3RlcihudWxsLCBcIkVuZFwiLCAgdGhpcy5vbkVuZC5iaW5kKHRoaXMpKTtcbiAgICAgICAgdGhpcy5zY29wZS5yZWdpc3RlcihbXSwgXCJBcnJvd1JpZ2h0XCIsIHRoaXMub25BcnJvd1JpZ2h0LmJpbmQodGhpcykpO1xuXG4gICAgICAgIC8vIE1ha2Ugb2JzaWRpYW4uTWVudSB0aGluayBtb3VzZWRvd25zIG9uIG91ciBjaGlsZCBtZW51KHMpIGFyZSBoYXBwZW5pbmdcbiAgICAgICAgLy8gb24gdXMsIHNvIHdlIHdvbid0IGNsb3NlIGJlZm9yZSBhbiBhY3R1YWwgY2xpY2sgb2NjdXJzXG4gICAgICAgIGNvbnN0IG1lbnUgPSB0aGlzO1xuICAgICAgICBhcm91bmQodGhpcy5kb20sIHtjb250YWlucyhwcmV2KXsgcmV0dXJuIGZ1bmN0aW9uKHRhcmdldDogTm9kZSkge1xuICAgICAgICAgICAgY29uc3QgcmV0ID0gcHJldi5jYWxsKHRoaXMsIHRhcmdldCkgfHwgbWVudS5jaGlsZD8uZG9tLmNvbnRhaW5zKHRhcmdldCk7XG4gICAgICAgICAgICByZXR1cm4gcmV0O1xuICAgICAgICB9fX0pO1xuICAgICAgICB0aGlzLmRvbS5hZGRDbGFzcyhcInFlLXBvcHVwLW1lbnVcIik7XG4gICAgfVxuXG4gICAgb25sb2FkKCkge1xuICAgICAgICB0aGlzLnNjb3BlLnJlZ2lzdGVyKG51bGwsIG51bGwsIHRoaXMub25LZXlEb3duLmJpbmQodGhpcykpO1xuICAgICAgICBzdXBlci5vbmxvYWQoKTtcbiAgICAgICAgdGhpcy52aXNpYmxlID0gdHJ1ZTtcbiAgICAgICAgLy8gV2Ugd2FpdCB1bnRpbCBub3cgdG8gcmVnaXN0ZXIgc28gdGhhdCBhbnkgaW5pdGlhbCBtb3VzZW92ZXIgb2YgdGhlIG9sZCBtb3VzZSBwb3NpdGlvbiB3aWxsIGJlIHNraXBwZWRcbiAgICAgICAgdGhpcy5yZWdpc3RlcihvbkVsZW1lbnQodGhpcy5kb20sIFwibW91c2VvdmVyXCIsIFwiLm1lbnUtaXRlbVwiLCAoZXZlbnQ6IE1vdXNlRXZlbnQsIHRhcmdldDogSFRNTERpdkVsZW1lbnQpID0+IHtcbiAgICAgICAgICAgIGlmIChtb3VzZU1vdmVkKGV2ZW50KSAmJiAhdGFyZ2V0Lmhhc0NsYXNzKFwiaXMtZGlzYWJsZWRcIikpIHtcbiAgICAgICAgICAgICAgICB0aGlzLnNlbGVjdCh0aGlzLml0ZW1zLmZpbmRJbmRleChpID0+IGkuZG9tID09PSB0YXJnZXQpLCBmYWxzZSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pKTtcbiAgICB9XG5cbiAgICBvbnVubG9hZCgpIHtcbiAgICAgICAgdGhpcy52aXNpYmxlID0gZmFsc2U7XG4gICAgICAgIHN1cGVyLm9udW5sb2FkKCk7XG4gICAgfVxuXG4gICAgLy8gT3ZlcnJpZGUgdG8gYXZvaWQgaGF2aW5nIGEgbW91c2VvdmVyIGV2ZW50IGhhbmRsZXJcbiAgICBhZGRJdGVtKGNiOiAoaTogTWVudUl0ZW0pID0+IGFueSkge1xuICAgICAgICBjb25zdCBpID0gbmV3IE1lbnVJdGVtKHRoaXMpO1xuICAgICAgICB0aGlzLml0ZW1zLnB1c2goaSk7XG4gICAgICAgIGNiKGkpO1xuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9XG5cbiAgICBvbktleURvd24oZXZlbnQ6IEtleWJvYXJkRXZlbnQpIHtcbiAgICAgICAgY29uc3QgbW9kID0gS2V5bWFwLmdldE1vZGlmaWVycyhldmVudCk7XG4gICAgICAgIGlmIChldmVudC5rZXkubGVuZ3RoID09PSAxICYmICFldmVudC5pc0NvbXBvc2luZyAmJiAoIW1vZCB8fCBtb2QgPT09IFwiU2hpZnRcIikgKSB7XG4gICAgICAgICAgICBsZXQgbWF0Y2ggPSB0aGlzLm1hdGNoICsgZXZlbnQua2V5O1xuICAgICAgICAgICAgLy8gVGhyb3cgYXdheSBwaWVjZXMgb2YgdGhlIG1hdGNoIHVudGlsIHNvbWV0aGluZyBtYXRjaGVzIG9yIG5vdGhpbmcncyBsZWZ0XG4gICAgICAgICAgICB3aGlsZSAobWF0Y2ggJiYgIXRoaXMuc2VhcmNoRm9yKG1hdGNoKSkgbWF0Y2ggPSBtYXRjaC5zdWJzdHIoMSk7XG4gICAgICAgICAgICB0aGlzLm1hdGNoID0gbWF0Y2g7XG4gICAgICAgICAgICB0aGlzLnJlc2V0U2VhcmNoT25UaW1lb3V0KCk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIGZhbHNlOyAgIC8vIGJsb2NrIGFsbCBrZXlzIG90aGVyIHRoYW4gb3Vyc1xuICAgIH1cblxuICAgIHNlYXJjaEZvcihtYXRjaDogc3RyaW5nKSB7XG4gICAgICAgIGNvbnN0IHBhcnRzID0gbWF0Y2guc3BsaXQoXCJcIikubWFwKGVzY2FwZVJlZ2V4KTtcbiAgICAgICAgcmV0dXJuIChcbiAgICAgICAgICAgIHRoaXMuZmluZChuZXcgUmVnRXhwKFwiXlwiKyBwYXJ0cy5qb2luKFwiXCIpLCBcInVpXCIpKSB8fFxuICAgICAgICAgICAgdGhpcy5maW5kKG5ldyBSZWdFeHAoXCJeXCIrIHBhcnRzLmpvaW4oXCIuKlwiKSwgXCJ1aVwiKSkgfHxcbiAgICAgICAgICAgIHRoaXMuZmluZChuZXcgUmVnRXhwKHBhcnRzLmpvaW4oXCIuKlwiKSwgXCJ1aVwiKSlcbiAgICAgICAgKTtcbiAgICB9XG5cbiAgICBmaW5kKHBhdHRlcm46IFJlZ0V4cCkge1xuICAgICAgICBsZXQgcG9zID0gTWF0aC5taW4oMCwgdGhpcy5zZWxlY3RlZCk7XG4gICAgICAgIGZvciAobGV0IGk9dGhpcy5pdGVtcy5sZW5ndGg7IGk7ICsrcG9zLCBpLS0pIHtcbiAgICAgICAgICAgIGlmICh0aGlzLml0ZW1zW3Bvc10/LmRpc2FibGVkKSBjb250aW51ZTtcbiAgICAgICAgICAgIGlmICh0aGlzLml0ZW1zW3Bvc10/LmRvbS50ZXh0Q29udGVudC5tYXRjaChwYXR0ZXJuKSkge1xuICAgICAgICAgICAgICAgIHRoaXMuc2VsZWN0KHBvcyk7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIGZhbHNlXG4gICAgfVxuXG4gICAgb25FbnRlcihldmVudDogS2V5Ym9hcmRFdmVudCkge1xuICAgICAgICBjb25zdCBpdGVtID0gdGhpcy5pdGVtc1t0aGlzLnNlbGVjdGVkXTtcbiAgICAgICAgaWYgKGl0ZW0pIHtcbiAgICAgICAgICAgIGl0ZW0uaGFuZGxlRXZlbnQoZXZlbnQpO1xuICAgICAgICAgICAgLy8gT25seSBoaWRlIGlmIHdlIGRvbid0IGhhdmUgYSBzdWJtZW51XG4gICAgICAgICAgICBpZiAoIXRoaXMuY2hpbGQpIHRoaXMuaGlkZSgpO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG5cbiAgICBzZWxlY3QobjogbnVtYmVyLCBzY3JvbGwgPSB0cnVlKSB7XG4gICAgICAgIHRoaXMubWF0Y2ggPSBcIlwiIC8vIHJlc2V0IHNlYXJjaCBvbiBtb3ZlXG4gICAgICAgIHN1cGVyLnNlbGVjdChuKTtcbiAgICAgICAgaWYgKHNjcm9sbCkgIHtcbiAgICAgICAgICAgIGNvbnN0IGVsID0gdGhpcy5pdGVtc1t0aGlzLnNlbGVjdGVkXS5kb207XG4gICAgICAgICAgICBjb25zdCBtZSA9IHRoaXMuZG9tLmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpLCBteSA9IGVsLmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpO1xuICAgICAgICAgICAgaWYgKG15LnRvcCA8IG1lLnRvcCB8fCBteS5ib3R0b20gPiBtZS5ib3R0b20pIGVsLnNjcm9sbEludG9WaWV3KCk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICB1bnNlbGVjdCgpIHtcbiAgICAgICAgdGhpcy5pdGVtc1t0aGlzLnNlbGVjdGVkXT8uZG9tLnJlbW92ZUNsYXNzKFwic2VsZWN0ZWRcIik7XG4gICAgfVxuXG4gICAgb25FbmQoZTogS2V5Ym9hcmRFdmVudCkge1xuICAgICAgICB0aGlzLnVuc2VsZWN0KCk7XG4gICAgICAgIHRoaXMuc2VsZWN0ZWQgPSB0aGlzLml0ZW1zLmxlbmd0aDtcbiAgICAgICAgdGhpcy5vbkFycm93VXAoZSk7XG4gICAgICAgIGlmICh0aGlzLnNlbGVjdGVkID09PSB0aGlzLml0ZW1zLmxlbmd0aCkgdGhpcy5zZWxlY3RlZCA9IC0xO1xuICAgIH1cblxuICAgIG9uSG9tZShlOiBLZXlib2FyZEV2ZW50KSB7XG4gICAgICAgIHRoaXMudW5zZWxlY3QoKTtcbiAgICAgICAgdGhpcy5zZWxlY3RlZCA9IC0xO1xuICAgICAgICB0aGlzLm9uQXJyb3dEb3duKGUpO1xuICAgIH1cblxuICAgIG9uQXJyb3dMZWZ0KCk6IGJvb2xlYW4gfCB1bmRlZmluZWQge1xuICAgICAgICBpZiAodGhpcy5yb290TWVudSgpICE9PSB0aGlzKSB7XG4gICAgICAgICAgICB0aGlzLmhpZGUoKTtcbiAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIG9uQXJyb3dSaWdodCgpOiBib29sZWFuIHwgdW5kZWZpbmVkIHtcbiAgICAgICAgLy8gbm8tb3AgaW4gYmFzZSBjbGFzc1xuICAgICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgaGlkZSgpIHtcbiAgICAgICAgdGhpcy5zZXRDaGlsZE1lbnUoKTsgIC8vIGhpZGUgY2hpbGQgbWVudShzKSBmaXJzdFxuICAgICAgICByZXR1cm4gc3VwZXIuaGlkZSgpO1xuICAgIH1cblxuICAgIHNldENoaWxkTWVudShtZW51PzogTWVudSkge1xuICAgICAgICB0aGlzLmNoaWxkPy5oaWRlKCk7XG4gICAgICAgIHRoaXMuY2hpbGQgPSBtZW51O1xuICAgIH1cblxuICAgIHJvb3RNZW51KCk6IFBvcHVwTWVudSB7XG4gICAgICAgIHJldHVybiB0aGlzLnBhcmVudCBpbnN0YW5jZW9mIEFwcCA/IHRoaXMgOiB0aGlzLnBhcmVudC5yb290TWVudSgpO1xuICAgIH1cblxuICAgIGNhc2NhZGUodGFyZ2V0OiBIVE1MRWxlbWVudCwgZXZlbnQ/OiBNb3VzZUV2ZW50LCAgaE92ZXJsYXAgPSAxNSwgdk92ZXJsYXAgPSA1KSB7XG4gICAgICAgIGNvbnN0IHtsZWZ0LCByaWdodCwgdG9wLCBib3R0b219ID0gdGFyZ2V0LmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpO1xuICAgICAgICBjb25zdCBjZW50ZXJYID0gKGxlZnQrcmlnaHQpLzIsIGNlbnRlclkgPSAodG9wK2JvdHRvbSkvMjtcbiAgICAgICAgY29uc3Qge2lubmVySGVpZ2h0LCBpbm5lcldpZHRofSA9IHdpbmRvdztcblxuICAgICAgICAvLyBUcnkgdG8gY2FzY2FkZSBkb3duIGFuZCB0byB0aGUgcmlnaHQgZnJvbSB0aGUgbW91c2Ugb3IgaG9yaXpvbnRhbCBjZW50ZXJcbiAgICAgICAgLy8gb2YgdGhlIGNsaWNrZWQgaXRlbVxuICAgICAgICBjb25zdCBwb2ludCA9IHt4OiBldmVudCA/IGV2ZW50LmNsaWVudFggIC0gaE92ZXJsYXAgOiBjZW50ZXJYICwgeTogYm90dG9tIC0gdk92ZXJsYXB9O1xuXG4gICAgICAgIC8vIE1lYXN1cmUgdGhlIG1lbnUgYW5kIHNlZSBpZiBpdCBmaXRzXG4gICAgICAgIGRvY3VtZW50LmJvZHkuYXBwZW5kQ2hpbGQodGhpcy5kb20pO1xuICAgICAgICBjb25zdCB7b2Zmc2V0V2lkdGgsIG9mZnNldEhlaWdodH0gPSB0aGlzLmRvbTtcbiAgICAgICAgY29uc3QgZml0c0JlbG93ID0gcG9pbnQueSArIG9mZnNldEhlaWdodCA8IGlubmVySGVpZ2h0O1xuICAgICAgICBjb25zdCBmaXRzUmlnaHQgPSBwb2ludC54ICsgb2Zmc2V0V2lkdGggPD0gaW5uZXJXaWR0aDtcblxuICAgICAgICAvLyBJZiBpdCBkb2Vzbid0IGZpdCB1bmRlcm5lYXRoIHVzLCBwb3NpdGlvbiBpdCBhdCB0aGUgYm90dG9tIG9mIHRoZSBzY3JlZW4sIHVubGVzc1xuICAgICAgICAvLyB0aGUgY2xpY2tlZCBpdGVtIGlzIGNsb3NlIHRvIHRoZSBib3R0b20gKGluIHdoaWNoIGNhc2UsIHBvc2l0aW9uIGl0IGFib3ZlIHNvXG4gICAgICAgIC8vIHRoZSBpdGVtIHdpbGwgc3RpbGwgYmUgdmlzaWJsZS4pXG4gICAgICAgIGlmICghZml0c0JlbG93KSB7XG4gICAgICAgICAgICBwb2ludC55ID0gKGJvdHRvbSA+IGlubmVySGVpZ2h0IC0gKGJvdHRvbS10b3ApKSA/IHRvcCArIHZPdmVybGFwOiBpbm5lckhlaWdodDtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIElmIGl0IGRvZXNuJ3QgZml0IHRvIHRoZSByaWdodCwgdGhlbiBwb3NpdGlvbiBpdCBhdCB0aGUgcmlnaHQgZWRnZSBvZiB0aGUgc2NyZWVuLFxuICAgICAgICAvLyBzbyBsb25nIGFzIGl0IGZpdHMgZW50aXJlbHkgYWJvdmUgb3IgYmVsb3cgdXMuICBPdGhlcndpc2UsIHBvc2l0aW9uIGl0IHVzaW5nIHRoZVxuICAgICAgICAvLyBpdGVtIGNlbnRlciwgc28gYXQgbGVhc3Qgb25lIHNpZGUgb2YgdGhlIHByZXZpb3VzIG1lbnUvaXRlbSB3aWxsIHN0aWxsIGJlIHNlZW4uXG4gICAgICAgIGlmICghZml0c1JpZ2h0KSB7XG4gICAgICAgICAgICBwb2ludC54ID0gKG9mZnNldEhlaWdodCA8IChib3R0b20gLSB2T3ZlcmxhcCkgfHwgZml0c0JlbG93KSA/IGlubmVyV2lkdGggOiBjZW50ZXJYO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gRG9uZSEgIFNob3cgb3VyIHdvcmsuXG4gICAgICAgIGlmIChldmVudCBpbnN0YW5jZW9mIE1vdXNlRXZlbnQpIG1vdXNlTW92ZWQoZXZlbnQpO1xuICAgICAgICB0aGlzLnNob3dBdFBvc2l0aW9uKHBvaW50KTtcblxuICAgICAgICAvLyBGbGFnIHRoZSBjbGlja2VkIGl0ZW0gYXMgYWN0aXZlLCB1bnRpbCB3ZSBjbG9zZVxuICAgICAgICB0YXJnZXQudG9nZ2xlQ2xhc3MoXCJzZWxlY3RlZFwiLCB0cnVlKTtcbiAgICAgICAgdGhpcy5vbkhpZGUoKCkgPT4ge1xuICAgICAgICAgICAgaWYgKHRoaXMucGFyZW50IGluc3RhbmNlb2YgQXBwKSB0YXJnZXQudG9nZ2xlQ2xhc3MoXCJzZWxlY3RlZFwiLCBmYWxzZSk7XG4gICAgICAgICAgICBlbHNlIGlmICh0aGlzLnBhcmVudCBpbnN0YW5jZW9mIFBvcHVwTWVudSkgdGhpcy5wYXJlbnQuc2V0Q2hpbGRNZW51KCk7XG4gICAgICAgIH0pO1xuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9XG59XG5cbmZ1bmN0aW9uIGVzY2FwZVJlZ2V4KHM6IHN0cmluZykge1xuICAgIHJldHVybiBzLnJlcGxhY2UoL1suKis/XiR7fSgpfFtcXF1cXFxcXS9nLCAnXFxcXCQmJyk7XG59XG5cbmxldCBvbGRYID0gMCwgb2xkWSA9IDBcblxuZnVuY3Rpb24gbW91c2VNb3ZlZCh7Y2xpZW50WCwgY2xpZW50WX06IHtjbGllbnRYOiBudW1iZXIsIGNsaWVudFk6IG51bWJlcn0pIHtcbiAgICBpZiAoIE1hdGguYWJzKG9sZFgtY2xpZW50WCkgfHwgTWF0aC5hYnMob2xkWS1jbGllbnRZKSApIHtcbiAgICAgICAgb2xkWCA9IGNsaWVudFg7XG4gICAgICAgIG9sZFkgPSBjbGllbnRZO1xuICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9XG4gICAgcmV0dXJuIGZhbHNlO1xufVxuXG5mdW5jdGlvbiBvbkVsZW1lbnQ8SyBleHRlbmRzIGtleW9mIEhUTUxFbGVtZW50RXZlbnRNYXA+KFxuICAgIGVsOiBIVE1MRWxlbWVudCwgdHlwZTogSywgc2VsZWN0b3I6c3RyaW5nLFxuICAgIGxpc3RlbmVyOiAodGhpczogSFRNTEVsZW1lbnQsIGV2OiBIVE1MRWxlbWVudEV2ZW50TWFwW0tdLCBkZWxlZ2F0ZVRhcmdldDogSFRNTEVsZW1lbnQpID0+IGFueSxcbiAgICBvcHRpb25zOiBib29sZWFuIHwgQWRkRXZlbnRMaXN0ZW5lck9wdGlvbnMgPSBmYWxzZVxuKSB7XG4gICAgZWwub24odHlwZSwgc2VsZWN0b3IsIGxpc3RlbmVyLCBvcHRpb25zKVxuICAgIHJldHVybiAoKSA9PiBlbC5vZmYodHlwZSwgc2VsZWN0b3IsIGxpc3RlbmVyLCBvcHRpb25zKTtcbn0iLCJpbXBvcnQgeyBLZXltYXAsIE5vdGljZSwgVEFic3RyYWN0RmlsZSwgVEZpbGUsIFRGb2xkZXIsIFZpZXcgfSBmcm9tIFwib2JzaWRpYW5cIjtcbmltcG9ydCB7IFBvcHVwTWVudSwgTWVudVBhcmVudCB9IGZyb20gXCIuL21lbnVzXCI7XG5pbXBvcnQge2kxOG59IGZyb20gXCJpMThuZXh0XCI7XG5cbmRlY2xhcmUgZ2xvYmFsIHtcbiAgICBjb25zdCBpMThuZXh0OiBpMThuXG59XG5cbmRlY2xhcmUgbW9kdWxlIFwib2JzaWRpYW5cIiB7XG4gICAgaW50ZXJmYWNlIEFwcCB7XG4gICAgICAgIHNldEF0dGFjaG1lbnRGb2xkZXIoZm9sZGVyOiBURm9sZGVyKTogdm9pZFxuICAgICAgICBpbnRlcm5hbFBsdWdpbnM6IHtcbiAgICAgICAgICAgIHBsdWdpbnM6IHtcbiAgICAgICAgICAgICAgICBcImZpbGUtZXhwbG9yZXJcIjoge1xuICAgICAgICAgICAgICAgICAgICBlbmFibGVkOiBib29sZWFuXG4gICAgICAgICAgICAgICAgICAgIGluc3RhbmNlOiB7XG4gICAgICAgICAgICAgICAgICAgICAgICByZXZlYWxJbkZvbGRlcihmaWxlOiBUQWJzdHJhY3RGaWxlKTogdm9pZFxuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxuICAgIGludGVyZmFjZSBGaWxlTWFuYWdlciB7XG4gICAgICAgIHByb21wdEZvckZvbGRlckRlbGV0aW9uKGZvbGRlcjogVEZvbGRlcik6IHZvaWRcbiAgICAgICAgcHJvbXB0Rm9yRmlsZURlbGV0aW9uKGZpbGU6IFRGaWxlKTogdm9pZFxuICAgICAgICBwcm9tcHRGb3JGaWxlUmVuYW1lKGZpbGU6IFRBYnN0cmFjdEZpbGUpOiB2b2lkXG4gICAgICAgIGNyZWF0ZU5ld01hcmtkb3duRmlsZShwYXJlbnRGb2xkZXI/OiBURm9sZGVyLCBwYXR0ZXJuPzogc3RyaW5nKTogUHJvbWlzZTxURmlsZT5cbiAgICB9XG59XG5cbmludGVyZmFjZSBGaWxlRXhwbG9yZXJWaWV3IGV4dGVuZHMgVmlldyB7XG4gICAgY3JlYXRlQWJzdHJhY3RGaWxlKGtpbmQ6IFwiZmlsZVwiIHwgXCJmb2xkZXJcIiwgcGFyZW50OiBURm9sZGVyLCBuZXdMZWFmPzogYm9vbGVhbik6IFByb21pc2U8dm9pZD5cbiAgICBzdGFydFJlbmFtZUZpbGUoZmlsZTogVEFic3RyYWN0RmlsZSk6IFByb21pc2U8dm9pZD5cbn1cblxuZnVuY3Rpb24gb3B0TmFtZShuYW1lOiBzdHJpbmcpIHtcbiAgICByZXR1cm4gaTE4bmV4dC50KGBwbHVnaW5zLmZpbGUtZXhwbG9yZXIubWVudS1vcHQtJHtuYW1lfWApO1xufVxuXG5leHBvcnQgY2xhc3MgQ29udGV4dE1lbnUgZXh0ZW5kcyBQb3B1cE1lbnUge1xuICAgIGNvbnN0cnVjdG9yKHBhcmVudDogTWVudVBhcmVudCwgZmlsZTogVEFic3RyYWN0RmlsZSkge1xuICAgICAgICBzdXBlcihwYXJlbnQpO1xuICAgICAgICBjb25zdCB7IHdvcmtzcGFjZSB9ID0gdGhpcy5hcHA7XG4gICAgICAgIGNvbnN0IGhhdmVGaWxlRXhwbG9yZXIgPSB0aGlzLmFwcC5pbnRlcm5hbFBsdWdpbnMucGx1Z2luc1tcImZpbGUtZXhwbG9yZXJcIl0uZW5hYmxlZDtcblxuICAgICAgICBpZiAoZmlsZSBpbnN0YW5jZW9mIFRGb2xkZXIpIHtcbiAgICAgICAgICAgIHRoaXMuYWRkSXRlbShpID0+IGkuc2V0VGl0bGUob3B0TmFtZShcIm5ldy1ub3RlXCIpKS5zZXRJY29uKFwiY3JlYXRlLW5ld1wiKS5vbkNsaWNrKGFzeW5jIGUgPT4ge1xuICAgICAgICAgICAgICAgIGNvbnN0IG5ld0ZpbGUgPSBhd2FpdCB0aGlzLmFwcC5maWxlTWFuYWdlci5jcmVhdGVOZXdNYXJrZG93bkZpbGUoZmlsZSk7XG4gICAgICAgICAgICAgICAgaWYgKG5ld0ZpbGUpIGF3YWl0IHRoaXMuYXBwLndvcmtzcGFjZS5nZXRMZWFmKEtleW1hcC5pc01vZGlmaWVyKGUsIFwiTW9kXCIpKS5vcGVuRmlsZShuZXdGaWxlLCB7XG4gICAgICAgICAgICAgICAgICAgIGFjdGl2ZTogITAsIHN0YXRlOiB7IG1vZGU6IFwic291cmNlXCIgfSwgZVN0YXRlOiB7IHJlbmFtZTogXCJhbGxcIiB9XG4gICAgICAgICAgICAgICAgfSlcbiAgICAgICAgICAgIH0pKTtcbiAgICAgICAgICAgIHRoaXMuYWRkSXRlbShpID0+IGkuc2V0VGl0bGUob3B0TmFtZShcIm5ldy1mb2xkZXJcIikpLnNldEljb24oXCJmb2xkZXJcIikuc2V0RGlzYWJsZWQoIWhhdmVGaWxlRXhwbG9yZXIpLm9uQ2xpY2soZXZlbnQgPT4ge1xuICAgICAgICAgICAgICAgIGlmIChoYXZlRmlsZUV4cGxvcmVyKSB7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMud2l0aEV4cGxvcmVyKGZpbGUpPy5jcmVhdGVBYnN0cmFjdEZpbGUoXCJmb2xkZXJcIiwgZmlsZSk7XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgbmV3IE5vdGljZShcIlRoZSBGaWxlIEV4cGxvcmVyIGNvcmUgcGx1Z2luIG11c3QgYmUgZW5hYmxlZCB0byBjcmVhdGUgbmV3IGZvbGRlcnNcIilcbiAgICAgICAgICAgICAgICAgICAgZXZlbnQuc3RvcFByb3BhZ2F0aW9uKCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSkpO1xuICAgICAgICAgICAgdGhpcy5hZGRJdGVtKGkgPT4gaS5zZXRUaXRsZShvcHROYW1lKFwic2V0LWF0dGFjaG1lbnQtZm9sZGVyXCIpKS5zZXRJY29uKFwiaW1hZ2UtZmlsZVwiKS5vbkNsaWNrKCgpID0+IHtcbiAgICAgICAgICAgICAgICB0aGlzLmFwcC5zZXRBdHRhY2htZW50Rm9sZGVyKGZpbGUpO1xuICAgICAgICAgICAgfSkpO1xuICAgICAgICAgICAgdGhpcy5hZGRTZXBhcmF0b3IoKTtcbiAgICAgICAgfVxuICAgICAgICB0aGlzLmFkZEl0ZW0oaSA9PiB7XG4gICAgICAgICAgICBpLnNldFRpdGxlKG9wdE5hbWUoXCJyZW5hbWVcIikpLnNldEljb24oXCJwZW5jaWxcIikub25DbGljayhldmVudCA9PiB7XG4gICAgICAgICAgICAgICAgdGhpcy5hcHAuZmlsZU1hbmFnZXIucHJvbXB0Rm9yRmlsZVJlbmFtZShmaWxlKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9KTtcbiAgICAgICAgdGhpcy5hZGRJdGVtKGkgPT4gaS5zZXRUaXRsZShvcHROYW1lKFwiZGVsZXRlXCIpKS5zZXRJY29uKFwidHJhc2hcIikub25DbGljaygoKSA9PiB7XG4gICAgICAgICAgICBpZiAoZmlsZSBpbnN0YW5jZW9mIFRGb2xkZXIpIHtcbiAgICAgICAgICAgICAgICB0aGlzLmFwcC5maWxlTWFuYWdlci5wcm9tcHRGb3JGb2xkZXJEZWxldGlvbihmaWxlKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2UgaWYgKGZpbGUgaW5zdGFuY2VvZiBURmlsZSkge1xuICAgICAgICAgICAgICAgIHRoaXMuYXBwLmZpbGVNYW5hZ2VyLnByb21wdEZvckZpbGVEZWxldGlvbihmaWxlKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSkpO1xuICAgICAgICBpZiAoZmlsZSBpbnN0YW5jZW9mIFRGb2xkZXIgJiYgaGF2ZUZpbGVFeHBsb3Jlcikge1xuICAgICAgICAgICAgdGhpcy5hZGRJdGVtKGkgPT4gaS5zZXRJY29uKFwiZm9sZGVyXCIpLnNldFRpdGxlKGkxOG5leHQudCgncGx1Z2lucy5maWxlLWV4cGxvcmVyLmFjdGlvbi1yZXZlYWwtZmlsZScpKS5vbkNsaWNrKCgpID0+IHtcbiAgICAgICAgICAgICAgICB0aGlzLndpdGhFeHBsb3JlcihmaWxlKTtcbiAgICAgICAgICAgIH0pKTtcbiAgICAgICAgfVxuICAgICAgICBpZiAoZmlsZSA9PT0gd29ya3NwYWNlLmdldEFjdGl2ZUZpbGUoKSkge1xuICAgICAgICAgICAgd29ya3NwYWNlLnRyaWdnZXIoXCJmaWxlLW1lbnVcIiwgdGhpcywgZmlsZSwgXCJxdWljay1leHBsb3JlclwiLCB3b3Jrc3BhY2UuYWN0aXZlTGVhZik7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB3b3Jrc3BhY2UudHJpZ2dlcihcImZpbGUtbWVudVwiLCB0aGlzLCBmaWxlLCBcInF1aWNrLWV4cGxvcmVyXCIpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgd2l0aEV4cGxvcmVyKGZpbGU6IFRBYnN0cmFjdEZpbGUpIHtcbiAgICAgICAgY29uc3QgZXhwbG9yZXIgPSB0aGlzLmFwcC5pbnRlcm5hbFBsdWdpbnMucGx1Z2luc1tcImZpbGUtZXhwbG9yZXJcIl07XG4gICAgICAgIGlmIChleHBsb3Jlci5lbmFibGVkKSB7XG4gICAgICAgICAgICBleHBsb3Jlci5pbnN0YW5jZS5yZXZlYWxJbkZvbGRlcihmaWxlKTtcbiAgICAgICAgICAgIHJldHVybiB0aGlzLmFwcC53b3Jrc3BhY2UuZ2V0TGVhdmVzT2ZUeXBlKFwiZmlsZS1leHBsb3JlclwiKVswXS52aWV3IGFzIEZpbGVFeHBsb3JlclZpZXdcbiAgICAgICAgfVxuICAgIH1cbn1cbiIsImltcG9ydCB7IFRBYnN0cmFjdEZpbGUsIFRGaWxlLCBURm9sZGVyLCBLZXltYXAsIE5vdGljZSwgQXBwLCBNZW51LCBIb3ZlclBhcmVudCwgZGVib3VuY2UsIE1lbnVJdGVtIH0gZnJvbSBcIm9ic2lkaWFuXCI7XG5pbXBvcnQgeyBob3ZlclNvdXJjZSwgc3RhcnREcmFnIH0gZnJvbSBcIi4vRXhwbG9yZXJcIjtcbmltcG9ydCB7IFBvcHVwTWVudSwgTWVudVBhcmVudCB9IGZyb20gXCIuL21lbnVzXCI7XG5pbXBvcnQgeyBDb250ZXh0TWVudSB9IGZyb20gXCIuL0NvbnRleHRNZW51XCI7XG5cbmRlY2xhcmUgbW9kdWxlIFwib2JzaWRpYW5cIiB7XG4gICAgaW50ZXJmYWNlIEhvdmVyUG9wb3ZlciB7XG4gICAgICAgIGhpZGUoKTogdm9pZFxuICAgICAgICBob3ZlckVsOiBIVE1MRGl2RWxlbWVudFxuICAgIH1cbiAgICBpbnRlcmZhY2UgQXBwIHtcbiAgICAgICAgdmlld1JlZ2lzdHJ5OiB7XG4gICAgICAgICAgICBpc0V4dGVuc2lvblJlZ2lzdGVyZWQoZXh0OiBzdHJpbmcpOiBib29sZWFuXG4gICAgICAgICAgICBnZXRUeXBlQnlFeHRlbnNpb24oZXh0OiBzdHJpbmcpOiBzdHJpbmdcbiAgICAgICAgfVxuICAgIH1cbiAgICBpbnRlcmZhY2UgVmF1bHQge1xuICAgICAgICBnZXRDb25maWcob3B0aW9uOiBzdHJpbmcpOiBhbnlcbiAgICAgICAgZ2V0Q29uZmlnKG9wdGlvbjpcInNob3dVbnN1cHBvcnRlZEZpbGVzXCIpOiBib29sZWFuXG4gICAgfVxufVxuXG5jb25zdCBhbHBoYVNvcnQgPSBuZXcgSW50bC5Db2xsYXRvcih1bmRlZmluZWQsIHt1c2FnZTogXCJzb3J0XCIsIHNlbnNpdGl2aXR5OiBcImJhc2VcIiwgbnVtZXJpYzogdHJ1ZX0pLmNvbXBhcmU7XG5cbmNvbnN0IHByZXZpZXdJY29uczogUmVjb3JkPHN0cmluZywgc3RyaW5nPiA9IHtcbiAgICBtYXJrZG93bjogXCJkb2N1bWVudFwiLFxuICAgIGltYWdlOiBcImltYWdlLWZpbGVcIixcbiAgICBhdWRpbzogXCJhdWRpby1maWxlXCIsXG4gICAgcGRmOiBcInBkZi1maWxlXCIsXG59XG5cbmNvbnN0IHZpZXd0eXBlSWNvbnM6IFJlY29yZDxzdHJpbmcsIHN0cmluZz4gPSB7XG4gICAgLi4ucHJldmlld0ljb25zLFxuICAgIC8vIGFkZCB0aGlyZC1wYXJ0eSBwbHVnaW5zXG4gICAgZXhjYWxpZHJhdzogXCJleGNhbGlkcmF3LWljb25cIixcbn07XG5cblxuZnVuY3Rpb24gZmlsZUljb24oYXBwOiBBcHAsIGZpbGU6IFRBYnN0cmFjdEZpbGUpIHtcbiAgICBpZiAoZmlsZSBpbnN0YW5jZW9mIFRGb2xkZXIpIHJldHVybiBcImZvbGRlclwiO1xuICAgIGlmIChmaWxlIGluc3RhbmNlb2YgVEZpbGUpIHtcbiAgICAgICAgY29uc3Qgdmlld1R5cGUgPSBhcHAudmlld1JlZ2lzdHJ5LmdldFR5cGVCeUV4dGVuc2lvbihmaWxlLmV4dGVuc2lvbik7XG4gICAgICAgIGlmICh2aWV3VHlwZSkgcmV0dXJuIHZpZXd0eXBlSWNvbnNbdmlld1R5cGVdID8/IFwiZG9jdW1lbnRcIjtcbiAgICB9XG59XG5cbi8vIEdsb2JhbCBhdXRvIHByZXZpZXcgbW9kZVxubGV0IGF1dG9QcmV2aWV3ID0gZmFsc2VcblxuZXhwb3J0IGNsYXNzIEZvbGRlck1lbnUgZXh0ZW5kcyBQb3B1cE1lbnUge1xuXG4gICAgcGFyZW50Rm9sZGVyOiBURm9sZGVyID0gdGhpcy5wYXJlbnQgaW5zdGFuY2VvZiBGb2xkZXJNZW51ID8gdGhpcy5wYXJlbnQuZm9sZGVyIDogbnVsbDtcbiAgICBsYXN0T3ZlcjogSFRNTEVsZW1lbnQgPSBudWxsO1xuXG4gICAgY29uc3RydWN0b3IocHVibGljIHBhcmVudDogTWVudVBhcmVudCwgcHVibGljIGZvbGRlcjogVEZvbGRlciwgcHVibGljIHNlbGVjdGVkRmlsZT86IFRBYnN0cmFjdEZpbGUsIHB1YmxpYyBvcGVuZXI/OiBIVE1MRWxlbWVudCkge1xuICAgICAgICBzdXBlcihwYXJlbnQpO1xuICAgICAgICB0aGlzLmxvYWRGaWxlcyhmb2xkZXIsIHNlbGVjdGVkRmlsZSk7XG4gICAgICAgIHRoaXMuc2NvcGUucmVnaXN0ZXIoW10sICAgICAgICBcIlRhYlwiLCAgIHRoaXMudG9nZ2xlUHJldmlld01vZGUuYmluZCh0aGlzKSk7XG4gICAgICAgIHRoaXMuc2NvcGUucmVnaXN0ZXIoW1wiTW9kXCJdLCAgIFwiRW50ZXJcIiwgdGhpcy5vbkVudGVyLmJpbmQodGhpcykpO1xuICAgICAgICB0aGlzLnNjb3BlLnJlZ2lzdGVyKFtcIkFsdFwiXSwgICBcIkVudGVyXCIsIHRoaXMub25FbnRlci5iaW5kKHRoaXMpKTtcbiAgICAgICAgdGhpcy5zY29wZS5yZWdpc3RlcihbXSwgICAgICAgIFwiRjJcIiwgICAgdGhpcy5kb1JlbmFtZS5iaW5kKHRoaXMpKTtcbiAgICAgICAgdGhpcy5zY29wZS5yZWdpc3RlcihbXCJTaGlmdFwiXSwgXCJGMlwiLCAgICB0aGlzLmRvTW92ZS5iaW5kKHRoaXMpKTtcblxuICAgICAgICBjb25zdCB7IGRvbSB9ID0gdGhpcztcbiAgICAgICAgZG9tLnN0eWxlLnNldFByb3BlcnR5KFxuICAgICAgICAgICAgLy8gQWxsb3cgcG9wb3ZlcnMgKGhvdmVyIHByZXZpZXcpIHRvIG92ZXJsYXkgdGhpcyBtZW51XG4gICAgICAgICAgICBcIi0tbGF5ZXItbWVudVwiLCBcIlwiICsgKHBhcnNlSW50KGdldENvbXB1dGVkU3R5bGUoZG9jdW1lbnQuYm9keSkuZ2V0UHJvcGVydHlWYWx1ZShcIi0tbGF5ZXItcG9wb3ZlclwiKSkgLSAxKVxuICAgICAgICApO1xuXG4gICAgICAgIGNvbnN0IG1lbnVJdGVtID0gXCIubWVudS1pdGVtW2RhdGEtZmlsZS1wYXRoXVwiO1xuICAgICAgICBkb20ub24oXCJjbGlja1wiLCAgICAgICBtZW51SXRlbSwgdGhpcy5vbkl0ZW1DbGljaywgdHJ1ZSk7XG4gICAgICAgIGRvbS5vbihcImNvbnRleHRtZW51XCIsIG1lbnVJdGVtLCB0aGlzLm9uSXRlbU1lbnUgKTtcbiAgICAgICAgZG9tLm9uKCdtb3VzZW92ZXInICAsIG1lbnVJdGVtLCB0aGlzLm9uSXRlbUhvdmVyKTtcbiAgICAgICAgZG9tLm9uKFwibW91c2Vkb3duXCIsICAgbWVudUl0ZW0sIGUgPT4ge2Uuc3RvcFByb3BhZ2F0aW9uKCl9LCB0cnVlKTsgIC8vIEZpeCBkcmFnIGNhbmNlbGxpbmdcbiAgICAgICAgZG9tLm9uKCdkcmFnc3RhcnQnLCAgIG1lbnVJdGVtLCAoZXZlbnQsIHRhcmdldCkgPT4ge1xuICAgICAgICAgICAgc3RhcnREcmFnKHRoaXMuYXBwLCB0YXJnZXQuZGF0YXNldC5maWxlUGF0aCwgZXZlbnQpO1xuICAgICAgICB9KTtcblxuICAgICAgICAvLyBXaGVuIHdlIHVubG9hZCwgcmVhY3RpdmF0ZSBwYXJlbnQgbWVudSdzIGhvdmVyLCBpZiBuZWVkZWRcbiAgICAgICAgdGhpcy5yZWdpc3RlcigoKSA9PiB7IGF1dG9QcmV2aWV3ICYmIHRoaXMucGFyZW50IGluc3RhbmNlb2YgRm9sZGVyTWVudSAmJiB0aGlzLnBhcmVudC5zaG93UG9wb3ZlcigpOyB9KVxuICAgIH1cblxuICAgIG9uQXJyb3dMZWZ0KCk6IGJvb2xlYW4gfCB1bmRlZmluZWQge1xuICAgICAgICByZXR1cm4gc3VwZXIub25BcnJvd0xlZnQoKSA/PyB0aGlzLm9wZW5CcmVhZGNydW1iKHRoaXMub3BlbmVyPy5wcmV2aW91c0VsZW1lbnRTaWJsaW5nKTtcbiAgICB9XG5cbiAgICBkb1JlbmFtZSgpIHtcbiAgICAgICAgY29uc3QgZmlsZSA9IHRoaXMuY3VycmVudEZpbGUoKVxuICAgICAgICBpZiAoZmlsZSkgdGhpcy5hcHAuZmlsZU1hbmFnZXIucHJvbXB0Rm9yRmlsZVJlbmFtZShmaWxlKTtcbiAgICB9XG5cbiAgICBkb01vdmUoKSB7XG4gICAgICAgIGNvbnN0IGV4cGxvcmVyUGx1Z2luID0gdGhpcy5hcHAuaW50ZXJuYWxQbHVnaW5zLnBsdWdpbnNbXCJmaWxlLWV4cGxvcmVyXCJdO1xuICAgICAgICBpZiAoIWV4cGxvcmVyUGx1Z2luLmVuYWJsZWQpIHtcbiAgICAgICAgICAgIG5ldyBOb3RpY2UoXCJGaWxlIGV4cGxvcmVyIGNvcmUgcGx1Z2luIG11c3QgYmUgZW5hYmxlZCB0byBtb3ZlIGZpbGVzIG9yIGZvbGRlcnNcIik7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cbiAgICAgICAgY29uc3QgbW9kYWwgPSBleHBsb3JlclBsdWdpbi5pbnN0YW5jZS5tb3ZlRmlsZU1vZGFsO1xuICAgICAgICBtb2RhbC5zZXRDdXJyZW50RmlsZSh0aGlzLmN1cnJlbnRGaWxlKCkpO1xuICAgICAgICBtb2RhbC5vcGVuKClcbiAgICB9XG5cbiAgICBjdXJyZW50SXRlbSgpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuaXRlbXNbdGhpcy5zZWxlY3RlZF07XG4gICAgfVxuXG4gICAgY3VycmVudEZpbGUoKSB7XG4gICAgICAgIHJldHVybiB0aGlzLmZpbGVGb3JEb20odGhpcy5jdXJyZW50SXRlbSgpPy5kb20pXG4gICAgfVxuXG4gICAgZmlsZUZvckRvbSh0YXJnZXRFbDogSFRNTERpdkVsZW1lbnQpIHtcbiAgICAgICAgY29uc3QgeyBmaWxlUGF0aCB9ID0gdGFyZ2V0RWw/LmRhdGFzZXQ7XG4gICAgICAgIGlmIChmaWxlUGF0aCkgcmV0dXJuIHRoaXMuYXBwLnZhdWx0LmdldEFic3RyYWN0RmlsZUJ5UGF0aChmaWxlUGF0aCk7XG4gICAgfVxuXG4gICAgaXRlbUZvclBhdGgoZmlsZVBhdGg6IHN0cmluZykge1xuICAgICAgICByZXR1cm4gdGhpcy5pdGVtcy5maW5kSW5kZXgoaSA9PiBpLmRvbS5kYXRhc2V0LmZpbGVQYXRoID09PSBmaWxlUGF0aCk7XG4gICAgfVxuXG4gICAgb3BlbkJyZWFkY3J1bWIoZWxlbWVudDogRWxlbWVudCkge1xuICAgICAgICBpZiAoZWxlbWVudCAmJiB0aGlzLnJvb3RNZW51KCkgPT09IHRoaXMpIHtcbiAgICAgICAgICAgIGNvbnN0IHByZXZFeHBsb3JhYmxlID0gdGhpcy5vcGVuZXIucHJldmlvdXNFbGVtZW50U2libGluZztcbiAgICAgICAgICAgIHRoaXMuaGlkZSgpO1xuICAgICAgICAgICAgKGVsZW1lbnQgYXMgSFRNTERpdkVsZW1lbnQpLmNsaWNrKClcbiAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIG9uQXJyb3dSaWdodCgpOiBib29sZWFuIHwgdW5kZWZpbmVkIHtcbiAgICAgICAgY29uc3QgZmlsZSA9IHRoaXMuY3VycmVudEZpbGUoKTtcbiAgICAgICAgaWYgKGZpbGUgaW5zdGFuY2VvZiBURm9sZGVyICYmIGZpbGUgIT09IHRoaXMuc2VsZWN0ZWRGaWxlKSB7XG4gICAgICAgICAgICB0aGlzLm9uQ2xpY2tGaWxlKGZpbGUsIHRoaXMuY3VycmVudEl0ZW0oKS5kb20pO1xuICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiB0aGlzLm9wZW5CcmVhZGNydW1iKHRoaXMub3BlbmVyPy5uZXh0RWxlbWVudFNpYmxpbmcpO1xuICAgIH1cblxuICAgIGxvYWRGaWxlcyhmb2xkZXI6IFRGb2xkZXIsIHNlbGVjdGVkRmlsZT86IFRBYnN0cmFjdEZpbGUpIHtcbiAgICAgICAgdGhpcy5kb20uZW1wdHkoKTsgdGhpcy5pdGVtcyA9IFtdO1xuICAgICAgICBjb25zdCBhbGxGaWxlcyA9IHRoaXMuYXBwLnZhdWx0LmdldENvbmZpZyhcInNob3dVbnN1cHBvcnRlZEZpbGVzXCIpO1xuICAgICAgICBjb25zdCB7Y2hpbGRyZW4sIHBhcmVudH0gPSBmb2xkZXI7XG4gICAgICAgIGNvbnN0IGl0ZW1zID0gY2hpbGRyZW4uc2xpY2UoKS5zb3J0KChhOiBUQWJzdHJhY3RGaWxlLCBiOiBUQWJzdHJhY3RGaWxlKSA9PiBhbHBoYVNvcnQoYS5uYW1lLCBiLm5hbWUpKVxuICAgICAgICBjb25zdCBmb2xkZXJzID0gaXRlbXMuZmlsdGVyKGYgPT4gZiBpbnN0YW5jZW9mIFRGb2xkZXIpIGFzIFRGb2xkZXJbXTtcbiAgICAgICAgY29uc3QgZmlsZXMgICA9IGl0ZW1zLmZpbHRlcihmID0+IGYgaW5zdGFuY2VvZiBURmlsZSAmJiAoYWxsRmlsZXMgfHwgZmlsZUljb24odGhpcy5hcHAsIGYpKSkgYXMgVEZpbGVbXTtcbiAgICAgICAgZm9sZGVycy5zb3J0KChhLCBiKSA9PiBhbHBoYVNvcnQoYS5uYW1lLCBiLm5hbWUpKTtcbiAgICAgICAgZmlsZXMuc29ydCgoYSwgYikgPT4gYWxwaGFTb3J0KGEuYmFzZW5hbWUsIGIuYmFzZW5hbWUpKTtcbiAgICAgICAgaWYgKHBhcmVudCkgZm9sZGVycy51bnNoaWZ0KHBhcmVudCk7XG4gICAgICAgIGZvbGRlcnMubWFwKHRoaXMuYWRkRmlsZSwgdGhpcyk7XG4gICAgICAgIGlmIChmb2xkZXJzLmxlbmd0aCAmJiBmaWxlcy5sZW5ndGgpIHRoaXMuYWRkU2VwYXJhdG9yKCk7XG4gICAgICAgIGZpbGVzLm1hcCggIHRoaXMuYWRkRmlsZSwgdGhpcyk7XG4gICAgICAgIGlmIChzZWxlY3RlZEZpbGUpIHRoaXMuc2VsZWN0KHRoaXMuaXRlbUZvclBhdGgoc2VsZWN0ZWRGaWxlLnBhdGgpKTsgZWxzZSB0aGlzLnNlbGVjdGVkID0gLTE7XG4gICAgfVxuXG4gICAgYWRkRmlsZShmaWxlOiBUQWJzdHJhY3RGaWxlKSB7XG4gICAgICAgIGNvbnN0IGljb24gPSBmaWxlSWNvbih0aGlzLmFwcCwgZmlsZSk7XG4gICAgICAgIHRoaXMuYWRkSXRlbShpID0+IHtcbiAgICAgICAgICAgIGkuc2V0VGl0bGUoKGZpbGUgPT09IHRoaXMuZm9sZGVyLnBhcmVudCkgPyBcIi4uXCIgOiBmaWxlLm5hbWUpO1xuICAgICAgICAgICAgaS5kb20uZGF0YXNldC5maWxlUGF0aCA9IGZpbGUucGF0aDtcbiAgICAgICAgICAgIGkuZG9tLnNldEF0dHIoXCJkcmFnZ2FibGVcIiwgXCJ0cnVlXCIpO1xuICAgICAgICAgICAgaWYgKGljb24pIGkuc2V0SWNvbihpY29uKTtcbiAgICAgICAgICAgIGlmIChmaWxlIGluc3RhbmNlb2YgVEZpbGUpIHtcbiAgICAgICAgICAgICAgICBpLnNldFRpdGxlKGZpbGUuYmFzZW5hbWUpO1xuICAgICAgICAgICAgICAgIGlmIChmaWxlLmV4dGVuc2lvbiAhPT0gXCJtZFwiKSBpLmRvbS5jcmVhdGVEaXYoe3RleHQ6IGZpbGUuZXh0ZW5zaW9uLCBjbHM6IFwibmF2LWZpbGUtdGFnXCJ9KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGkub25DbGljayhlID0+IHRoaXMub25DbGlja0ZpbGUoZmlsZSwgaS5kb20sIGUpKVxuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICB0b2dnbGVQcmV2aWV3TW9kZSgpIHtcbiAgICAgICAgaWYgKGF1dG9QcmV2aWV3ID0gIWF1dG9QcmV2aWV3KSB0aGlzLnNob3dQb3BvdmVyKCk7IGVsc2UgdGhpcy5oaWRlUG9wb3ZlcigpO1xuICAgIH1cblxuICAgIG9ubG9hZCgpIHtcbiAgICAgICAgc3VwZXIub25sb2FkKCk7XG4gICAgICAgIHRoaXMucmVnaXN0ZXJFdmVudCh0aGlzLmFwcC52YXVsdC5vbihcInJlbmFtZVwiLCAoZmlsZSwgb2xkUGF0aCkgPT4ge1xuICAgICAgICAgICAgaWYgKHRoaXMuZm9sZGVyID09PSBmaWxlLnBhcmVudCkge1xuICAgICAgICAgICAgICAgIC8vIERlc3RpbmF0aW9uIHdhcyBoZXJlOyByZWZyZXNoIHRoZSBsaXN0XG4gICAgICAgICAgICAgICAgY29uc3Qgc2VsZWN0ZWRGaWxlID0gdGhpcy5pdGVtRm9yUGF0aChvbGRQYXRoKSA+PSAwID8gZmlsZSA6IHRoaXMuY3VycmVudEZpbGUoKTtcbiAgICAgICAgICAgICAgICB0aGlzLmxvYWRGaWxlcyh0aGlzLmZvbGRlciwgc2VsZWN0ZWRGaWxlKTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgLy8gUmVtb3ZlIGl0IGlmIGl0IHdhcyBtb3ZlZCBvdXQgb2YgaGVyZVxuICAgICAgICAgICAgICAgIHRoaXMucmVtb3ZlSXRlbUZvclBhdGgob2xkUGF0aCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pKTtcbiAgICAgICAgdGhpcy5yZWdpc3RlckV2ZW50KHRoaXMuYXBwLnZhdWx0Lm9uKFwiZGVsZXRlXCIsIGZpbGUgPT4gdGhpcy5yZW1vdmVJdGVtRm9yUGF0aChmaWxlLnBhdGgpKSk7XG5cbiAgICAgICAgLy8gQWN0aXZhdGUgcHJldmlldyBpbW1lZGlhdGVseSBpZiBhcHBsaWNhYmxlXG4gICAgICAgIGlmIChhdXRvUHJldmlldyAmJiB0aGlzLnNlbGVjdGVkICE9IC0xKSB0aGlzLnNob3dQb3BvdmVyKCk7XG4gICAgfVxuXG4gICAgcmVtb3ZlSXRlbUZvclBhdGgocGF0aDogc3RyaW5nKSB7XG4gICAgICAgIGNvbnN0IHBvc24gPSB0aGlzLml0ZW1Gb3JQYXRoKHBhdGgpO1xuICAgICAgICBpZiAocG9zbiA8IDApIHJldHVybjtcbiAgICAgICAgY29uc3QgaXRlbSA9IHRoaXMuaXRlbXNbcG9zbl07XG4gICAgICAgIGlmICh0aGlzLnNlbGVjdGVkID4gcG9zbikgdGhpcy5zZWxlY3RlZCAtPSAxO1xuICAgICAgICBpdGVtLmRvbS5kZXRhY2goKVxuICAgICAgICB0aGlzLml0ZW1zLnJlbW92ZShpdGVtKTtcbiAgICB9XG5cbiAgICBoaWRlKCkge1xuICAgICAgICB0aGlzLmhpZGVQb3BvdmVyKCk7XG4gICAgICAgIHJldHVybiBzdXBlci5oaWRlKCk7XG4gICAgfVxuXG4gICAgc2VsZWN0KGlkeDogbnVtYmVyLCBzY3JvbGwgPSB0cnVlKSB7XG4gICAgICAgIGNvbnN0IG9sZCA9IHRoaXMuc2VsZWN0ZWQ7XG4gICAgICAgIHN1cGVyLnNlbGVjdChpZHgsIHNjcm9sbCk7XG4gICAgICAgIGlmIChvbGQgIT09IHRoaXMuc2VsZWN0ZWQpIHtcbiAgICAgICAgICAgIC8vIHNlbGVjdGVkIGl0ZW0gY2hhbmdlZDsgdHJpZ2dlciBuZXcgcG9wb3ZlciBvciBoaWRlIHRoZSBvbGQgb25lXG4gICAgICAgICAgICBpZiAoYXV0b1ByZXZpZXcpIHRoaXMuc2hvd1BvcG92ZXIoKTsgZWxzZSB0aGlzLmhpZGVQb3BvdmVyKCk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBoaWRlUG9wb3ZlcigpIHtcbiAgICAgICAgdGhpcy5ob3ZlclBvcG92ZXI/LmhpZGUoKTtcbiAgICB9XG5cbiAgICBjYW5TaG93UG9wb3ZlcigpIHtcbiAgICAgICAgcmV0dXJuICF0aGlzLmNoaWxkICYmIHRoaXMudmlzaWJsZTtcbiAgICB9XG5cbiAgICBzaG93UG9wb3ZlciA9IGRlYm91bmNlKCgpID0+IHtcbiAgICAgICAgdGhpcy5oaWRlUG9wb3ZlcigpO1xuICAgICAgICBpZiAoIWF1dG9QcmV2aWV3KSByZXR1cm47XG4gICAgICAgIHRoaXMubWF5YmVIb3Zlcih0aGlzLmN1cnJlbnRJdGVtKCk/LmRvbSwgZmlsZSA9PiB0aGlzLmFwcC53b3Jrc3BhY2UudHJpZ2dlcignbGluay1ob3ZlcicsIHRoaXMsIG51bGwsIGZpbGUucGF0aCwgXCJcIikpO1xuICAgIH0sIDUwLCB0cnVlKVxuXG4gICAgb25JdGVtSG92ZXIgPSAoZXZlbnQ6IE1vdXNlRXZlbnQsIHRhcmdldEVsOiBIVE1MRGl2RWxlbWVudCkgPT4ge1xuICAgICAgICBpZiAoIWF1dG9QcmV2aWV3KSB0aGlzLm1heWJlSG92ZXIodGFyZ2V0RWwsIGZpbGUgPT4gdGhpcy5hcHAud29ya3NwYWNlLnRyaWdnZXIoJ2hvdmVyLWxpbmsnLCB7XG4gICAgICAgICAgICBldmVudCwgc291cmNlOiBob3ZlclNvdXJjZSwgaG92ZXJQYXJlbnQ6IHRoaXMsIHRhcmdldEVsLCBsaW5rdGV4dDogZmlsZS5wYXRoXG4gICAgICAgIH0pKTtcbiAgICB9XG5cbiAgICBtYXliZUhvdmVyKHRhcmdldEVsOiBIVE1MRGl2RWxlbWVudCwgY2I6IChmaWxlOiBURmlsZSkgPT4gdm9pZCkge1xuICAgICAgICBpZiAoIXRoaXMuY2FuU2hvd1BvcG92ZXIoKSkgcmV0dXJuO1xuICAgICAgICBsZXQgZmlsZSA9IHRoaXMuZmlsZUZvckRvbSh0YXJnZXRFbClcbiAgICAgICAgaWYgKGZpbGUgaW5zdGFuY2VvZiBURm9sZGVyKSB7XG4gICAgICAgICAgICBmaWxlID0gdGhpcy5hcHAudmF1bHQuZ2V0QWJzdHJhY3RGaWxlQnlQYXRoKGZpbGUucGF0aCtcIi9cIitmaWxlLm5hbWUrXCIubWRcIik7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKGZpbGUgaW5zdGFuY2VvZiBURmlsZSAmJiBwcmV2aWV3SWNvbnNbdGhpcy5hcHAudmlld1JlZ2lzdHJ5LmdldFR5cGVCeUV4dGVuc2lvbihmaWxlLmV4dGVuc2lvbildKSB7XG4gICAgICAgICAgICBjYihmaWxlKVxuICAgICAgICB9O1xuICAgIH1cblxuXG4gICAgX3BvcG92ZXI6IEhvdmVyUGFyZW50W1wiaG92ZXJQb3BvdmVyXCJdO1xuXG4gICAgZ2V0IGhvdmVyUG9wb3ZlcigpIHsgcmV0dXJuIHRoaXMuX3BvcG92ZXI7IH1cblxuICAgIHNldCBob3ZlclBvcG92ZXIocG9wb3Zlcikge1xuICAgICAgICBpZiAocG9wb3ZlciAmJiAhdGhpcy5jYW5TaG93UG9wb3ZlcigpKSB7IHBvcG92ZXIuaGlkZSgpOyByZXR1cm47IH1cbiAgICAgICAgdGhpcy5fcG9wb3ZlciA9IHBvcG92ZXI7XG4gICAgICAgIGlmIChhdXRvUHJldmlldyAmJiBwb3BvdmVyICYmIHRoaXMuY3VycmVudEl0ZW0oKSkge1xuICAgICAgICAgICAgLy8gUG9zaXRpb24gdGhlIHBvcG92ZXIgc28gaXQgZG9lc24ndCBvdmVybGFwIHRoZSBtZW51IGhvcml6b250YWxseSAoYXMgbG9uZyBhcyBpdCBmaXRzKVxuICAgICAgICAgICAgLy8gYW5kIHNvIHRoYXQgaXRzIHZlcnRpY2FsIHBvc2l0aW9uIG92ZXJsYXBzIHRoZSBzZWxlY3RlZCBtZW51IGl0ZW0gKHBsYWNpbmcgdGhlIHRvcCBhXG4gICAgICAgICAgICAvLyBiaXQgYWJvdmUgdGhlIGN1cnJlbnQgaXRlbSwgdW5sZXNzIGl0IHdvdWxkIGdvIG9mZiB0aGUgYm90dG9tIG9mIHRoZSBzY3JlZW4pXG4gICAgICAgICAgICBjb25zdCBob3ZlckVsID0gcG9wb3Zlci5ob3ZlckVsO1xuICAgICAgICAgICAgaG92ZXJFbC5zaG93KCk7XG4gICAgICAgICAgICBjb25zdFxuICAgICAgICAgICAgICAgIG1lbnUgPSB0aGlzLmRvbS5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKSxcbiAgICAgICAgICAgICAgICBzZWxlY3RlZCA9IHRoaXMuY3VycmVudEl0ZW0oKS5kb20uZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCksXG4gICAgICAgICAgICAgICAgY29udGFpbmVyID0gaG92ZXJFbC5vZmZzZXRQYXJlbnQgfHwgZG9jdW1lbnQuZG9jdW1lbnRFbGVtZW50LFxuICAgICAgICAgICAgICAgIHBvcHVwSGVpZ2h0ID0gaG92ZXJFbC5vZmZzZXRIZWlnaHQsXG4gICAgICAgICAgICAgICAgbGVmdCA9IE1hdGgubWluKG1lbnUucmlnaHQgKyAyLCBjb250YWluZXIuY2xpZW50V2lkdGggLSBob3ZlckVsLm9mZnNldFdpZHRoKSxcbiAgICAgICAgICAgICAgICB0b3AgPSBNYXRoLm1pbihNYXRoLm1heCgwLCBzZWxlY3RlZC50b3AgLSBwb3B1cEhlaWdodC84KSwgY29udGFpbmVyLmNsaWVudEhlaWdodCAtIHBvcHVwSGVpZ2h0KVxuICAgICAgICAgICAgO1xuICAgICAgICAgICAgaG92ZXJFbC5zdHlsZS50b3AgPSB0b3AgKyBcInB4XCI7XG4gICAgICAgICAgICBob3ZlckVsLnN0eWxlLmxlZnQgPSBsZWZ0ICsgXCJweFwiO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgb25JdGVtQ2xpY2sgPSAoZXZlbnQ6IE1vdXNlRXZlbnQsIHRhcmdldDogSFRNTERpdkVsZW1lbnQpID0+IHtcbiAgICAgICAgY29uc3QgZmlsZSA9IHRoaXMuZmlsZUZvckRvbSh0YXJnZXQpO1xuICAgICAgICB0aGlzLmxhc3RPdmVyID0gdGFyZ2V0O1xuICAgICAgICBpZiAoIWZpbGUpIHJldHVybjtcbiAgICAgICAgaWYgKCF0aGlzLm9uQ2xpY2tGaWxlKGZpbGUsIHRhcmdldCwgZXZlbnQpKSB7XG4gICAgICAgICAgICAvLyBLZWVwIGN1cnJlbnQgbWVudSB0cmVlIG9wZW5cbiAgICAgICAgICAgIGV2ZW50LnN0b3BQcm9wYWdhdGlvbigpO1xuICAgICAgICAgICAgZXZlbnQucHJldmVudERlZmF1bHQoKTtcbiAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIG9uQ2xpY2tGaWxlKGZpbGU6IFRBYnN0cmFjdEZpbGUsIHRhcmdldDogSFRNTERpdkVsZW1lbnQsIGV2ZW50PzogTW91c2VFdmVudHxLZXlib2FyZEV2ZW50KSB7XG4gICAgICAgIHRoaXMuaGlkZVBvcG92ZXIoKTtcbiAgICAgICAgaWYgKGV2ZW50IGluc3RhbmNlb2YgS2V5Ym9hcmRFdmVudCAmJiBldmVudC5rZXkgPT09IFwiRW50ZXJcIiAmJiBLZXltYXAuZ2V0TW9kaWZpZXJzKGV2ZW50KSA9PT0gXCJBbHRcIikge1xuICAgICAgICAgICAgLy8gT3BlbiBjb250ZXh0IG1lbnUgdy9BbHQtRW50ZXJcbiAgICAgICAgICAgIG5ldyBDb250ZXh0TWVudSh0aGlzLCBmaWxlKS5jYXNjYWRlKHRhcmdldCk7XG4gICAgICAgICAgICByZXR1cm5cbiAgICAgICAgfVxuICAgICAgICBpZiAoZmlsZSBpbnN0YW5jZW9mIFRGaWxlKSB7XG4gICAgICAgICAgICBpZiAodGhpcy5hcHAudmlld1JlZ2lzdHJ5LmlzRXh0ZW5zaW9uUmVnaXN0ZXJlZChmaWxlLmV4dGVuc2lvbikpIHtcbiAgICAgICAgICAgICAgICB0aGlzLmFwcC53b3Jrc3BhY2Uub3BlbkxpbmtUZXh0KGZpbGUucGF0aCwgXCJcIiwgZXZlbnQgJiYgS2V5bWFwLmlzTW9kaWZpZXIoZXZlbnQsIFwiTW9kXCIpKTtcbiAgICAgICAgICAgICAgICAvLyBDbG9zZSB0aGUgZW50aXJlIG1lbnUgdHJlZVxuICAgICAgICAgICAgICAgIHRoaXMucm9vdE1lbnUoKS5oaWRlKCk7XG4gICAgICAgICAgICAgICAgZXZlbnQ/LnN0b3BQcm9wYWdhdGlvbigpO1xuICAgICAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBuZXcgTm90aWNlKGAuJHtmaWxlLmV4dGVuc2lvbn0gZmlsZXMgY2Fubm90IGJlIG9wZW5lZCBpbiBPYnNpZGlhbjsgVXNlIFwiT3BlbiBpbiBEZWZhdWx0IEFwcFwiIHRvIG9wZW4gdGhlbSBleHRlcm5hbGx5YCk7XG4gICAgICAgICAgICAgICAgLy8gZmFsbCB0aHJvdWdoXG4gICAgICAgICAgICB9XG4gICAgICAgIH0gZWxzZSBpZiAoZmlsZSA9PT0gdGhpcy5wYXJlbnRGb2xkZXIpIHtcbiAgICAgICAgICAgIC8vIFdlJ3JlIGEgY2hpbGQgbWVudSBhbmQgc2VsZWN0ZWQgXCIuLlwiOiBqdXN0IHJldHVybiB0byBwcmV2aW91cyBtZW51XG4gICAgICAgICAgICB0aGlzLmhpZGUoKTtcbiAgICAgICAgfSBlbHNlIGlmIChmaWxlID09PSB0aGlzLmZvbGRlci5wYXJlbnQpIHtcbiAgICAgICAgICAgIC8vIE5vdCBhIGNoaWxkIG1lbnUsIGJ1dCBzZWxlY3RlZCBcIi4uXCI6IGdvIHRvIHByZXZpb3VzIGJyZWFkY3J1bWJcbiAgICAgICAgICAgIHRoaXMub25BcnJvd0xlZnQoKTtcbiAgICAgICAgfSBlbHNlIGlmIChmaWxlID09PSB0aGlzLnNlbGVjdGVkRmlsZSkge1xuICAgICAgICAgICAgLy8gVGFyZ2V0aW5nIHRoZSBpbml0aWFsbHktc2VsZWN0ZWQgc3ViZm9sZGVyOiBnbyB0byBuZXh0IGJyZWFkY3J1bWJcbiAgICAgICAgICAgIHRoaXMub3BlbkJyZWFkY3J1bWIodGhpcy5vcGVuZXI/Lm5leHRFbGVtZW50U2libGluZyk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAvLyBPdGhlcndpc2UsIHBvcCBhIG5ldyBtZW51IGZvciB0aGUgc3ViZm9sZGVyXG4gICAgICAgICAgICBjb25zdCBmb2xkZXJNZW51ID0gbmV3IEZvbGRlck1lbnUodGhpcywgZmlsZSBhcyBURm9sZGVyLCB0aGlzLmZvbGRlcik7XG4gICAgICAgICAgICBmb2xkZXJNZW51LmNhc2NhZGUodGFyZ2V0LCBldmVudCBpbnN0YW5jZW9mIE1vdXNlRXZlbnQgPyBldmVudCA6IHVuZGVmaW5lZCk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBvbkl0ZW1NZW51ID0gKGV2ZW50OiBNb3VzZUV2ZW50LCB0YXJnZXQ6IEhUTUxEaXZFbGVtZW50KSA9PiB7XG4gICAgICAgIGNvbnN0IGZpbGUgPSB0aGlzLmZpbGVGb3JEb20odGFyZ2V0KTtcbiAgICAgICAgaWYgKGZpbGUpIHtcbiAgICAgICAgICAgIHRoaXMubGFzdE92ZXIgPSB0YXJnZXQ7XG4gICAgICAgICAgICBuZXcgQ29udGV4dE1lbnUodGhpcywgZmlsZSkuY2FzY2FkZSh0YXJnZXQsIGV2ZW50KTtcbiAgICAgICAgICAgIC8vIEtlZXAgY3VycmVudCBtZW51IHRyZWUgb3BlblxuICAgICAgICAgICAgZXZlbnQuc3RvcFByb3BhZ2F0aW9uKCk7XG4gICAgICAgIH1cbiAgICB9XG59XG4iLCJpbXBvcnQgeyBBcHAsIFRBYnN0cmFjdEZpbGUsIFRGaWxlLCBURm9sZGVyIH0gZnJvbSBcIm9ic2lkaWFuXCI7XG5pbXBvcnQgeyBsaXN0LCBlbCB9IGZyb20gXCJyZWRvbVwiO1xuaW1wb3J0IHsgQ29udGV4dE1lbnUgfSBmcm9tIFwiLi9Db250ZXh0TWVudVwiO1xuaW1wb3J0IHsgRm9sZGVyTWVudSB9IGZyb20gXCIuL0ZvbGRlck1lbnVcIjtcblxuZXhwb3J0IGNvbnN0IGhvdmVyU291cmNlID0gXCJxdWljay1leHBsb3Jlcjpmb2xkZXItbWVudVwiO1xuXG5kZWNsYXJlIG1vZHVsZSBcIm9ic2lkaWFuXCIge1xuICAgIGludGVyZmFjZSBBcHAge1xuICAgICAgICBkcmFnTWFuYWdlcjogYW55XG4gICAgfVxufVxuXG5leHBvcnQgZnVuY3Rpb24gc3RhcnREcmFnKGFwcDogQXBwLCBwYXRoOiBzdHJpbmcsIGV2ZW50OiBEcmFnRXZlbnQpIHtcbiAgICBpZiAoIXBhdGggfHwgcGF0aCA9PT0gXCIvXCIpIHJldHVybjtcbiAgICBjb25zdCBmaWxlID0gYXBwLnZhdWx0LmdldEFic3RyYWN0RmlsZUJ5UGF0aChwYXRoKTtcbiAgICBpZiAoIWZpbGUpIHJldHVybjtcbiAgICBjb25zdCB7IGRyYWdNYW5hZ2VyIH0gPSBhcHA7XG4gICAgY29uc3QgZHJhZ0RhdGEgPSBmaWxlIGluc3RhbmNlb2YgVEZpbGUgPyBkcmFnTWFuYWdlci5kcmFnRmlsZShldmVudCwgZmlsZSkgOiBkcmFnTWFuYWdlci5kcmFnRm9sZGVyKGV2ZW50LCBmaWxlKTtcbiAgICBkcmFnTWFuYWdlci5vbkRyYWdTdGFydChldmVudCwgZHJhZ0RhdGEpO1xufVxuXG5jbGFzcyBFeHBsb3JhYmxlIHtcbiAgICBlbDogSFRNTFNwYW5FbGVtZW50ID0gPHNwYW4gZHJhZ2dhYmxlIGNsYXNzPVwiZXhwbG9yYWJsZSB0aXRsZWJhci1idXR0b25cIiAvPlxuICAgIHVwZGF0ZShkYXRhOiB7ZmlsZTogVEFic3RyYWN0RmlsZSwgcGF0aDogc3RyaW5nfSwgaW5kZXg6IG51bWJlciwgaXRlbXM6IGFueVtdKSB7XG4gICAgICAgIGNvbnN0IHtmaWxlLCBwYXRofSA9IGRhdGE7XG4gICAgICAgIGxldCBuYW1lID0gZmlsZS5uYW1lIHx8IHBhdGg7XG4gICAgICAgIGlmIChpbmRleCA8IGl0ZW1zLmxlbmd0aC0xKSBuYW1lICs9IFwiXFx1MDBBMC9cXHUwMEEwXCI7XG4gICAgICAgIHRoaXMuZWwudGV4dENvbnRlbnQgPSBuYW1lO1xuICAgICAgICB0aGlzLmVsLmRhdGFzZXQucGFyZW50UGF0aCA9IGZpbGUucGFyZW50Py5wYXRoID8/IFwiL1wiO1xuICAgICAgICB0aGlzLmVsLmRhdGFzZXQuZmlsZVBhdGggPSBwYXRoO1xuICAgIH1cbn1cblxuZXhwb3J0IGNsYXNzIEV4cGxvcmVyIHtcbiAgICBsYXN0RmlsZTogVEFic3RyYWN0RmlsZSA9IG51bGw7XG4gICAgbGFzdFBhdGg6IHN0cmluZyA9IG51bGw7XG4gICAgZWw6IEhUTUxFbGVtZW50ID0gPGRpdiBpZD1cInF1aWNrLWV4cGxvcmVyXCIgLz47XG4gICAgbGlzdCA9IGxpc3QodGhpcy5lbCwgRXhwbG9yYWJsZSk7XG5cbiAgICBjb25zdHJ1Y3RvcihwdWJsaWMgYXBwOiBBcHApIHtcbiAgICAgICAgdGhpcy5lbC5vbihcImNvbnRleHRtZW51XCIsIFwiLmV4cGxvcmFibGVcIiwgKGV2ZW50LCB0YXJnZXQpID0+IHtcbiAgICAgICAgICAgIGNvbnN0IHsgZmlsZVBhdGggfSA9IHRhcmdldC5kYXRhc2V0O1xuICAgICAgICAgICAgY29uc3QgZmlsZSA9IGFwcC52YXVsdC5nZXRBYnN0cmFjdEZpbGVCeVBhdGgoZmlsZVBhdGgpO1xuICAgICAgICAgICAgbmV3IENvbnRleHRNZW51KGFwcCwgZmlsZSkuY2FzY2FkZSh0YXJnZXQsIGV2ZW50KTtcbiAgICAgICAgfSk7XG4gICAgICAgIHRoaXMuZWwub24oXCJjbGlja1wiLCBcIi5leHBsb3JhYmxlXCIsIChldmVudCwgdGFyZ2V0KSA9PiB7XG4gICAgICAgICAgICBjb25zdCB7IHBhcmVudFBhdGgsIGZpbGVQYXRoIH0gPSB0YXJnZXQuZGF0YXNldDtcbiAgICAgICAgICAgIGNvbnN0IGZvbGRlciA9IGFwcC52YXVsdC5nZXRBYnN0cmFjdEZpbGVCeVBhdGgocGFyZW50UGF0aCk7XG4gICAgICAgICAgICBjb25zdCBzZWxlY3RlZCA9IGFwcC52YXVsdC5nZXRBYnN0cmFjdEZpbGVCeVBhdGgoZmlsZVBhdGgpO1xuICAgICAgICAgICAgbmV3IEZvbGRlck1lbnUoYXBwLCBmb2xkZXIgYXMgVEZvbGRlciwgc2VsZWN0ZWQsIHRhcmdldCkuY2FzY2FkZSh0YXJnZXQsIGV2ZW50LmlzVHJ1c3RlZCAmJiBldmVudCk7XG4gICAgICAgIH0pO1xuICAgICAgICB0aGlzLmVsLm9uKCdkcmFnc3RhcnQnLCBcIi5leHBsb3JhYmxlXCIsIChldmVudCwgdGFyZ2V0KSA9PiB7XG4gICAgICAgICAgICBzdGFydERyYWcoYXBwLCB0YXJnZXQuZGF0YXNldC5maWxlUGF0aCwgZXZlbnQpO1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBicm93c2VWYXVsdCgpIHtcbiAgICAgICAgKHRoaXMuZWwuZmlyc3RFbGVtZW50Q2hpbGQgYXMgSFRNTERpdkVsZW1lbnQpLmNsaWNrKCk7XG4gICAgfVxuXG4gICAgYnJvd3NlQ3VycmVudCgpIHtcbiAgICAgICAgKHRoaXMuZWwubGFzdEVsZW1lbnRDaGlsZCBhcyBIVE1MRGl2RWxlbWVudCkuY2xpY2soKTtcbiAgICB9XG5cbiAgICB1cGRhdGUoZmlsZTogVEFic3RyYWN0RmlsZSkge1xuICAgICAgICBmaWxlID8/PSB0aGlzLmFwcC52YXVsdC5nZXRBYnN0cmFjdEZpbGVCeVBhdGgoXCIvXCIpO1xuICAgICAgICBpZiAoZmlsZSA9PSB0aGlzLmxhc3RGaWxlICYmIGZpbGUucGF0aCA9PSB0aGlzLmxhc3RQYXRoKSByZXR1cm47XG4gICAgICAgIHRoaXMubGFzdEZpbGUgPSBmaWxlO1xuICAgICAgICB0aGlzLmxhc3RQYXRoID0gZmlsZS5wYXRoO1xuICAgICAgICBjb25zdCBwYXJ0cyA9IFtdO1xuICAgICAgICB3aGlsZSAoZmlsZSkge1xuICAgICAgICAgICAgcGFydHMudW5zaGlmdCh7IGZpbGUsIHBhdGg6IGZpbGUucGF0aCB9KTtcbiAgICAgICAgICAgIGZpbGUgPSBmaWxlLnBhcmVudDtcbiAgICAgICAgfVxuICAgICAgICBpZiAocGFydHMubGVuZ3RoID4gMSkgcGFydHMuc2hpZnQoKTtcbiAgICAgICAgdGhpcy5saXN0LnVwZGF0ZShwYXJ0cyk7XG4gICAgfVxuXG59XG4iLCJpbXBvcnQge1BsdWdpbiwgVEFic3RyYWN0RmlsZSwgVEZvbGRlcn0gZnJvbSBcIm9ic2lkaWFuXCI7XG5pbXBvcnQge21vdW50LCB1bm1vdW50fSBmcm9tIFwicmVkb21cIjtcbmltcG9ydCB7RXhwbG9yZXIsIGhvdmVyU291cmNlfSBmcm9tIFwiLi9FeHBsb3JlclwiO1xuXG5pbXBvcnQgXCIuL3JlZG9tLWpzeFwiO1xuaW1wb3J0IFwiLi9zdHlsZXMuc2Nzc1wiXG5cbmRlY2xhcmUgbW9kdWxlIFwib2JzaWRpYW5cIiB7XG4gICAgaW50ZXJmYWNlIFdvcmtzcGFjZSB7XG4gICAgICAgIHJlZ2lzdGVySG92ZXJMaW5rU291cmNlKHNvdXJjZTogc3RyaW5nLCBpbmZvOiB7ZGlzcGxheTogc3RyaW5nLCBkZWZhdWx0TW9kPzogYm9vbGVhbn0pOiB2b2lkXG4gICAgICAgIHVucmVnaXN0ZXJIb3ZlckxpbmtTb3VyY2Uoc291cmNlOiBzdHJpbmcpOiB2b2lkXG4gICAgfVxufVxuXG5leHBvcnQgZGVmYXVsdCBjbGFzcyBleHRlbmRzIFBsdWdpbiB7XG4gICAgc3RhdHVzYmFySXRlbTogSFRNTEVsZW1lbnRcbiAgICBleHBsb3JlcjogRXhwbG9yZXJcblxuICAgIG9ubG9hZCgpIHtcbiAgICAgICAgdGhpcy5hcHAud29ya3NwYWNlLm9uTGF5b3V0UmVhZHkoICgpID0+IHtcbiAgICAgICAgICAgIGNvbnN0IGJ1dHRvbkNvbnRhaW5lciA9IGRvY3VtZW50LmJvZHkuZmluZChcIi50aXRsZWJhciAudGl0bGViYXItYnV0dG9uLWNvbnRhaW5lci5tb2QtbGVmdFwiKTtcbiAgICAgICAgICAgIHRoaXMucmVnaXN0ZXIoKCkgPT4gdW5tb3VudChidXR0b25Db250YWluZXIsIHRoaXMuZXhwbG9yZXIpKTtcbiAgICAgICAgICAgIG1vdW50KGJ1dHRvbkNvbnRhaW5lciwgdGhpcy5leHBsb3JlciA9IG5ldyBFeHBsb3Jlcih0aGlzLmFwcCkpO1xuICAgICAgICAgICAgdGhpcy5leHBsb3Jlci51cGRhdGUodGhpcy5hcHAud29ya3NwYWNlLmdldEFjdGl2ZUZpbGUoKSlcbiAgICAgICAgICAgIHRoaXMucmVnaXN0ZXJFdmVudCh0aGlzLmFwcC53b3Jrc3BhY2Uub24oXCJmaWxlLW9wZW5cIiwgdGhpcy5leHBsb3Jlci51cGRhdGUsIHRoaXMuZXhwbG9yZXIpKTtcbiAgICAgICAgICAgIHRoaXMucmVnaXN0ZXJFdmVudCh0aGlzLmFwcC52YXVsdC5vbihcInJlbmFtZVwiLCB0aGlzLm9uRmlsZUNoYW5nZSwgdGhpcykpO1xuICAgICAgICAgICAgdGhpcy5yZWdpc3RlckV2ZW50KHRoaXMuYXBwLnZhdWx0Lm9uKFwiZGVsZXRlXCIsIHRoaXMub25GaWxlQ2hhbmdlLCB0aGlzKSk7XG4gICAgICAgIH0pO1xuICAgICAgICB0aGlzLmFwcC53b3Jrc3BhY2UucmVnaXN0ZXJIb3ZlckxpbmtTb3VyY2UoaG92ZXJTb3VyY2UsIHtcbiAgICAgICAgICAgIGRpc3BsYXk6ICdRdWljayBFeHBsb3JlcicsIGRlZmF1bHRNb2Q6IHRydWVcbiAgICAgICAgfSk7XG5cbiAgICAgICAgdGhpcy5hZGRDb21tYW5kKHsgaWQ6IFwiYnJvd3NlLXZhdWx0XCIsICAgbmFtZTogXCJCcm93c2UgdmF1bHRcIiwgICAgICAgICAgY2FsbGJhY2s6ICgpID0+IHsgdGhpcy5leHBsb3Jlcj8uYnJvd3NlVmF1bHQoKTsgfSwgfSk7XG4gICAgICAgIHRoaXMuYWRkQ29tbWFuZCh7IGlkOiBcImJyb3dzZS1jdXJyZW50XCIsIG5hbWU6IFwiQnJvd3NlIGN1cnJlbnQgZm9sZGVyXCIsIGNhbGxiYWNrOiAoKSA9PiB7IHRoaXMuZXhwbG9yZXI/LmJyb3dzZUN1cnJlbnQoKTsgfSwgfSk7XG5cbiAgICAgICAgT2JqZWN0LmRlZmluZVByb3BlcnR5KFRGb2xkZXIucHJvdG90eXBlLCBcImJhc2VuYW1lXCIsIHtnZXQoKXsgcmV0dXJuIHRoaXMubmFtZTsgfSwgY29uZmlndXJhYmxlOiB0cnVlfSlcbiAgICB9XG5cbiAgICBvbnVubG9hZCgpIHtcbiAgICAgICAgdGhpcy5hcHAud29ya3NwYWNlLnVucmVnaXN0ZXJIb3ZlckxpbmtTb3VyY2UoaG92ZXJTb3VyY2UpO1xuICAgIH1cblxuICAgIG9uRmlsZUNoYW5nZShmaWxlOiBUQWJzdHJhY3RGaWxlKSB7XG4gICAgICAgIGlmIChmaWxlID09PSB0aGlzLmV4cGxvcmVyLmxhc3RGaWxlKSB0aGlzLmV4cGxvcmVyLnVwZGF0ZShmaWxlKTtcbiAgICB9XG59XG4iXSwibmFtZXMiOlsiTWVudSIsIkFwcCIsImRlYm91bmNlIiwiTWVudUl0ZW0iLCJLZXltYXAiLCJURm9sZGVyIiwiTm90aWNlIiwiVEZpbGUiLCJQbHVnaW4iXSwibWFwcGluZ3MiOiI7Ozs7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
