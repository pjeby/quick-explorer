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
        this.firstMove = false;
        if (parent instanceof PopupMenu)
            parent.setChildMenu(this);
        this.scope = new obsidian.Scope;
        this.scope.register([], "ArrowUp", this.onArrowUp.bind(this));
        this.scope.register([], "ArrowDown", this.onArrowDown.bind(this));
        this.scope.register([], "Enter", this.onEnter.bind(this));
        this.scope.register([], "Escape", this.onEscape.bind(this));
        this.scope.register([], "ArrowLeft", this.onArrowLeft.bind(this));
        this.scope.register([], "Home", this.onHome.bind(this));
        this.scope.register([], "End", this.onEnd.bind(this));
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
    onEscape() {
        this.hide();
    }
    onload() {
        this.scope.register(null, null, this.onKeyDown.bind(this));
        super.onload();
        this.visible = true;
        this.showSelected();
        this.firstMove = true;
        // We wait until now to register so that any initial mouseover of the old mouse position will be skipped
        this.register(onElement(this.dom, "mouseover", ".menu-item", (event, target) => {
            if (!this.firstMove && !target.hasClass("is-disabled") && !this.child) {
                this.select(this.items.findIndex(i => i.dom === target), false);
            }
            this.firstMove = false;
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
        if (scroll)
            this.showSelected();
    }
    showSelected() {
        const el = this.items[this.selected]?.dom;
        if (el) {
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
        const { left, right, top, bottom, width } = target.getBoundingClientRect();
        const centerX = left + Math.min(150, width / 3);
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
        this.fileCount = (file) => (file instanceof obsidian.TFolder ? file.children.map(this.fileCount).reduce((a, b) => a + b, 0) : (this.fileIcon(file) ? 1 : 0));
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
                const idx = this.itemForPath(file.path);
                if (idx >= 0 && this.selected != idx)
                    this.select(idx);
                new ContextMenu(this, file).cascade(target, event);
                // Keep current menu tree open
                event.stopPropagation();
            }
        };
        this.loadFiles(folder, selectedFile);
        this.scope.register([], "Tab", this.togglePreviewMode.bind(this));
        this.scope.register(["Mod"], "Enter", this.onEnter.bind(this));
        this.scope.register(["Alt"], "Enter", this.onKeyboardContextMenu.bind(this));
        this.scope.register([], "\\", this.onKeyboardContextMenu.bind(this));
        this.scope.register([], "F2", this.doRename.bind(this));
        this.scope.register(["Shift"], "F2", this.doMove.bind(this));
        // Scroll preview window up and down
        this.scope.register([], "PageUp", this.doScroll.bind(this, -1, false));
        this.scope.register([], "PageDown", this.doScroll.bind(this, 1, false));
        this.scope.register(["Mod"], "Home", this.doScroll.bind(this, 0, true));
        this.scope.register(["Mod"], "End", this.doScroll.bind(this, 1, true));
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
    onKeyboardContextMenu() {
        const target = this.items[this.selected]?.dom, file = target && this.fileForDom(target);
        if (file)
            new ContextMenu(this, file).cascade(target);
    }
    doScroll(direction, toEnd, event) {
        const preview = this.hoverPopover?.hoverEl.find(".markdown-preview-view");
        if (preview) {
            preview.style.scrollBehavior = toEnd ? "auto" : "smooth";
            const oldTop = preview.scrollTop;
            const newTop = (toEnd ? 0 : preview.scrollTop) + direction * (toEnd ? preview.scrollHeight : preview.clientHeight);
            preview.scrollTop = newTop;
            if (!toEnd) {
                // Paging past the beginning or end
                if (newTop >= preview.scrollHeight) {
                    this.onArrowDown(event);
                }
                else if (newTop < 0) {
                    if (oldTop > 0)
                        preview.scrollTop = 0;
                    else
                        this.onArrowUp(event);
                }
            }
        }
        else {
            if (!autoPreview) {
                autoPreview = true;
                this.showPopover();
            }
            // No preview, just go to next or previous item
            else if (direction > 0)
                this.onArrowDown(event);
            else
                this.onArrowUp(event);
        }
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
        const files = items.filter(f => f instanceof obsidian.TFile && (allFiles || this.fileIcon(f)));
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
    fileIcon(file) {
        if (file instanceof obsidian.TFolder)
            return "folder";
        if (file instanceof obsidian.TFile) {
            const viewType = this.app.viewRegistry.getTypeByExtension(file.extension);
            if (viewType)
                return viewtypeIcons[viewType] ?? "document";
        }
    }
    addFile(file) {
        const icon = this.fileIcon(file);
        this.addItem(i => {
            i.setTitle((file === this.folder.parent) ? ".." : file.name);
            i.dom.dataset.filePath = file.path;
            i.dom.setAttr("draggable", "true");
            i.dom.addClass(file instanceof obsidian.TFolder ? "is-qe-folder" : "is-qe-file");
            if (icon)
                i.setIcon(icon);
            if (file instanceof obsidian.TFile) {
                i.setTitle(file.basename);
                if (file.extension !== "md")
                    i.dom.createDiv({ text: file.extension, cls: ["nav-file-tag", "qe-extension"] });
            }
            else if (file !== this.folder.parent) {
                const count = this.fileCount(file);
                if (count)
                    i.dom.createDiv({ text: "" + count, cls: "nav-file-tag qe-file-count" });
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
    onEscape() {
        super.onEscape();
        if (this.parent instanceof PopupMenu)
            this.parent.onEscape();
    }
    hide() {
        this.hidePopover();
        return super.hide();
    }
    setChildMenu(menu) {
        super.setChildMenu(menu);
        if (autoPreview && this.canShowPopover())
            this.showPopover();
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
        if (file instanceof obsidian.TFolder)
            file = this.folderNote(file);
        if (file instanceof obsidian.TFile && previewIcons[this.app.viewRegistry.getTypeByExtension(file.extension)]) {
            cb(file);
        }
    }
    folderNote(folder) {
        return this.app.vault.getAbstractFileByPath(this.folderNotePath(folder));
    }
    folderNotePath(folder) {
        return `${folder.path}/${folder.name}.md`;
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
        const idx = this.itemForPath(file.path);
        if (idx >= 0 && this.selected != idx)
            this.select(idx);
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
            const folderMenu = new FolderMenu(this, file, this.folderNote(file) || this.folder);
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
            this.folderMenu(target, event.isTrusted && event);
        });
        this.el.on('dragstart', ".explorable", (event, target) => {
            startDrag(app, target.dataset.filePath, event);
        });
    }
    folderMenu(opener = this.el.firstElementChild, event) {
        const { filePath, parentPath } = opener.dataset;
        const selected = this.app.vault.getAbstractFileByPath(filePath);
        const folder = this.app.vault.getAbstractFileByPath(parentPath);
        return new FolderMenu(this.app, folder, selected, opener).cascade(opener, event);
    }
    browseVault() {
        return this.folderMenu();
    }
    browseCurrent() {
        return this.folderMenu(this.el.lastElementChild);
    }
    browseFile(file) {
        if (file === this.app.workspace.getActiveFile())
            return this.browseCurrent();
        let menu;
        let opener = this.el.firstElementChild;
        const path = [], parts = file.path.split("/").filter(p => p);
        while (opener && parts.length) {
            path.push(parts[0]);
            if (opener.dataset.filePath !== path.join("/")) {
                menu = this.folderMenu(opener);
                path.pop();
                break;
            }
            parts.shift();
            opener = opener.nextElementSibling;
        }
        while (menu && parts.length) {
            path.push(parts.shift());
            const idx = menu.itemForPath(path.join("/"));
            if (idx == -1)
                break;
            menu.select(idx);
            if (parts.length || file instanceof obsidian.TFolder) {
                menu.onArrowRight();
                menu = menu.child;
            }
        }
        return menu;
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
        this.registerEvent(this.app.workspace.on("file-menu", (menu, file, source) => {
            let item;
            if (source !== "quick-explorer")
                menu.addItem(i => {
                    i.setIcon("folder").setTitle("Show in Quick Explorer").onClick(e => { this.explorer?.browseFile(file); });
                    item = i;
                });
            if (item) {
                const revealFile = i18next.t(`plugins.file-explorer.action-reveal-file`);
                const idx = menu.items.findIndex(i => i.titleEl.textContent === revealFile);
                menu.dom.insertBefore(item.dom, menu.items[idx + 1].dom);
                menu.items.remove(item);
                menu.items.splice(idx + 1, 0, item);
            }
        }));
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWFpbi5qcyIsInNvdXJjZXMiOlsiLnlhcm4vY2FjaGUvcmVkb20tbnBtLTMuMjcuMS0xNDhjZWZjMzI2LWY2OWI3YTVmMzQuemlwL25vZGVfbW9kdWxlcy9yZWRvbS9kaXN0L3JlZG9tLmVzLmpzIiwiLnlhcm4vY2FjaGUvbW9ua2V5LWFyb3VuZC1ucG0tMi4xLjAtNzBkZjMyZDJhYy0xYmQ3MmQyNWY5LnppcC9ub2RlX21vZHVsZXMvbW9ua2V5LWFyb3VuZC9tanMvaW5kZXguanMiLCJzcmMvbWVudXMudHMiLCJzcmMvQ29udGV4dE1lbnUudHMiLCJzcmMvRm9sZGVyTWVudS50cyIsInNyYy9FeHBsb3Jlci50c3giLCJzcmMvcXVpY2stZXhwbG9yZXIudHN4Il0sInNvdXJjZXNDb250ZW50IjpbImZ1bmN0aW9uIHBhcnNlUXVlcnkgKHF1ZXJ5KSB7XG4gIHZhciBjaHVua3MgPSBxdWVyeS5zcGxpdCgvKFsjLl0pLyk7XG4gIHZhciB0YWdOYW1lID0gJyc7XG4gIHZhciBpZCA9ICcnO1xuICB2YXIgY2xhc3NOYW1lcyA9IFtdO1xuXG4gIGZvciAodmFyIGkgPSAwOyBpIDwgY2h1bmtzLmxlbmd0aDsgaSsrKSB7XG4gICAgdmFyIGNodW5rID0gY2h1bmtzW2ldO1xuICAgIGlmIChjaHVuayA9PT0gJyMnKSB7XG4gICAgICBpZCA9IGNodW5rc1srK2ldO1xuICAgIH0gZWxzZSBpZiAoY2h1bmsgPT09ICcuJykge1xuICAgICAgY2xhc3NOYW1lcy5wdXNoKGNodW5rc1srK2ldKTtcbiAgICB9IGVsc2UgaWYgKGNodW5rLmxlbmd0aCkge1xuICAgICAgdGFnTmFtZSA9IGNodW5rO1xuICAgIH1cbiAgfVxuXG4gIHJldHVybiB7XG4gICAgdGFnOiB0YWdOYW1lIHx8ICdkaXYnLFxuICAgIGlkOiBpZCxcbiAgICBjbGFzc05hbWU6IGNsYXNzTmFtZXMuam9pbignICcpXG4gIH07XG59XG5cbmZ1bmN0aW9uIGNyZWF0ZUVsZW1lbnQgKHF1ZXJ5LCBucykge1xuICB2YXIgcmVmID0gcGFyc2VRdWVyeShxdWVyeSk7XG4gIHZhciB0YWcgPSByZWYudGFnO1xuICB2YXIgaWQgPSByZWYuaWQ7XG4gIHZhciBjbGFzc05hbWUgPSByZWYuY2xhc3NOYW1lO1xuICB2YXIgZWxlbWVudCA9IG5zID8gZG9jdW1lbnQuY3JlYXRlRWxlbWVudE5TKG5zLCB0YWcpIDogZG9jdW1lbnQuY3JlYXRlRWxlbWVudCh0YWcpO1xuXG4gIGlmIChpZCkge1xuICAgIGVsZW1lbnQuaWQgPSBpZDtcbiAgfVxuXG4gIGlmIChjbGFzc05hbWUpIHtcbiAgICBpZiAobnMpIHtcbiAgICAgIGVsZW1lbnQuc2V0QXR0cmlidXRlKCdjbGFzcycsIGNsYXNzTmFtZSk7XG4gICAgfSBlbHNlIHtcbiAgICAgIGVsZW1lbnQuY2xhc3NOYW1lID0gY2xhc3NOYW1lO1xuICAgIH1cbiAgfVxuXG4gIHJldHVybiBlbGVtZW50O1xufVxuXG5mdW5jdGlvbiB1bm1vdW50IChwYXJlbnQsIGNoaWxkKSB7XG4gIHZhciBwYXJlbnRFbCA9IGdldEVsKHBhcmVudCk7XG4gIHZhciBjaGlsZEVsID0gZ2V0RWwoY2hpbGQpO1xuXG4gIGlmIChjaGlsZCA9PT0gY2hpbGRFbCAmJiBjaGlsZEVsLl9fcmVkb21fdmlldykge1xuICAgIC8vIHRyeSB0byBsb29rIHVwIHRoZSB2aWV3IGlmIG5vdCBwcm92aWRlZFxuICAgIGNoaWxkID0gY2hpbGRFbC5fX3JlZG9tX3ZpZXc7XG4gIH1cblxuICBpZiAoY2hpbGRFbC5wYXJlbnROb2RlKSB7XG4gICAgZG9Vbm1vdW50KGNoaWxkLCBjaGlsZEVsLCBwYXJlbnRFbCk7XG5cbiAgICBwYXJlbnRFbC5yZW1vdmVDaGlsZChjaGlsZEVsKTtcbiAgfVxuXG4gIHJldHVybiBjaGlsZDtcbn1cblxuZnVuY3Rpb24gZG9Vbm1vdW50IChjaGlsZCwgY2hpbGRFbCwgcGFyZW50RWwpIHtcbiAgdmFyIGhvb2tzID0gY2hpbGRFbC5fX3JlZG9tX2xpZmVjeWNsZTtcblxuICBpZiAoaG9va3NBcmVFbXB0eShob29rcykpIHtcbiAgICBjaGlsZEVsLl9fcmVkb21fbGlmZWN5Y2xlID0ge307XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgdmFyIHRyYXZlcnNlID0gcGFyZW50RWw7XG5cbiAgaWYgKGNoaWxkRWwuX19yZWRvbV9tb3VudGVkKSB7XG4gICAgdHJpZ2dlcihjaGlsZEVsLCAnb251bm1vdW50Jyk7XG4gIH1cblxuICB3aGlsZSAodHJhdmVyc2UpIHtcbiAgICB2YXIgcGFyZW50SG9va3MgPSB0cmF2ZXJzZS5fX3JlZG9tX2xpZmVjeWNsZSB8fCB7fTtcblxuICAgIGZvciAodmFyIGhvb2sgaW4gaG9va3MpIHtcbiAgICAgIGlmIChwYXJlbnRIb29rc1tob29rXSkge1xuICAgICAgICBwYXJlbnRIb29rc1tob29rXSAtPSBob29rc1tob29rXTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICBpZiAoaG9va3NBcmVFbXB0eShwYXJlbnRIb29rcykpIHtcbiAgICAgIHRyYXZlcnNlLl9fcmVkb21fbGlmZWN5Y2xlID0gbnVsbDtcbiAgICB9XG5cbiAgICB0cmF2ZXJzZSA9IHRyYXZlcnNlLnBhcmVudE5vZGU7XG4gIH1cbn1cblxuZnVuY3Rpb24gaG9va3NBcmVFbXB0eSAoaG9va3MpIHtcbiAgaWYgKGhvb2tzID09IG51bGwpIHtcbiAgICByZXR1cm4gdHJ1ZTtcbiAgfVxuICBmb3IgKHZhciBrZXkgaW4gaG9va3MpIHtcbiAgICBpZiAoaG9va3Nba2V5XSkge1xuICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cbiAgfVxuICByZXR1cm4gdHJ1ZTtcbn1cblxuLyogZ2xvYmFsIE5vZGUsIFNoYWRvd1Jvb3QgKi9cblxudmFyIGhvb2tOYW1lcyA9IFsnb25tb3VudCcsICdvbnJlbW91bnQnLCAnb251bm1vdW50J107XG52YXIgc2hhZG93Um9vdEF2YWlsYWJsZSA9IHR5cGVvZiB3aW5kb3cgIT09ICd1bmRlZmluZWQnICYmICdTaGFkb3dSb290JyBpbiB3aW5kb3c7XG5cbmZ1bmN0aW9uIG1vdW50IChwYXJlbnQsIGNoaWxkLCBiZWZvcmUsIHJlcGxhY2UpIHtcbiAgdmFyIHBhcmVudEVsID0gZ2V0RWwocGFyZW50KTtcbiAgdmFyIGNoaWxkRWwgPSBnZXRFbChjaGlsZCk7XG5cbiAgaWYgKGNoaWxkID09PSBjaGlsZEVsICYmIGNoaWxkRWwuX19yZWRvbV92aWV3KSB7XG4gICAgLy8gdHJ5IHRvIGxvb2sgdXAgdGhlIHZpZXcgaWYgbm90IHByb3ZpZGVkXG4gICAgY2hpbGQgPSBjaGlsZEVsLl9fcmVkb21fdmlldztcbiAgfVxuXG4gIGlmIChjaGlsZCAhPT0gY2hpbGRFbCkge1xuICAgIGNoaWxkRWwuX19yZWRvbV92aWV3ID0gY2hpbGQ7XG4gIH1cblxuICB2YXIgd2FzTW91bnRlZCA9IGNoaWxkRWwuX19yZWRvbV9tb3VudGVkO1xuICB2YXIgb2xkUGFyZW50ID0gY2hpbGRFbC5wYXJlbnROb2RlO1xuXG4gIGlmICh3YXNNb3VudGVkICYmIChvbGRQYXJlbnQgIT09IHBhcmVudEVsKSkge1xuICAgIGRvVW5tb3VudChjaGlsZCwgY2hpbGRFbCwgb2xkUGFyZW50KTtcbiAgfVxuXG4gIGlmIChiZWZvcmUgIT0gbnVsbCkge1xuICAgIGlmIChyZXBsYWNlKSB7XG4gICAgICBwYXJlbnRFbC5yZXBsYWNlQ2hpbGQoY2hpbGRFbCwgZ2V0RWwoYmVmb3JlKSk7XG4gICAgfSBlbHNlIHtcbiAgICAgIHBhcmVudEVsLmluc2VydEJlZm9yZShjaGlsZEVsLCBnZXRFbChiZWZvcmUpKTtcbiAgICB9XG4gIH0gZWxzZSB7XG4gICAgcGFyZW50RWwuYXBwZW5kQ2hpbGQoY2hpbGRFbCk7XG4gIH1cblxuICBkb01vdW50KGNoaWxkLCBjaGlsZEVsLCBwYXJlbnRFbCwgb2xkUGFyZW50KTtcblxuICByZXR1cm4gY2hpbGQ7XG59XG5cbmZ1bmN0aW9uIHRyaWdnZXIgKGVsLCBldmVudE5hbWUpIHtcbiAgaWYgKGV2ZW50TmFtZSA9PT0gJ29ubW91bnQnIHx8IGV2ZW50TmFtZSA9PT0gJ29ucmVtb3VudCcpIHtcbiAgICBlbC5fX3JlZG9tX21vdW50ZWQgPSB0cnVlO1xuICB9IGVsc2UgaWYgKGV2ZW50TmFtZSA9PT0gJ29udW5tb3VudCcpIHtcbiAgICBlbC5fX3JlZG9tX21vdW50ZWQgPSBmYWxzZTtcbiAgfVxuXG4gIHZhciBob29rcyA9IGVsLl9fcmVkb21fbGlmZWN5Y2xlO1xuXG4gIGlmICghaG9va3MpIHtcbiAgICByZXR1cm47XG4gIH1cblxuICB2YXIgdmlldyA9IGVsLl9fcmVkb21fdmlldztcbiAgdmFyIGhvb2tDb3VudCA9IDA7XG5cbiAgdmlldyAmJiB2aWV3W2V2ZW50TmFtZV0gJiYgdmlld1tldmVudE5hbWVdKCk7XG5cbiAgZm9yICh2YXIgaG9vayBpbiBob29rcykge1xuICAgIGlmIChob29rKSB7XG4gICAgICBob29rQ291bnQrKztcbiAgICB9XG4gIH1cblxuICBpZiAoaG9va0NvdW50KSB7XG4gICAgdmFyIHRyYXZlcnNlID0gZWwuZmlyc3RDaGlsZDtcblxuICAgIHdoaWxlICh0cmF2ZXJzZSkge1xuICAgICAgdmFyIG5leHQgPSB0cmF2ZXJzZS5uZXh0U2libGluZztcblxuICAgICAgdHJpZ2dlcih0cmF2ZXJzZSwgZXZlbnROYW1lKTtcblxuICAgICAgdHJhdmVyc2UgPSBuZXh0O1xuICAgIH1cbiAgfVxufVxuXG5mdW5jdGlvbiBkb01vdW50IChjaGlsZCwgY2hpbGRFbCwgcGFyZW50RWwsIG9sZFBhcmVudCkge1xuICB2YXIgaG9va3MgPSBjaGlsZEVsLl9fcmVkb21fbGlmZWN5Y2xlIHx8IChjaGlsZEVsLl9fcmVkb21fbGlmZWN5Y2xlID0ge30pO1xuICB2YXIgcmVtb3VudCA9IChwYXJlbnRFbCA9PT0gb2xkUGFyZW50KTtcbiAgdmFyIGhvb2tzRm91bmQgPSBmYWxzZTtcblxuICBmb3IgKHZhciBpID0gMCwgbGlzdCA9IGhvb2tOYW1lczsgaSA8IGxpc3QubGVuZ3RoOyBpICs9IDEpIHtcbiAgICB2YXIgaG9va05hbWUgPSBsaXN0W2ldO1xuXG4gICAgaWYgKCFyZW1vdW50KSB7IC8vIGlmIGFscmVhZHkgbW91bnRlZCwgc2tpcCB0aGlzIHBoYXNlXG4gICAgICBpZiAoY2hpbGQgIT09IGNoaWxkRWwpIHsgLy8gb25seSBWaWV3cyBjYW4gaGF2ZSBsaWZlY3ljbGUgZXZlbnRzXG4gICAgICAgIGlmIChob29rTmFtZSBpbiBjaGlsZCkge1xuICAgICAgICAgIGhvb2tzW2hvb2tOYW1lXSA9IChob29rc1tob29rTmFtZV0gfHwgMCkgKyAxO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuICAgIGlmIChob29rc1tob29rTmFtZV0pIHtcbiAgICAgIGhvb2tzRm91bmQgPSB0cnVlO1xuICAgIH1cbiAgfVxuXG4gIGlmICghaG9va3NGb3VuZCkge1xuICAgIGNoaWxkRWwuX19yZWRvbV9saWZlY3ljbGUgPSB7fTtcbiAgICByZXR1cm47XG4gIH1cblxuICB2YXIgdHJhdmVyc2UgPSBwYXJlbnRFbDtcbiAgdmFyIHRyaWdnZXJlZCA9IGZhbHNlO1xuXG4gIGlmIChyZW1vdW50IHx8ICh0cmF2ZXJzZSAmJiB0cmF2ZXJzZS5fX3JlZG9tX21vdW50ZWQpKSB7XG4gICAgdHJpZ2dlcihjaGlsZEVsLCByZW1vdW50ID8gJ29ucmVtb3VudCcgOiAnb25tb3VudCcpO1xuICAgIHRyaWdnZXJlZCA9IHRydWU7XG4gIH1cblxuICB3aGlsZSAodHJhdmVyc2UpIHtcbiAgICB2YXIgcGFyZW50ID0gdHJhdmVyc2UucGFyZW50Tm9kZTtcbiAgICB2YXIgcGFyZW50SG9va3MgPSB0cmF2ZXJzZS5fX3JlZG9tX2xpZmVjeWNsZSB8fCAodHJhdmVyc2UuX19yZWRvbV9saWZlY3ljbGUgPSB7fSk7XG5cbiAgICBmb3IgKHZhciBob29rIGluIGhvb2tzKSB7XG4gICAgICBwYXJlbnRIb29rc1tob29rXSA9IChwYXJlbnRIb29rc1tob29rXSB8fCAwKSArIGhvb2tzW2hvb2tdO1xuICAgIH1cblxuICAgIGlmICh0cmlnZ2VyZWQpIHtcbiAgICAgIGJyZWFrO1xuICAgIH0gZWxzZSB7XG4gICAgICBpZiAodHJhdmVyc2Uubm9kZVR5cGUgPT09IE5vZGUuRE9DVU1FTlRfTk9ERSB8fFxuICAgICAgICAoc2hhZG93Um9vdEF2YWlsYWJsZSAmJiAodHJhdmVyc2UgaW5zdGFuY2VvZiBTaGFkb3dSb290KSkgfHxcbiAgICAgICAgKHBhcmVudCAmJiBwYXJlbnQuX19yZWRvbV9tb3VudGVkKVxuICAgICAgKSB7XG4gICAgICAgIHRyaWdnZXIodHJhdmVyc2UsIHJlbW91bnQgPyAnb25yZW1vdW50JyA6ICdvbm1vdW50Jyk7XG4gICAgICAgIHRyaWdnZXJlZCA9IHRydWU7XG4gICAgICB9XG4gICAgICB0cmF2ZXJzZSA9IHBhcmVudDtcbiAgICB9XG4gIH1cbn1cblxuZnVuY3Rpb24gc2V0U3R5bGUgKHZpZXcsIGFyZzEsIGFyZzIpIHtcbiAgdmFyIGVsID0gZ2V0RWwodmlldyk7XG5cbiAgaWYgKHR5cGVvZiBhcmcxID09PSAnb2JqZWN0Jykge1xuICAgIGZvciAodmFyIGtleSBpbiBhcmcxKSB7XG4gICAgICBzZXRTdHlsZVZhbHVlKGVsLCBrZXksIGFyZzFba2V5XSk7XG4gICAgfVxuICB9IGVsc2Uge1xuICAgIHNldFN0eWxlVmFsdWUoZWwsIGFyZzEsIGFyZzIpO1xuICB9XG59XG5cbmZ1bmN0aW9uIHNldFN0eWxlVmFsdWUgKGVsLCBrZXksIHZhbHVlKSB7XG4gIGlmICh2YWx1ZSA9PSBudWxsKSB7XG4gICAgZWwuc3R5bGVba2V5XSA9ICcnO1xuICB9IGVsc2Uge1xuICAgIGVsLnN0eWxlW2tleV0gPSB2YWx1ZTtcbiAgfVxufVxuXG4vKiBnbG9iYWwgU1ZHRWxlbWVudCAqL1xuXG52YXIgeGxpbmtucyA9ICdodHRwOi8vd3d3LnczLm9yZy8xOTk5L3hsaW5rJztcblxuZnVuY3Rpb24gc2V0QXR0ciAodmlldywgYXJnMSwgYXJnMikge1xuICBzZXRBdHRySW50ZXJuYWwodmlldywgYXJnMSwgYXJnMik7XG59XG5cbmZ1bmN0aW9uIHNldEF0dHJJbnRlcm5hbCAodmlldywgYXJnMSwgYXJnMiwgaW5pdGlhbCkge1xuICB2YXIgZWwgPSBnZXRFbCh2aWV3KTtcblxuICB2YXIgaXNPYmogPSB0eXBlb2YgYXJnMSA9PT0gJ29iamVjdCc7XG5cbiAgaWYgKGlzT2JqKSB7XG4gICAgZm9yICh2YXIga2V5IGluIGFyZzEpIHtcbiAgICAgIHNldEF0dHJJbnRlcm5hbChlbCwga2V5LCBhcmcxW2tleV0sIGluaXRpYWwpO1xuICAgIH1cbiAgfSBlbHNlIHtcbiAgICB2YXIgaXNTVkcgPSBlbCBpbnN0YW5jZW9mIFNWR0VsZW1lbnQ7XG4gICAgdmFyIGlzRnVuYyA9IHR5cGVvZiBhcmcyID09PSAnZnVuY3Rpb24nO1xuXG4gICAgaWYgKGFyZzEgPT09ICdzdHlsZScgJiYgdHlwZW9mIGFyZzIgPT09ICdvYmplY3QnKSB7XG4gICAgICBzZXRTdHlsZShlbCwgYXJnMik7XG4gICAgfSBlbHNlIGlmIChpc1NWRyAmJiBpc0Z1bmMpIHtcbiAgICAgIGVsW2FyZzFdID0gYXJnMjtcbiAgICB9IGVsc2UgaWYgKGFyZzEgPT09ICdkYXRhc2V0Jykge1xuICAgICAgc2V0RGF0YShlbCwgYXJnMik7XG4gICAgfSBlbHNlIGlmICghaXNTVkcgJiYgKGFyZzEgaW4gZWwgfHwgaXNGdW5jKSAmJiAoYXJnMSAhPT0gJ2xpc3QnKSkge1xuICAgICAgZWxbYXJnMV0gPSBhcmcyO1xuICAgIH0gZWxzZSB7XG4gICAgICBpZiAoaXNTVkcgJiYgKGFyZzEgPT09ICd4bGluaycpKSB7XG4gICAgICAgIHNldFhsaW5rKGVsLCBhcmcyKTtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuICAgICAgaWYgKGluaXRpYWwgJiYgYXJnMSA9PT0gJ2NsYXNzJykge1xuICAgICAgICBhcmcyID0gZWwuY2xhc3NOYW1lICsgJyAnICsgYXJnMjtcbiAgICAgIH1cbiAgICAgIGlmIChhcmcyID09IG51bGwpIHtcbiAgICAgICAgZWwucmVtb3ZlQXR0cmlidXRlKGFyZzEpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgZWwuc2V0QXR0cmlidXRlKGFyZzEsIGFyZzIpO1xuICAgICAgfVxuICAgIH1cbiAgfVxufVxuXG5mdW5jdGlvbiBzZXRYbGluayAoZWwsIGFyZzEsIGFyZzIpIHtcbiAgaWYgKHR5cGVvZiBhcmcxID09PSAnb2JqZWN0Jykge1xuICAgIGZvciAodmFyIGtleSBpbiBhcmcxKSB7XG4gICAgICBzZXRYbGluayhlbCwga2V5LCBhcmcxW2tleV0pO1xuICAgIH1cbiAgfSBlbHNlIHtcbiAgICBpZiAoYXJnMiAhPSBudWxsKSB7XG4gICAgICBlbC5zZXRBdHRyaWJ1dGVOUyh4bGlua25zLCBhcmcxLCBhcmcyKTtcbiAgICB9IGVsc2Uge1xuICAgICAgZWwucmVtb3ZlQXR0cmlidXRlTlMoeGxpbmtucywgYXJnMSwgYXJnMik7XG4gICAgfVxuICB9XG59XG5cbmZ1bmN0aW9uIHNldERhdGEgKGVsLCBhcmcxLCBhcmcyKSB7XG4gIGlmICh0eXBlb2YgYXJnMSA9PT0gJ29iamVjdCcpIHtcbiAgICBmb3IgKHZhciBrZXkgaW4gYXJnMSkge1xuICAgICAgc2V0RGF0YShlbCwga2V5LCBhcmcxW2tleV0pO1xuICAgIH1cbiAgfSBlbHNlIHtcbiAgICBpZiAoYXJnMiAhPSBudWxsKSB7XG4gICAgICBlbC5kYXRhc2V0W2FyZzFdID0gYXJnMjtcbiAgICB9IGVsc2Uge1xuICAgICAgZGVsZXRlIGVsLmRhdGFzZXRbYXJnMV07XG4gICAgfVxuICB9XG59XG5cbmZ1bmN0aW9uIHRleHQgKHN0cikge1xuICByZXR1cm4gZG9jdW1lbnQuY3JlYXRlVGV4dE5vZGUoKHN0ciAhPSBudWxsKSA/IHN0ciA6ICcnKTtcbn1cblxuZnVuY3Rpb24gcGFyc2VBcmd1bWVudHNJbnRlcm5hbCAoZWxlbWVudCwgYXJncywgaW5pdGlhbCkge1xuICBmb3IgKHZhciBpID0gMCwgbGlzdCA9IGFyZ3M7IGkgPCBsaXN0Lmxlbmd0aDsgaSArPSAxKSB7XG4gICAgdmFyIGFyZyA9IGxpc3RbaV07XG5cbiAgICBpZiAoYXJnICE9PSAwICYmICFhcmcpIHtcbiAgICAgIGNvbnRpbnVlO1xuICAgIH1cblxuICAgIHZhciB0eXBlID0gdHlwZW9mIGFyZztcblxuICAgIGlmICh0eXBlID09PSAnZnVuY3Rpb24nKSB7XG4gICAgICBhcmcoZWxlbWVudCk7XG4gICAgfSBlbHNlIGlmICh0eXBlID09PSAnc3RyaW5nJyB8fCB0eXBlID09PSAnbnVtYmVyJykge1xuICAgICAgZWxlbWVudC5hcHBlbmRDaGlsZCh0ZXh0KGFyZykpO1xuICAgIH0gZWxzZSBpZiAoaXNOb2RlKGdldEVsKGFyZykpKSB7XG4gICAgICBtb3VudChlbGVtZW50LCBhcmcpO1xuICAgIH0gZWxzZSBpZiAoYXJnLmxlbmd0aCkge1xuICAgICAgcGFyc2VBcmd1bWVudHNJbnRlcm5hbChlbGVtZW50LCBhcmcsIGluaXRpYWwpO1xuICAgIH0gZWxzZSBpZiAodHlwZSA9PT0gJ29iamVjdCcpIHtcbiAgICAgIHNldEF0dHJJbnRlcm5hbChlbGVtZW50LCBhcmcsIG51bGwsIGluaXRpYWwpO1xuICAgIH1cbiAgfVxufVxuXG5mdW5jdGlvbiBlbnN1cmVFbCAocGFyZW50KSB7XG4gIHJldHVybiB0eXBlb2YgcGFyZW50ID09PSAnc3RyaW5nJyA/IGh0bWwocGFyZW50KSA6IGdldEVsKHBhcmVudCk7XG59XG5cbmZ1bmN0aW9uIGdldEVsIChwYXJlbnQpIHtcbiAgcmV0dXJuIChwYXJlbnQubm9kZVR5cGUgJiYgcGFyZW50KSB8fCAoIXBhcmVudC5lbCAmJiBwYXJlbnQpIHx8IGdldEVsKHBhcmVudC5lbCk7XG59XG5cbmZ1bmN0aW9uIGlzTm9kZSAoYXJnKSB7XG4gIHJldHVybiBhcmcgJiYgYXJnLm5vZGVUeXBlO1xufVxuXG52YXIgaHRtbENhY2hlID0ge307XG5cbmZ1bmN0aW9uIGh0bWwgKHF1ZXJ5KSB7XG4gIHZhciBhcmdzID0gW10sIGxlbiA9IGFyZ3VtZW50cy5sZW5ndGggLSAxO1xuICB3aGlsZSAoIGxlbi0tID4gMCApIGFyZ3NbIGxlbiBdID0gYXJndW1lbnRzWyBsZW4gKyAxIF07XG5cbiAgdmFyIGVsZW1lbnQ7XG5cbiAgdmFyIHR5cGUgPSB0eXBlb2YgcXVlcnk7XG5cbiAgaWYgKHR5cGUgPT09ICdzdHJpbmcnKSB7XG4gICAgZWxlbWVudCA9IG1lbW9pemVIVE1MKHF1ZXJ5KS5jbG9uZU5vZGUoZmFsc2UpO1xuICB9IGVsc2UgaWYgKGlzTm9kZShxdWVyeSkpIHtcbiAgICBlbGVtZW50ID0gcXVlcnkuY2xvbmVOb2RlKGZhbHNlKTtcbiAgfSBlbHNlIGlmICh0eXBlID09PSAnZnVuY3Rpb24nKSB7XG4gICAgdmFyIFF1ZXJ5ID0gcXVlcnk7XG4gICAgZWxlbWVudCA9IG5ldyAoRnVuY3Rpb24ucHJvdG90eXBlLmJpbmQuYXBwbHkoIFF1ZXJ5LCBbIG51bGwgXS5jb25jYXQoIGFyZ3MpICkpO1xuICB9IGVsc2Uge1xuICAgIHRocm93IG5ldyBFcnJvcignQXQgbGVhc3Qgb25lIGFyZ3VtZW50IHJlcXVpcmVkJyk7XG4gIH1cblxuICBwYXJzZUFyZ3VtZW50c0ludGVybmFsKGdldEVsKGVsZW1lbnQpLCBhcmdzLCB0cnVlKTtcblxuICByZXR1cm4gZWxlbWVudDtcbn1cblxudmFyIGVsID0gaHRtbDtcbnZhciBoID0gaHRtbDtcblxuaHRtbC5leHRlbmQgPSBmdW5jdGlvbiBleHRlbmRIdG1sIChxdWVyeSkge1xuICB2YXIgYXJncyA9IFtdLCBsZW4gPSBhcmd1bWVudHMubGVuZ3RoIC0gMTtcbiAgd2hpbGUgKCBsZW4tLSA+IDAgKSBhcmdzWyBsZW4gXSA9IGFyZ3VtZW50c1sgbGVuICsgMSBdO1xuXG4gIHZhciBjbG9uZSA9IG1lbW9pemVIVE1MKHF1ZXJ5KTtcblxuICByZXR1cm4gaHRtbC5iaW5kLmFwcGx5KGh0bWwsIFsgdGhpcywgY2xvbmUgXS5jb25jYXQoIGFyZ3MgKSk7XG59O1xuXG5mdW5jdGlvbiBtZW1vaXplSFRNTCAocXVlcnkpIHtcbiAgcmV0dXJuIGh0bWxDYWNoZVtxdWVyeV0gfHwgKGh0bWxDYWNoZVtxdWVyeV0gPSBjcmVhdGVFbGVtZW50KHF1ZXJ5KSk7XG59XG5cbmZ1bmN0aW9uIHNldENoaWxkcmVuIChwYXJlbnQpIHtcbiAgdmFyIGNoaWxkcmVuID0gW10sIGxlbiA9IGFyZ3VtZW50cy5sZW5ndGggLSAxO1xuICB3aGlsZSAoIGxlbi0tID4gMCApIGNoaWxkcmVuWyBsZW4gXSA9IGFyZ3VtZW50c1sgbGVuICsgMSBdO1xuXG4gIHZhciBwYXJlbnRFbCA9IGdldEVsKHBhcmVudCk7XG4gIHZhciBjdXJyZW50ID0gdHJhdmVyc2UocGFyZW50LCBjaGlsZHJlbiwgcGFyZW50RWwuZmlyc3RDaGlsZCk7XG5cbiAgd2hpbGUgKGN1cnJlbnQpIHtcbiAgICB2YXIgbmV4dCA9IGN1cnJlbnQubmV4dFNpYmxpbmc7XG5cbiAgICB1bm1vdW50KHBhcmVudCwgY3VycmVudCk7XG5cbiAgICBjdXJyZW50ID0gbmV4dDtcbiAgfVxufVxuXG5mdW5jdGlvbiB0cmF2ZXJzZSAocGFyZW50LCBjaGlsZHJlbiwgX2N1cnJlbnQpIHtcbiAgdmFyIGN1cnJlbnQgPSBfY3VycmVudDtcblxuICB2YXIgY2hpbGRFbHMgPSBuZXcgQXJyYXkoY2hpbGRyZW4ubGVuZ3RoKTtcblxuICBmb3IgKHZhciBpID0gMDsgaSA8IGNoaWxkcmVuLmxlbmd0aDsgaSsrKSB7XG4gICAgY2hpbGRFbHNbaV0gPSBjaGlsZHJlbltpXSAmJiBnZXRFbChjaGlsZHJlbltpXSk7XG4gIH1cblxuICBmb3IgKHZhciBpJDEgPSAwOyBpJDEgPCBjaGlsZHJlbi5sZW5ndGg7IGkkMSsrKSB7XG4gICAgdmFyIGNoaWxkID0gY2hpbGRyZW5baSQxXTtcblxuICAgIGlmICghY2hpbGQpIHtcbiAgICAgIGNvbnRpbnVlO1xuICAgIH1cblxuICAgIHZhciBjaGlsZEVsID0gY2hpbGRFbHNbaSQxXTtcblxuICAgIGlmIChjaGlsZEVsID09PSBjdXJyZW50KSB7XG4gICAgICBjdXJyZW50ID0gY3VycmVudC5uZXh0U2libGluZztcbiAgICAgIGNvbnRpbnVlO1xuICAgIH1cblxuICAgIGlmIChpc05vZGUoY2hpbGRFbCkpIHtcbiAgICAgIHZhciBuZXh0ID0gY3VycmVudCAmJiBjdXJyZW50Lm5leHRTaWJsaW5nO1xuICAgICAgdmFyIGV4aXN0cyA9IGNoaWxkLl9fcmVkb21faW5kZXggIT0gbnVsbDtcbiAgICAgIHZhciByZXBsYWNlID0gZXhpc3RzICYmIG5leHQgPT09IGNoaWxkRWxzW2kkMSArIDFdO1xuXG4gICAgICBtb3VudChwYXJlbnQsIGNoaWxkLCBjdXJyZW50LCByZXBsYWNlKTtcblxuICAgICAgaWYgKHJlcGxhY2UpIHtcbiAgICAgICAgY3VycmVudCA9IG5leHQ7XG4gICAgICB9XG5cbiAgICAgIGNvbnRpbnVlO1xuICAgIH1cblxuICAgIGlmIChjaGlsZC5sZW5ndGggIT0gbnVsbCkge1xuICAgICAgY3VycmVudCA9IHRyYXZlcnNlKHBhcmVudCwgY2hpbGQsIGN1cnJlbnQpO1xuICAgIH1cbiAgfVxuXG4gIHJldHVybiBjdXJyZW50O1xufVxuXG5mdW5jdGlvbiBsaXN0UG9vbCAoVmlldywga2V5LCBpbml0RGF0YSkge1xuICByZXR1cm4gbmV3IExpc3RQb29sKFZpZXcsIGtleSwgaW5pdERhdGEpO1xufVxuXG52YXIgTGlzdFBvb2wgPSBmdW5jdGlvbiBMaXN0UG9vbCAoVmlldywga2V5LCBpbml0RGF0YSkge1xuICB0aGlzLlZpZXcgPSBWaWV3O1xuICB0aGlzLmluaXREYXRhID0gaW5pdERhdGE7XG4gIHRoaXMub2xkTG9va3VwID0ge307XG4gIHRoaXMubG9va3VwID0ge307XG4gIHRoaXMub2xkVmlld3MgPSBbXTtcbiAgdGhpcy52aWV3cyA9IFtdO1xuXG4gIGlmIChrZXkgIT0gbnVsbCkge1xuICAgIHRoaXMua2V5ID0gdHlwZW9mIGtleSA9PT0gJ2Z1bmN0aW9uJyA/IGtleSA6IHByb3BLZXkoa2V5KTtcbiAgfVxufTtcblxuTGlzdFBvb2wucHJvdG90eXBlLnVwZGF0ZSA9IGZ1bmN0aW9uIHVwZGF0ZSAoZGF0YSwgY29udGV4dCkge1xuICB2YXIgcmVmID0gdGhpcztcbiAgICB2YXIgVmlldyA9IHJlZi5WaWV3O1xuICAgIHZhciBrZXkgPSByZWYua2V5O1xuICAgIHZhciBpbml0RGF0YSA9IHJlZi5pbml0RGF0YTtcbiAgdmFyIGtleVNldCA9IGtleSAhPSBudWxsO1xuXG4gIHZhciBvbGRMb29rdXAgPSB0aGlzLmxvb2t1cDtcbiAgdmFyIG5ld0xvb2t1cCA9IHt9O1xuXG4gIHZhciBuZXdWaWV3cyA9IG5ldyBBcnJheShkYXRhLmxlbmd0aCk7XG4gIHZhciBvbGRWaWV3cyA9IHRoaXMudmlld3M7XG5cbiAgZm9yICh2YXIgaSA9IDA7IGkgPCBkYXRhLmxlbmd0aDsgaSsrKSB7XG4gICAgdmFyIGl0ZW0gPSBkYXRhW2ldO1xuICAgIHZhciB2aWV3ID0gKHZvaWQgMCk7XG5cbiAgICBpZiAoa2V5U2V0KSB7XG4gICAgICB2YXIgaWQgPSBrZXkoaXRlbSk7XG5cbiAgICAgIHZpZXcgPSBvbGRMb29rdXBbaWRdIHx8IG5ldyBWaWV3KGluaXREYXRhLCBpdGVtLCBpLCBkYXRhKTtcbiAgICAgIG5ld0xvb2t1cFtpZF0gPSB2aWV3O1xuICAgICAgdmlldy5fX3JlZG9tX2lkID0gaWQ7XG4gICAgfSBlbHNlIHtcbiAgICAgIHZpZXcgPSBvbGRWaWV3c1tpXSB8fCBuZXcgVmlldyhpbml0RGF0YSwgaXRlbSwgaSwgZGF0YSk7XG4gICAgfVxuICAgIHZpZXcudXBkYXRlICYmIHZpZXcudXBkYXRlKGl0ZW0sIGksIGRhdGEsIGNvbnRleHQpO1xuXG4gICAgdmFyIGVsID0gZ2V0RWwodmlldy5lbCk7XG5cbiAgICBlbC5fX3JlZG9tX3ZpZXcgPSB2aWV3O1xuICAgIG5ld1ZpZXdzW2ldID0gdmlldztcbiAgfVxuXG4gIHRoaXMub2xkVmlld3MgPSBvbGRWaWV3cztcbiAgdGhpcy52aWV3cyA9IG5ld1ZpZXdzO1xuXG4gIHRoaXMub2xkTG9va3VwID0gb2xkTG9va3VwO1xuICB0aGlzLmxvb2t1cCA9IG5ld0xvb2t1cDtcbn07XG5cbmZ1bmN0aW9uIHByb3BLZXkgKGtleSkge1xuICByZXR1cm4gZnVuY3Rpb24gKGl0ZW0pIHtcbiAgICByZXR1cm4gaXRlbVtrZXldO1xuICB9O1xufVxuXG5mdW5jdGlvbiBsaXN0IChwYXJlbnQsIFZpZXcsIGtleSwgaW5pdERhdGEpIHtcbiAgcmV0dXJuIG5ldyBMaXN0KHBhcmVudCwgVmlldywga2V5LCBpbml0RGF0YSk7XG59XG5cbnZhciBMaXN0ID0gZnVuY3Rpb24gTGlzdCAocGFyZW50LCBWaWV3LCBrZXksIGluaXREYXRhKSB7XG4gIHRoaXMuVmlldyA9IFZpZXc7XG4gIHRoaXMuaW5pdERhdGEgPSBpbml0RGF0YTtcbiAgdGhpcy52aWV3cyA9IFtdO1xuICB0aGlzLnBvb2wgPSBuZXcgTGlzdFBvb2woVmlldywga2V5LCBpbml0RGF0YSk7XG4gIHRoaXMuZWwgPSBlbnN1cmVFbChwYXJlbnQpO1xuICB0aGlzLmtleVNldCA9IGtleSAhPSBudWxsO1xufTtcblxuTGlzdC5wcm90b3R5cGUudXBkYXRlID0gZnVuY3Rpb24gdXBkYXRlIChkYXRhLCBjb250ZXh0KSB7XG4gICAgaWYgKCBkYXRhID09PSB2b2lkIDAgKSBkYXRhID0gW107XG5cbiAgdmFyIHJlZiA9IHRoaXM7XG4gICAgdmFyIGtleVNldCA9IHJlZi5rZXlTZXQ7XG4gIHZhciBvbGRWaWV3cyA9IHRoaXMudmlld3M7XG5cbiAgdGhpcy5wb29sLnVwZGF0ZShkYXRhLCBjb250ZXh0KTtcblxuICB2YXIgcmVmJDEgPSB0aGlzLnBvb2w7XG4gICAgdmFyIHZpZXdzID0gcmVmJDEudmlld3M7XG4gICAgdmFyIGxvb2t1cCA9IHJlZiQxLmxvb2t1cDtcblxuICBpZiAoa2V5U2V0KSB7XG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBvbGRWaWV3cy5sZW5ndGg7IGkrKykge1xuICAgICAgdmFyIG9sZFZpZXcgPSBvbGRWaWV3c1tpXTtcbiAgICAgIHZhciBpZCA9IG9sZFZpZXcuX19yZWRvbV9pZDtcblxuICAgICAgaWYgKGxvb2t1cFtpZF0gPT0gbnVsbCkge1xuICAgICAgICBvbGRWaWV3Ll9fcmVkb21faW5kZXggPSBudWxsO1xuICAgICAgICB1bm1vdW50KHRoaXMsIG9sZFZpZXcpO1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIGZvciAodmFyIGkkMSA9IDA7IGkkMSA8IHZpZXdzLmxlbmd0aDsgaSQxKyspIHtcbiAgICB2YXIgdmlldyA9IHZpZXdzW2kkMV07XG5cbiAgICB2aWV3Ll9fcmVkb21faW5kZXggPSBpJDE7XG4gIH1cblxuICBzZXRDaGlsZHJlbih0aGlzLCB2aWV3cyk7XG5cbiAgaWYgKGtleVNldCkge1xuICAgIHRoaXMubG9va3VwID0gbG9va3VwO1xuICB9XG4gIHRoaXMudmlld3MgPSB2aWV3cztcbn07XG5cbkxpc3QuZXh0ZW5kID0gZnVuY3Rpb24gZXh0ZW5kTGlzdCAocGFyZW50LCBWaWV3LCBrZXksIGluaXREYXRhKSB7XG4gIHJldHVybiBMaXN0LmJpbmQoTGlzdCwgcGFyZW50LCBWaWV3LCBrZXksIGluaXREYXRhKTtcbn07XG5cbmxpc3QuZXh0ZW5kID0gTGlzdC5leHRlbmQ7XG5cbi8qIGdsb2JhbCBOb2RlICovXG5cbmZ1bmN0aW9uIHBsYWNlIChWaWV3LCBpbml0RGF0YSkge1xuICByZXR1cm4gbmV3IFBsYWNlKFZpZXcsIGluaXREYXRhKTtcbn1cblxudmFyIFBsYWNlID0gZnVuY3Rpb24gUGxhY2UgKFZpZXcsIGluaXREYXRhKSB7XG4gIHRoaXMuZWwgPSB0ZXh0KCcnKTtcbiAgdGhpcy52aXNpYmxlID0gZmFsc2U7XG4gIHRoaXMudmlldyA9IG51bGw7XG4gIHRoaXMuX3BsYWNlaG9sZGVyID0gdGhpcy5lbDtcblxuICBpZiAoVmlldyBpbnN0YW5jZW9mIE5vZGUpIHtcbiAgICB0aGlzLl9lbCA9IFZpZXc7XG4gIH0gZWxzZSBpZiAoVmlldy5lbCBpbnN0YW5jZW9mIE5vZGUpIHtcbiAgICB0aGlzLl9lbCA9IFZpZXc7XG4gICAgdGhpcy52aWV3ID0gVmlldztcbiAgfSBlbHNlIHtcbiAgICB0aGlzLl9WaWV3ID0gVmlldztcbiAgfVxuXG4gIHRoaXMuX2luaXREYXRhID0gaW5pdERhdGE7XG59O1xuXG5QbGFjZS5wcm90b3R5cGUudXBkYXRlID0gZnVuY3Rpb24gdXBkYXRlICh2aXNpYmxlLCBkYXRhKSB7XG4gIHZhciBwbGFjZWhvbGRlciA9IHRoaXMuX3BsYWNlaG9sZGVyO1xuICB2YXIgcGFyZW50Tm9kZSA9IHRoaXMuZWwucGFyZW50Tm9kZTtcblxuICBpZiAodmlzaWJsZSkge1xuICAgIGlmICghdGhpcy52aXNpYmxlKSB7XG4gICAgICBpZiAodGhpcy5fZWwpIHtcbiAgICAgICAgbW91bnQocGFyZW50Tm9kZSwgdGhpcy5fZWwsIHBsYWNlaG9sZGVyKTtcbiAgICAgICAgdW5tb3VudChwYXJlbnROb2RlLCBwbGFjZWhvbGRlcik7XG5cbiAgICAgICAgdGhpcy5lbCA9IGdldEVsKHRoaXMuX2VsKTtcbiAgICAgICAgdGhpcy52aXNpYmxlID0gdmlzaWJsZTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHZhciBWaWV3ID0gdGhpcy5fVmlldztcbiAgICAgICAgdmFyIHZpZXcgPSBuZXcgVmlldyh0aGlzLl9pbml0RGF0YSk7XG5cbiAgICAgICAgdGhpcy5lbCA9IGdldEVsKHZpZXcpO1xuICAgICAgICB0aGlzLnZpZXcgPSB2aWV3O1xuXG4gICAgICAgIG1vdW50KHBhcmVudE5vZGUsIHZpZXcsIHBsYWNlaG9sZGVyKTtcbiAgICAgICAgdW5tb3VudChwYXJlbnROb2RlLCBwbGFjZWhvbGRlcik7XG4gICAgICB9XG4gICAgfVxuICAgIHRoaXMudmlldyAmJiB0aGlzLnZpZXcudXBkYXRlICYmIHRoaXMudmlldy51cGRhdGUoZGF0YSk7XG4gIH0gZWxzZSB7XG4gICAgaWYgKHRoaXMudmlzaWJsZSkge1xuICAgICAgaWYgKHRoaXMuX2VsKSB7XG4gICAgICAgIG1vdW50KHBhcmVudE5vZGUsIHBsYWNlaG9sZGVyLCB0aGlzLl9lbCk7XG4gICAgICAgIHVubW91bnQocGFyZW50Tm9kZSwgdGhpcy5fZWwpO1xuXG4gICAgICAgIHRoaXMuZWwgPSBwbGFjZWhvbGRlcjtcbiAgICAgICAgdGhpcy52aXNpYmxlID0gdmlzaWJsZTtcblxuICAgICAgICByZXR1cm47XG4gICAgICB9XG4gICAgICBtb3VudChwYXJlbnROb2RlLCBwbGFjZWhvbGRlciwgdGhpcy52aWV3KTtcbiAgICAgIHVubW91bnQocGFyZW50Tm9kZSwgdGhpcy52aWV3KTtcblxuICAgICAgdGhpcy5lbCA9IHBsYWNlaG9sZGVyO1xuICAgICAgdGhpcy52aWV3ID0gbnVsbDtcbiAgICB9XG4gIH1cbiAgdGhpcy52aXNpYmxlID0gdmlzaWJsZTtcbn07XG5cbi8qIGdsb2JhbCBOb2RlICovXG5cbmZ1bmN0aW9uIHJvdXRlciAocGFyZW50LCBWaWV3cywgaW5pdERhdGEpIHtcbiAgcmV0dXJuIG5ldyBSb3V0ZXIocGFyZW50LCBWaWV3cywgaW5pdERhdGEpO1xufVxuXG52YXIgUm91dGVyID0gZnVuY3Rpb24gUm91dGVyIChwYXJlbnQsIFZpZXdzLCBpbml0RGF0YSkge1xuICB0aGlzLmVsID0gZW5zdXJlRWwocGFyZW50KTtcbiAgdGhpcy5WaWV3cyA9IFZpZXdzO1xuICB0aGlzLmluaXREYXRhID0gaW5pdERhdGE7XG59O1xuXG5Sb3V0ZXIucHJvdG90eXBlLnVwZGF0ZSA9IGZ1bmN0aW9uIHVwZGF0ZSAocm91dGUsIGRhdGEpIHtcbiAgaWYgKHJvdXRlICE9PSB0aGlzLnJvdXRlKSB7XG4gICAgdmFyIFZpZXdzID0gdGhpcy5WaWV3cztcbiAgICB2YXIgVmlldyA9IFZpZXdzW3JvdXRlXTtcblxuICAgIHRoaXMucm91dGUgPSByb3V0ZTtcblxuICAgIGlmIChWaWV3ICYmIChWaWV3IGluc3RhbmNlb2YgTm9kZSB8fCBWaWV3LmVsIGluc3RhbmNlb2YgTm9kZSkpIHtcbiAgICAgIHRoaXMudmlldyA9IFZpZXc7XG4gICAgfSBlbHNlIHtcbiAgICAgIHRoaXMudmlldyA9IFZpZXcgJiYgbmV3IFZpZXcodGhpcy5pbml0RGF0YSwgZGF0YSk7XG4gICAgfVxuXG4gICAgc2V0Q2hpbGRyZW4odGhpcy5lbCwgW3RoaXMudmlld10pO1xuICB9XG4gIHRoaXMudmlldyAmJiB0aGlzLnZpZXcudXBkYXRlICYmIHRoaXMudmlldy51cGRhdGUoZGF0YSwgcm91dGUpO1xufTtcblxudmFyIG5zID0gJ2h0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnJztcblxudmFyIHN2Z0NhY2hlID0ge307XG5cbmZ1bmN0aW9uIHN2ZyAocXVlcnkpIHtcbiAgdmFyIGFyZ3MgPSBbXSwgbGVuID0gYXJndW1lbnRzLmxlbmd0aCAtIDE7XG4gIHdoaWxlICggbGVuLS0gPiAwICkgYXJnc1sgbGVuIF0gPSBhcmd1bWVudHNbIGxlbiArIDEgXTtcblxuICB2YXIgZWxlbWVudDtcblxuICB2YXIgdHlwZSA9IHR5cGVvZiBxdWVyeTtcblxuICBpZiAodHlwZSA9PT0gJ3N0cmluZycpIHtcbiAgICBlbGVtZW50ID0gbWVtb2l6ZVNWRyhxdWVyeSkuY2xvbmVOb2RlKGZhbHNlKTtcbiAgfSBlbHNlIGlmIChpc05vZGUocXVlcnkpKSB7XG4gICAgZWxlbWVudCA9IHF1ZXJ5LmNsb25lTm9kZShmYWxzZSk7XG4gIH0gZWxzZSBpZiAodHlwZSA9PT0gJ2Z1bmN0aW9uJykge1xuICAgIHZhciBRdWVyeSA9IHF1ZXJ5O1xuICAgIGVsZW1lbnQgPSBuZXcgKEZ1bmN0aW9uLnByb3RvdHlwZS5iaW5kLmFwcGx5KCBRdWVyeSwgWyBudWxsIF0uY29uY2F0KCBhcmdzKSApKTtcbiAgfSBlbHNlIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ0F0IGxlYXN0IG9uZSBhcmd1bWVudCByZXF1aXJlZCcpO1xuICB9XG5cbiAgcGFyc2VBcmd1bWVudHNJbnRlcm5hbChnZXRFbChlbGVtZW50KSwgYXJncywgdHJ1ZSk7XG5cbiAgcmV0dXJuIGVsZW1lbnQ7XG59XG5cbnZhciBzID0gc3ZnO1xuXG5zdmcuZXh0ZW5kID0gZnVuY3Rpb24gZXh0ZW5kU3ZnIChxdWVyeSkge1xuICB2YXIgY2xvbmUgPSBtZW1vaXplU1ZHKHF1ZXJ5KTtcblxuICByZXR1cm4gc3ZnLmJpbmQodGhpcywgY2xvbmUpO1xufTtcblxuc3ZnLm5zID0gbnM7XG5cbmZ1bmN0aW9uIG1lbW9pemVTVkcgKHF1ZXJ5KSB7XG4gIHJldHVybiBzdmdDYWNoZVtxdWVyeV0gfHwgKHN2Z0NhY2hlW3F1ZXJ5XSA9IGNyZWF0ZUVsZW1lbnQocXVlcnksIG5zKSk7XG59XG5cbmV4cG9ydCB7IExpc3QsIExpc3RQb29sLCBQbGFjZSwgUm91dGVyLCBlbCwgaCwgaHRtbCwgbGlzdCwgbGlzdFBvb2wsIG1vdW50LCBwbGFjZSwgcm91dGVyLCBzLCBzZXRBdHRyLCBzZXRDaGlsZHJlbiwgc2V0RGF0YSwgc2V0U3R5bGUsIHNldFhsaW5rLCBzdmcsIHRleHQsIHVubW91bnQgfTtcbiIsImV4cG9ydCBmdW5jdGlvbiBhcm91bmQob2JqLCBmYWN0b3JpZXMpIHtcbiAgICBjb25zdCByZW1vdmVycyA9IE9iamVjdC5rZXlzKGZhY3RvcmllcykubWFwKGtleSA9PiBhcm91bmQxKG9iaiwga2V5LCBmYWN0b3JpZXNba2V5XSkpO1xuICAgIHJldHVybiByZW1vdmVycy5sZW5ndGggPT09IDEgPyByZW1vdmVyc1swXSA6IGZ1bmN0aW9uICgpIHsgcmVtb3ZlcnMuZm9yRWFjaChyID0+IHIoKSk7IH07XG59XG5mdW5jdGlvbiBhcm91bmQxKG9iaiwgbWV0aG9kLCBjcmVhdGVXcmFwcGVyKSB7XG4gICAgY29uc3Qgb3JpZ2luYWwgPSBvYmpbbWV0aG9kXSwgaGFkT3duID0gb2JqLmhhc093blByb3BlcnR5KG1ldGhvZCk7XG4gICAgbGV0IGN1cnJlbnQgPSBjcmVhdGVXcmFwcGVyKG9yaWdpbmFsKTtcbiAgICAvLyBMZXQgb3VyIHdyYXBwZXIgaW5oZXJpdCBzdGF0aWMgcHJvcHMgZnJvbSB0aGUgd3JhcHBpbmcgbWV0aG9kLFxuICAgIC8vIGFuZCB0aGUgd3JhcHBpbmcgbWV0aG9kLCBwcm9wcyBmcm9tIHRoZSBvcmlnaW5hbCBtZXRob2RcbiAgICBpZiAob3JpZ2luYWwpXG4gICAgICAgIE9iamVjdC5zZXRQcm90b3R5cGVPZihjdXJyZW50LCBvcmlnaW5hbCk7XG4gICAgT2JqZWN0LnNldFByb3RvdHlwZU9mKHdyYXBwZXIsIGN1cnJlbnQpO1xuICAgIG9ialttZXRob2RdID0gd3JhcHBlcjtcbiAgICAvLyBSZXR1cm4gYSBjYWxsYmFjayB0byBhbGxvdyBzYWZlIHJlbW92YWxcbiAgICByZXR1cm4gcmVtb3ZlO1xuICAgIGZ1bmN0aW9uIHdyYXBwZXIoLi4uYXJncykge1xuICAgICAgICAvLyBJZiB3ZSBoYXZlIGJlZW4gZGVhY3RpdmF0ZWQgYW5kIGFyZSBubyBsb25nZXIgd3JhcHBlZCwgcmVtb3ZlIG91cnNlbHZlc1xuICAgICAgICBpZiAoY3VycmVudCA9PT0gb3JpZ2luYWwgJiYgb2JqW21ldGhvZF0gPT09IHdyYXBwZXIpXG4gICAgICAgICAgICByZW1vdmUoKTtcbiAgICAgICAgcmV0dXJuIGN1cnJlbnQuYXBwbHkodGhpcywgYXJncyk7XG4gICAgfVxuICAgIGZ1bmN0aW9uIHJlbW92ZSgpIHtcbiAgICAgICAgLy8gSWYgbm8gb3RoZXIgcGF0Y2hlcywganVzdCBkbyBhIGRpcmVjdCByZW1vdmFsXG4gICAgICAgIGlmIChvYmpbbWV0aG9kXSA9PT0gd3JhcHBlcikge1xuICAgICAgICAgICAgaWYgKGhhZE93bilcbiAgICAgICAgICAgICAgICBvYmpbbWV0aG9kXSA9IG9yaWdpbmFsO1xuICAgICAgICAgICAgZWxzZVxuICAgICAgICAgICAgICAgIGRlbGV0ZSBvYmpbbWV0aG9kXTtcbiAgICAgICAgfVxuICAgICAgICBpZiAoY3VycmVudCA9PT0gb3JpZ2luYWwpXG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIC8vIEVsc2UgcGFzcyBmdXR1cmUgY2FsbHMgdGhyb3VnaCwgYW5kIHJlbW92ZSB3cmFwcGVyIGZyb20gdGhlIHByb3RvdHlwZSBjaGFpblxuICAgICAgICBjdXJyZW50ID0gb3JpZ2luYWw7XG4gICAgICAgIE9iamVjdC5zZXRQcm90b3R5cGVPZih3cmFwcGVyLCBvcmlnaW5hbCB8fCBGdW5jdGlvbik7XG4gICAgfVxufVxuZXhwb3J0IGZ1bmN0aW9uIGFmdGVyKHByb21pc2UsIGNiKSB7XG4gICAgcmV0dXJuIHByb21pc2UudGhlbihjYiwgY2IpO1xufVxuZXhwb3J0IGZ1bmN0aW9uIHNlcmlhbGl6ZShhc3luY0Z1bmN0aW9uKSB7XG4gICAgbGV0IGxhc3RSdW4gPSBQcm9taXNlLnJlc29sdmUoKTtcbiAgICBmdW5jdGlvbiB3cmFwcGVyKC4uLmFyZ3MpIHtcbiAgICAgICAgcmV0dXJuIGxhc3RSdW4gPSBuZXcgUHJvbWlzZSgocmVzLCByZWopID0+IHtcbiAgICAgICAgICAgIGFmdGVyKGxhc3RSdW4sICgpID0+IHtcbiAgICAgICAgICAgICAgICBhc3luY0Z1bmN0aW9uLmFwcGx5KHRoaXMsIGFyZ3MpLnRoZW4ocmVzLCByZWopO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0pO1xuICAgIH1cbiAgICB3cmFwcGVyLmFmdGVyID0gZnVuY3Rpb24gKCkge1xuICAgICAgICByZXR1cm4gbGFzdFJ1biA9IG5ldyBQcm9taXNlKChyZXMsIHJlaikgPT4geyBhZnRlcihsYXN0UnVuLCByZXMpOyB9KTtcbiAgICB9O1xuICAgIHJldHVybiB3cmFwcGVyO1xufVxuIiwiaW1wb3J0IHtNZW51LCBBcHAsIE1lbnVJdGVtLCBkZWJvdW5jZSwgS2V5bWFwLCBTY29wZX0gZnJvbSBcIm9ic2lkaWFuXCI7XG5pbXBvcnQge2Fyb3VuZH0gZnJvbSBcIm1vbmtleS1hcm91bmRcIjtcblxuZGVjbGFyZSBtb2R1bGUgXCJvYnNpZGlhblwiIHtcbiAgICBpbnRlcmZhY2UgTWVudSB7XG4gICAgICAgIGFwcDogQXBwXG4gICAgICAgIGRvbTogSFRNTERpdkVsZW1lbnRcbiAgICAgICAgc2NvcGU6IFNjb3BlXG4gICAgICAgIGl0ZW1zOiBNZW51SXRlbVtdXG5cbiAgICAgICAgc2VsZWN0KG46IG51bWJlcik6IHZvaWRcbiAgICAgICAgc2VsZWN0ZWQ6IG51bWJlclxuICAgICAgICBvbkFycm93RG93bihlOiBLZXlib2FyZEV2ZW50KTogZmFsc2VcbiAgICAgICAgb25BcnJvd1VwKGU6IEtleWJvYXJkRXZlbnQpOiBmYWxzZVxuICAgIH1cblxuICAgIGV4cG9ydCBjb25zdCBLZXltYXA6IHtcbiAgICAgICAgaXNNb2RpZmllcihldmVudDogRXZlbnQsIG1vZGlmaWVyOiBzdHJpbmcpOiBib29sZWFuXG4gICAgICAgIGdldE1vZGlmaWVycyhldmVudDogRXZlbnQpOiBzdHJpbmdcbiAgICB9XG5cbiAgICBpbnRlcmZhY2UgTWVudUl0ZW0ge1xuICAgICAgICBkb206IEhUTUxEaXZFbGVtZW50XG4gICAgICAgIHRpdGxlRWw6IEhUTUxEaXZFbGVtZW50XG4gICAgICAgIGhhbmRsZUV2ZW50KGV2ZW50OiBFdmVudCk6IHZvaWRcbiAgICAgICAgZGlzYWJsZWQ6IGJvb2xlYW5cbiAgICB9XG59XG5cbmV4cG9ydCB0eXBlIE1lbnVQYXJlbnQgPSBBcHAgfCBQb3B1cE1lbnU7XG5cbmV4cG9ydCBjbGFzcyBQb3B1cE1lbnUgZXh0ZW5kcyBNZW51IHtcbiAgICAvKiogVGhlIGNoaWxkIG1lbnUgcG9wcGVkIHVwIG92ZXIgdGhpcyBvbmUgKi9cbiAgICBjaGlsZDogTWVudVxuXG4gICAgbWF0Y2g6IHN0cmluZyA9IFwiXCJcbiAgICByZXNldFNlYXJjaE9uVGltZW91dCA9IGRlYm91bmNlKCgpID0+IHt0aGlzLm1hdGNoID0gXCJcIjt9LCAxNTAwLCB0cnVlKVxuICAgIHZpc2libGU6IGJvb2xlYW4gPSBmYWxzZVxuICAgIGZpcnN0TW92ZTogYm9vbGVhbiA9IGZhbHNlXG5cbiAgICBjb25zdHJ1Y3RvcihwdWJsaWMgcGFyZW50OiBNZW51UGFyZW50KSB7XG4gICAgICAgIHN1cGVyKHBhcmVudCBpbnN0YW5jZW9mIEFwcCA/IHBhcmVudCA6IHBhcmVudC5hcHApO1xuICAgICAgICBpZiAocGFyZW50IGluc3RhbmNlb2YgUG9wdXBNZW51KSBwYXJlbnQuc2V0Q2hpbGRNZW51KHRoaXMpO1xuXG4gICAgICAgIHRoaXMuc2NvcGUgPSBuZXcgU2NvcGU7XG4gICAgICAgIHRoaXMuc2NvcGUucmVnaXN0ZXIoW10sIFwiQXJyb3dVcFwiLCAgIHRoaXMub25BcnJvd1VwLmJpbmQodGhpcykpO1xuICAgICAgICB0aGlzLnNjb3BlLnJlZ2lzdGVyKFtdLCBcIkFycm93RG93blwiLCB0aGlzLm9uQXJyb3dEb3duLmJpbmQodGhpcykpO1xuICAgICAgICB0aGlzLnNjb3BlLnJlZ2lzdGVyKFtdLCBcIkVudGVyXCIsICAgICB0aGlzLm9uRW50ZXIuYmluZCh0aGlzKSk7XG4gICAgICAgIHRoaXMuc2NvcGUucmVnaXN0ZXIoW10sIFwiRXNjYXBlXCIsICAgIHRoaXMub25Fc2NhcGUuYmluZCh0aGlzKSk7XG4gICAgICAgIHRoaXMuc2NvcGUucmVnaXN0ZXIoW10sIFwiQXJyb3dMZWZ0XCIsIHRoaXMub25BcnJvd0xlZnQuYmluZCh0aGlzKSk7XG5cbiAgICAgICAgdGhpcy5zY29wZS5yZWdpc3RlcihbXSwgXCJIb21lXCIsIHRoaXMub25Ib21lLmJpbmQodGhpcykpO1xuICAgICAgICB0aGlzLnNjb3BlLnJlZ2lzdGVyKFtdLCBcIkVuZFwiLCAgdGhpcy5vbkVuZC5iaW5kKHRoaXMpKTtcbiAgICAgICAgdGhpcy5zY29wZS5yZWdpc3RlcihbXSwgXCJBcnJvd1JpZ2h0XCIsIHRoaXMub25BcnJvd1JpZ2h0LmJpbmQodGhpcykpO1xuXG4gICAgICAgIC8vIE1ha2Ugb2JzaWRpYW4uTWVudSB0aGluayBtb3VzZWRvd25zIG9uIG91ciBjaGlsZCBtZW51KHMpIGFyZSBoYXBwZW5pbmdcbiAgICAgICAgLy8gb24gdXMsIHNvIHdlIHdvbid0IGNsb3NlIGJlZm9yZSBhbiBhY3R1YWwgY2xpY2sgb2NjdXJzXG4gICAgICAgIGNvbnN0IG1lbnUgPSB0aGlzO1xuICAgICAgICBhcm91bmQodGhpcy5kb20sIHtjb250YWlucyhwcmV2KXsgcmV0dXJuIGZ1bmN0aW9uKHRhcmdldDogTm9kZSkge1xuICAgICAgICAgICAgY29uc3QgcmV0ID0gcHJldi5jYWxsKHRoaXMsIHRhcmdldCkgfHwgbWVudS5jaGlsZD8uZG9tLmNvbnRhaW5zKHRhcmdldCk7XG4gICAgICAgICAgICByZXR1cm4gcmV0O1xuICAgICAgICB9fX0pO1xuICAgICAgICB0aGlzLmRvbS5hZGRDbGFzcyhcInFlLXBvcHVwLW1lbnVcIik7XG4gICAgfVxuXG4gICAgb25Fc2NhcGUoKSB7XG4gICAgICAgIHRoaXMuaGlkZSgpO1xuICAgIH1cblxuICAgIG9ubG9hZCgpIHtcbiAgICAgICAgdGhpcy5zY29wZS5yZWdpc3RlcihudWxsLCBudWxsLCB0aGlzLm9uS2V5RG93bi5iaW5kKHRoaXMpKTtcbiAgICAgICAgc3VwZXIub25sb2FkKCk7XG4gICAgICAgIHRoaXMudmlzaWJsZSA9IHRydWU7XG4gICAgICAgIHRoaXMuc2hvd1NlbGVjdGVkKCk7XG4gICAgICAgIHRoaXMuZmlyc3RNb3ZlID0gdHJ1ZTtcbiAgICAgICAgLy8gV2Ugd2FpdCB1bnRpbCBub3cgdG8gcmVnaXN0ZXIgc28gdGhhdCBhbnkgaW5pdGlhbCBtb3VzZW92ZXIgb2YgdGhlIG9sZCBtb3VzZSBwb3NpdGlvbiB3aWxsIGJlIHNraXBwZWRcbiAgICAgICAgdGhpcy5yZWdpc3RlcihvbkVsZW1lbnQodGhpcy5kb20sIFwibW91c2VvdmVyXCIsIFwiLm1lbnUtaXRlbVwiLCAoZXZlbnQ6IE1vdXNlRXZlbnQsIHRhcmdldDogSFRNTERpdkVsZW1lbnQpID0+IHtcbiAgICAgICAgICAgIGlmICghdGhpcy5maXJzdE1vdmUgJiYgIXRhcmdldC5oYXNDbGFzcyhcImlzLWRpc2FibGVkXCIpICYmICF0aGlzLmNoaWxkKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5zZWxlY3QodGhpcy5pdGVtcy5maW5kSW5kZXgoaSA9PiBpLmRvbSA9PT0gdGFyZ2V0KSwgZmFsc2UpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgdGhpcy5maXJzdE1vdmUgPSBmYWxzZTtcbiAgICAgICAgfSkpO1xuICAgIH1cblxuICAgIG9udW5sb2FkKCkge1xuICAgICAgICB0aGlzLnZpc2libGUgPSBmYWxzZTtcbiAgICAgICAgc3VwZXIub251bmxvYWQoKTtcbiAgICB9XG5cbiAgICAvLyBPdmVycmlkZSB0byBhdm9pZCBoYXZpbmcgYSBtb3VzZW92ZXIgZXZlbnQgaGFuZGxlclxuICAgIGFkZEl0ZW0oY2I6IChpOiBNZW51SXRlbSkgPT4gYW55KSB7XG4gICAgICAgIGNvbnN0IGkgPSBuZXcgTWVudUl0ZW0odGhpcyk7XG4gICAgICAgIHRoaXMuaXRlbXMucHVzaChpKTtcbiAgICAgICAgY2IoaSk7XG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH1cblxuICAgIG9uS2V5RG93bihldmVudDogS2V5Ym9hcmRFdmVudCkge1xuICAgICAgICBjb25zdCBtb2QgPSBLZXltYXAuZ2V0TW9kaWZpZXJzKGV2ZW50KTtcbiAgICAgICAgaWYgKGV2ZW50LmtleS5sZW5ndGggPT09IDEgJiYgIWV2ZW50LmlzQ29tcG9zaW5nICYmICghbW9kIHx8IG1vZCA9PT0gXCJTaGlmdFwiKSApIHtcbiAgICAgICAgICAgIGxldCBtYXRjaCA9IHRoaXMubWF0Y2ggKyBldmVudC5rZXk7XG4gICAgICAgICAgICAvLyBUaHJvdyBhd2F5IHBpZWNlcyBvZiB0aGUgbWF0Y2ggdW50aWwgc29tZXRoaW5nIG1hdGNoZXMgb3Igbm90aGluZydzIGxlZnRcbiAgICAgICAgICAgIHdoaWxlIChtYXRjaCAmJiAhdGhpcy5zZWFyY2hGb3IobWF0Y2gpKSBtYXRjaCA9IG1hdGNoLnN1YnN0cigxKTtcbiAgICAgICAgICAgIHRoaXMubWF0Y2ggPSBtYXRjaDtcbiAgICAgICAgICAgIHRoaXMucmVzZXRTZWFyY2hPblRpbWVvdXQoKTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gZmFsc2U7ICAgLy8gYmxvY2sgYWxsIGtleXMgb3RoZXIgdGhhbiBvdXJzXG4gICAgfVxuXG4gICAgc2VhcmNoRm9yKG1hdGNoOiBzdHJpbmcpIHtcbiAgICAgICAgY29uc3QgcGFydHMgPSBtYXRjaC5zcGxpdChcIlwiKS5tYXAoZXNjYXBlUmVnZXgpO1xuICAgICAgICByZXR1cm4gKFxuICAgICAgICAgICAgdGhpcy5maW5kKG5ldyBSZWdFeHAoXCJeXCIrIHBhcnRzLmpvaW4oXCJcIiksIFwidWlcIikpIHx8XG4gICAgICAgICAgICB0aGlzLmZpbmQobmV3IFJlZ0V4cChcIl5cIisgcGFydHMuam9pbihcIi4qXCIpLCBcInVpXCIpKSB8fFxuICAgICAgICAgICAgdGhpcy5maW5kKG5ldyBSZWdFeHAocGFydHMuam9pbihcIi4qXCIpLCBcInVpXCIpKVxuICAgICAgICApO1xuICAgIH1cblxuICAgIGZpbmQocGF0dGVybjogUmVnRXhwKSB7XG4gICAgICAgIGxldCBwb3MgPSBNYXRoLm1pbigwLCB0aGlzLnNlbGVjdGVkKTtcbiAgICAgICAgZm9yIChsZXQgaT10aGlzLml0ZW1zLmxlbmd0aDsgaTsgKytwb3MsIGktLSkge1xuICAgICAgICAgICAgaWYgKHRoaXMuaXRlbXNbcG9zXT8uZGlzYWJsZWQpIGNvbnRpbnVlO1xuICAgICAgICAgICAgaWYgKHRoaXMuaXRlbXNbcG9zXT8uZG9tLnRleHRDb250ZW50Lm1hdGNoKHBhdHRlcm4pKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5zZWxlY3QocG9zKTtcbiAgICAgICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gZmFsc2VcbiAgICB9XG5cbiAgICBvbkVudGVyKGV2ZW50OiBLZXlib2FyZEV2ZW50KSB7XG4gICAgICAgIGNvbnN0IGl0ZW0gPSB0aGlzLml0ZW1zW3RoaXMuc2VsZWN0ZWRdO1xuICAgICAgICBpZiAoaXRlbSkge1xuICAgICAgICAgICAgaXRlbS5oYW5kbGVFdmVudChldmVudCk7XG4gICAgICAgICAgICAvLyBPbmx5IGhpZGUgaWYgd2UgZG9uJ3QgaGF2ZSBhIHN1Ym1lbnVcbiAgICAgICAgICAgIGlmICghdGhpcy5jaGlsZCkgdGhpcy5oaWRlKCk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cblxuICAgIHNlbGVjdChuOiBudW1iZXIsIHNjcm9sbCA9IHRydWUpIHtcbiAgICAgICAgdGhpcy5tYXRjaCA9IFwiXCIgLy8gcmVzZXQgc2VhcmNoIG9uIG1vdmVcbiAgICAgICAgc3VwZXIuc2VsZWN0KG4pO1xuICAgICAgICBpZiAoc2Nyb2xsKSB0aGlzLnNob3dTZWxlY3RlZCgpO1xuICAgIH1cblxuICAgIHNob3dTZWxlY3RlZCgpIHtcbiAgICAgICAgY29uc3QgZWwgPSB0aGlzLml0ZW1zW3RoaXMuc2VsZWN0ZWRdPy5kb207XG4gICAgICAgIGlmIChlbCkge1xuICAgICAgICAgICAgY29uc3QgbWUgPSB0aGlzLmRvbS5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKSwgbXkgPSBlbC5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKTtcbiAgICAgICAgICAgIGlmIChteS50b3AgPCBtZS50b3AgfHwgbXkuYm90dG9tID4gbWUuYm90dG9tKSBlbC5zY3JvbGxJbnRvVmlldygpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgdW5zZWxlY3QoKSB7XG4gICAgICAgIHRoaXMuaXRlbXNbdGhpcy5zZWxlY3RlZF0/LmRvbS5yZW1vdmVDbGFzcyhcInNlbGVjdGVkXCIpO1xuICAgIH1cblxuICAgIG9uRW5kKGU6IEtleWJvYXJkRXZlbnQpIHtcbiAgICAgICAgdGhpcy51bnNlbGVjdCgpO1xuICAgICAgICB0aGlzLnNlbGVjdGVkID0gdGhpcy5pdGVtcy5sZW5ndGg7XG4gICAgICAgIHRoaXMub25BcnJvd1VwKGUpO1xuICAgICAgICBpZiAodGhpcy5zZWxlY3RlZCA9PT0gdGhpcy5pdGVtcy5sZW5ndGgpIHRoaXMuc2VsZWN0ZWQgPSAtMTtcbiAgICB9XG5cbiAgICBvbkhvbWUoZTogS2V5Ym9hcmRFdmVudCkge1xuICAgICAgICB0aGlzLnVuc2VsZWN0KCk7XG4gICAgICAgIHRoaXMuc2VsZWN0ZWQgPSAtMTtcbiAgICAgICAgdGhpcy5vbkFycm93RG93bihlKTtcbiAgICB9XG5cbiAgICBvbkFycm93TGVmdCgpOiBib29sZWFuIHwgdW5kZWZpbmVkIHtcbiAgICAgICAgaWYgKHRoaXMucm9vdE1lbnUoKSAhPT0gdGhpcykge1xuICAgICAgICAgICAgdGhpcy5oaWRlKCk7XG4gICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBvbkFycm93UmlnaHQoKTogYm9vbGVhbiB8IHVuZGVmaW5lZCB7XG4gICAgICAgIC8vIG5vLW9wIGluIGJhc2UgY2xhc3NcbiAgICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGhpZGUoKSB7XG4gICAgICAgIHRoaXMuc2V0Q2hpbGRNZW51KCk7ICAvLyBoaWRlIGNoaWxkIG1lbnUocykgZmlyc3RcbiAgICAgICAgcmV0dXJuIHN1cGVyLmhpZGUoKTtcbiAgICB9XG5cbiAgICBzZXRDaGlsZE1lbnUobWVudT86IE1lbnUpIHtcbiAgICAgICAgdGhpcy5jaGlsZD8uaGlkZSgpO1xuICAgICAgICB0aGlzLmNoaWxkID0gbWVudTtcbiAgICB9XG5cbiAgICByb290TWVudSgpOiBQb3B1cE1lbnUge1xuICAgICAgICByZXR1cm4gdGhpcy5wYXJlbnQgaW5zdGFuY2VvZiBBcHAgPyB0aGlzIDogdGhpcy5wYXJlbnQucm9vdE1lbnUoKTtcbiAgICB9XG5cbiAgICBjYXNjYWRlKHRhcmdldDogSFRNTEVsZW1lbnQsIGV2ZW50PzogTW91c2VFdmVudCwgIGhPdmVybGFwID0gMTUsIHZPdmVybGFwID0gNSkge1xuICAgICAgICBjb25zdCB7bGVmdCwgcmlnaHQsIHRvcCwgYm90dG9tLCB3aWR0aH0gPSB0YXJnZXQuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCk7XG4gICAgICAgIGNvbnN0IGNlbnRlclggPSBsZWZ0K01hdGgubWluKDE1MCwgd2lkdGgvMyksIGNlbnRlclkgPSAodG9wK2JvdHRvbSkvMjtcbiAgICAgICAgY29uc3Qge2lubmVySGVpZ2h0LCBpbm5lcldpZHRofSA9IHdpbmRvdztcblxuICAgICAgICAvLyBUcnkgdG8gY2FzY2FkZSBkb3duIGFuZCB0byB0aGUgcmlnaHQgZnJvbSB0aGUgbW91c2Ugb3IgaG9yaXpvbnRhbCBjZW50ZXJcbiAgICAgICAgLy8gb2YgdGhlIGNsaWNrZWQgaXRlbVxuICAgICAgICBjb25zdCBwb2ludCA9IHt4OiBldmVudCA/IGV2ZW50LmNsaWVudFggIC0gaE92ZXJsYXAgOiBjZW50ZXJYICwgeTogYm90dG9tIC0gdk92ZXJsYXB9O1xuXG4gICAgICAgIC8vIE1lYXN1cmUgdGhlIG1lbnUgYW5kIHNlZSBpZiBpdCBmaXRzXG4gICAgICAgIGRvY3VtZW50LmJvZHkuYXBwZW5kQ2hpbGQodGhpcy5kb20pO1xuICAgICAgICBjb25zdCB7b2Zmc2V0V2lkdGgsIG9mZnNldEhlaWdodH0gPSB0aGlzLmRvbTtcbiAgICAgICAgY29uc3QgZml0c0JlbG93ID0gcG9pbnQueSArIG9mZnNldEhlaWdodCA8IGlubmVySGVpZ2h0O1xuICAgICAgICBjb25zdCBmaXRzUmlnaHQgPSBwb2ludC54ICsgb2Zmc2V0V2lkdGggPD0gaW5uZXJXaWR0aDtcblxuICAgICAgICAvLyBJZiBpdCBkb2Vzbid0IGZpdCB1bmRlcm5lYXRoIHVzLCBwb3NpdGlvbiBpdCBhdCB0aGUgYm90dG9tIG9mIHRoZSBzY3JlZW4sIHVubGVzc1xuICAgICAgICAvLyB0aGUgY2xpY2tlZCBpdGVtIGlzIGNsb3NlIHRvIHRoZSBib3R0b20gKGluIHdoaWNoIGNhc2UsIHBvc2l0aW9uIGl0IGFib3ZlIHNvXG4gICAgICAgIC8vIHRoZSBpdGVtIHdpbGwgc3RpbGwgYmUgdmlzaWJsZS4pXG4gICAgICAgIGlmICghZml0c0JlbG93KSB7XG4gICAgICAgICAgICBwb2ludC55ID0gKGJvdHRvbSA+IGlubmVySGVpZ2h0IC0gKGJvdHRvbS10b3ApKSA/IHRvcCArIHZPdmVybGFwOiBpbm5lckhlaWdodDtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIElmIGl0IGRvZXNuJ3QgZml0IHRvIHRoZSByaWdodCwgdGhlbiBwb3NpdGlvbiBpdCBhdCB0aGUgcmlnaHQgZWRnZSBvZiB0aGUgc2NyZWVuLFxuICAgICAgICAvLyBzbyBsb25nIGFzIGl0IGZpdHMgZW50aXJlbHkgYWJvdmUgb3IgYmVsb3cgdXMuICBPdGhlcndpc2UsIHBvc2l0aW9uIGl0IHVzaW5nIHRoZVxuICAgICAgICAvLyBpdGVtIGNlbnRlciwgc28gYXQgbGVhc3Qgb25lIHNpZGUgb2YgdGhlIHByZXZpb3VzIG1lbnUvaXRlbSB3aWxsIHN0aWxsIGJlIHNlZW4uXG4gICAgICAgIGlmICghZml0c1JpZ2h0KSB7XG4gICAgICAgICAgICBwb2ludC54ID0gKG9mZnNldEhlaWdodCA8IChib3R0b20gLSB2T3ZlcmxhcCkgfHwgZml0c0JlbG93KSA/IGlubmVyV2lkdGggOiBjZW50ZXJYO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gRG9uZSEgIFNob3cgb3VyIHdvcmsuXG4gICAgICAgIHRoaXMuc2hvd0F0UG9zaXRpb24ocG9pbnQpO1xuXG4gICAgICAgIC8vIEZsYWcgdGhlIGNsaWNrZWQgaXRlbSBhcyBhY3RpdmUsIHVudGlsIHdlIGNsb3NlXG4gICAgICAgIHRhcmdldC50b2dnbGVDbGFzcyhcInNlbGVjdGVkXCIsIHRydWUpO1xuICAgICAgICB0aGlzLm9uSGlkZSgoKSA9PiB7XG4gICAgICAgICAgICBpZiAodGhpcy5wYXJlbnQgaW5zdGFuY2VvZiBBcHApIHRhcmdldC50b2dnbGVDbGFzcyhcInNlbGVjdGVkXCIsIGZhbHNlKTtcbiAgICAgICAgICAgIGVsc2UgaWYgKHRoaXMucGFyZW50IGluc3RhbmNlb2YgUG9wdXBNZW51KSB0aGlzLnBhcmVudC5zZXRDaGlsZE1lbnUoKTtcbiAgICAgICAgfSk7XG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH1cbn1cblxuZnVuY3Rpb24gZXNjYXBlUmVnZXgoczogc3RyaW5nKSB7XG4gICAgcmV0dXJuIHMucmVwbGFjZSgvWy4qKz9eJHt9KCl8W1xcXVxcXFxdL2csICdcXFxcJCYnKTtcbn1cblxuZnVuY3Rpb24gb25FbGVtZW50PEsgZXh0ZW5kcyBrZXlvZiBIVE1MRWxlbWVudEV2ZW50TWFwPihcbiAgICBlbDogSFRNTEVsZW1lbnQsIHR5cGU6IEssIHNlbGVjdG9yOnN0cmluZyxcbiAgICBsaXN0ZW5lcjogKHRoaXM6IEhUTUxFbGVtZW50LCBldjogSFRNTEVsZW1lbnRFdmVudE1hcFtLXSwgZGVsZWdhdGVUYXJnZXQ6IEhUTUxFbGVtZW50KSA9PiBhbnksXG4gICAgb3B0aW9uczogYm9vbGVhbiB8IEFkZEV2ZW50TGlzdGVuZXJPcHRpb25zID0gZmFsc2Vcbikge1xuICAgIGVsLm9uKHR5cGUsIHNlbGVjdG9yLCBsaXN0ZW5lciwgb3B0aW9ucylcbiAgICByZXR1cm4gKCkgPT4gZWwub2ZmKHR5cGUsIHNlbGVjdG9yLCBsaXN0ZW5lciwgb3B0aW9ucyk7XG59IiwiaW1wb3J0IHsgS2V5bWFwLCBNb2RhbCwgTm90aWNlLCBUQWJzdHJhY3RGaWxlLCBURmlsZSwgVEZvbGRlciwgVmlldyB9IGZyb20gXCJvYnNpZGlhblwiO1xuaW1wb3J0IHsgUG9wdXBNZW51LCBNZW51UGFyZW50IH0gZnJvbSBcIi4vbWVudXNcIjtcbmltcG9ydCB7aTE4bn0gZnJvbSBcImkxOG5leHRcIjtcblxuZGVjbGFyZSBnbG9iYWwge1xuICAgIGNvbnN0IGkxOG5leHQ6IGkxOG5cbn1cblxuZGVjbGFyZSBtb2R1bGUgXCJvYnNpZGlhblwiIHtcbiAgICBpbnRlcmZhY2UgQXBwIHtcbiAgICAgICAgc2V0QXR0YWNobWVudEZvbGRlcihmb2xkZXI6IFRGb2xkZXIpOiB2b2lkXG4gICAgICAgIGludGVybmFsUGx1Z2luczoge1xuICAgICAgICAgICAgcGx1Z2luczoge1xuICAgICAgICAgICAgICAgIFwiZmlsZS1leHBsb3JlclwiOiB7XG4gICAgICAgICAgICAgICAgICAgIGVuYWJsZWQ6IGJvb2xlYW5cbiAgICAgICAgICAgICAgICAgICAgaW5zdGFuY2U6IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJldmVhbEluRm9sZGVyKGZpbGU6IFRBYnN0cmFjdEZpbGUpOiB2b2lkXG4gICAgICAgICAgICAgICAgICAgICAgICBtb3ZlRmlsZU1vZGFsOiBNb2RhbCAmIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBzZXRDdXJyZW50RmlsZShmaWxlOiBUQWJzdHJhY3RGaWxlKTogdm9pZFxuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxuICAgIGludGVyZmFjZSBGaWxlTWFuYWdlciB7XG4gICAgICAgIHByb21wdEZvckZvbGRlckRlbGV0aW9uKGZvbGRlcjogVEZvbGRlcik6IHZvaWRcbiAgICAgICAgcHJvbXB0Rm9yRmlsZURlbGV0aW9uKGZpbGU6IFRGaWxlKTogdm9pZFxuICAgICAgICBwcm9tcHRGb3JGaWxlUmVuYW1lKGZpbGU6IFRBYnN0cmFjdEZpbGUpOiB2b2lkXG4gICAgICAgIGNyZWF0ZU5ld01hcmtkb3duRmlsZShwYXJlbnRGb2xkZXI/OiBURm9sZGVyLCBwYXR0ZXJuPzogc3RyaW5nKTogUHJvbWlzZTxURmlsZT5cbiAgICB9XG59XG5cbmludGVyZmFjZSBGaWxlRXhwbG9yZXJWaWV3IGV4dGVuZHMgVmlldyB7XG4gICAgY3JlYXRlQWJzdHJhY3RGaWxlKGtpbmQ6IFwiZmlsZVwiIHwgXCJmb2xkZXJcIiwgcGFyZW50OiBURm9sZGVyLCBuZXdMZWFmPzogYm9vbGVhbik6IFByb21pc2U8dm9pZD5cbiAgICBzdGFydFJlbmFtZUZpbGUoZmlsZTogVEFic3RyYWN0RmlsZSk6IFByb21pc2U8dm9pZD5cbn1cblxuZnVuY3Rpb24gb3B0TmFtZShuYW1lOiBzdHJpbmcpIHtcbiAgICByZXR1cm4gaTE4bmV4dC50KGBwbHVnaW5zLmZpbGUtZXhwbG9yZXIubWVudS1vcHQtJHtuYW1lfWApO1xufVxuXG5leHBvcnQgY2xhc3MgQ29udGV4dE1lbnUgZXh0ZW5kcyBQb3B1cE1lbnUge1xuICAgIGNvbnN0cnVjdG9yKHBhcmVudDogTWVudVBhcmVudCwgZmlsZTogVEFic3RyYWN0RmlsZSkge1xuICAgICAgICBzdXBlcihwYXJlbnQpO1xuICAgICAgICBjb25zdCB7IHdvcmtzcGFjZSB9ID0gdGhpcy5hcHA7XG4gICAgICAgIGNvbnN0IGhhdmVGaWxlRXhwbG9yZXIgPSB0aGlzLmFwcC5pbnRlcm5hbFBsdWdpbnMucGx1Z2luc1tcImZpbGUtZXhwbG9yZXJcIl0uZW5hYmxlZDtcblxuICAgICAgICBpZiAoZmlsZSBpbnN0YW5jZW9mIFRGb2xkZXIpIHtcbiAgICAgICAgICAgIHRoaXMuYWRkSXRlbShpID0+IGkuc2V0VGl0bGUob3B0TmFtZShcIm5ldy1ub3RlXCIpKS5zZXRJY29uKFwiY3JlYXRlLW5ld1wiKS5vbkNsaWNrKGFzeW5jIGUgPT4ge1xuICAgICAgICAgICAgICAgIGNvbnN0IG5ld0ZpbGUgPSBhd2FpdCB0aGlzLmFwcC5maWxlTWFuYWdlci5jcmVhdGVOZXdNYXJrZG93bkZpbGUoZmlsZSk7XG4gICAgICAgICAgICAgICAgaWYgKG5ld0ZpbGUpIGF3YWl0IHRoaXMuYXBwLndvcmtzcGFjZS5nZXRMZWFmKEtleW1hcC5pc01vZGlmaWVyKGUsIFwiTW9kXCIpKS5vcGVuRmlsZShuZXdGaWxlLCB7XG4gICAgICAgICAgICAgICAgICAgIGFjdGl2ZTogITAsIHN0YXRlOiB7IG1vZGU6IFwic291cmNlXCIgfSwgZVN0YXRlOiB7IHJlbmFtZTogXCJhbGxcIiB9XG4gICAgICAgICAgICAgICAgfSlcbiAgICAgICAgICAgIH0pKTtcbiAgICAgICAgICAgIHRoaXMuYWRkSXRlbShpID0+IGkuc2V0VGl0bGUob3B0TmFtZShcIm5ldy1mb2xkZXJcIikpLnNldEljb24oXCJmb2xkZXJcIikuc2V0RGlzYWJsZWQoIWhhdmVGaWxlRXhwbG9yZXIpLm9uQ2xpY2soZXZlbnQgPT4ge1xuICAgICAgICAgICAgICAgIGlmIChoYXZlRmlsZUV4cGxvcmVyKSB7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMud2l0aEV4cGxvcmVyKGZpbGUpPy5jcmVhdGVBYnN0cmFjdEZpbGUoXCJmb2xkZXJcIiwgZmlsZSk7XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgbmV3IE5vdGljZShcIlRoZSBGaWxlIEV4cGxvcmVyIGNvcmUgcGx1Z2luIG11c3QgYmUgZW5hYmxlZCB0byBjcmVhdGUgbmV3IGZvbGRlcnNcIilcbiAgICAgICAgICAgICAgICAgICAgZXZlbnQuc3RvcFByb3BhZ2F0aW9uKCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSkpO1xuICAgICAgICAgICAgdGhpcy5hZGRJdGVtKGkgPT4gaS5zZXRUaXRsZShvcHROYW1lKFwic2V0LWF0dGFjaG1lbnQtZm9sZGVyXCIpKS5zZXRJY29uKFwiaW1hZ2UtZmlsZVwiKS5vbkNsaWNrKCgpID0+IHtcbiAgICAgICAgICAgICAgICB0aGlzLmFwcC5zZXRBdHRhY2htZW50Rm9sZGVyKGZpbGUpO1xuICAgICAgICAgICAgfSkpO1xuICAgICAgICAgICAgdGhpcy5hZGRTZXBhcmF0b3IoKTtcbiAgICAgICAgfVxuICAgICAgICB0aGlzLmFkZEl0ZW0oaSA9PiB7XG4gICAgICAgICAgICBpLnNldFRpdGxlKG9wdE5hbWUoXCJyZW5hbWVcIikpLnNldEljb24oXCJwZW5jaWxcIikub25DbGljayhldmVudCA9PiB7XG4gICAgICAgICAgICAgICAgdGhpcy5hcHAuZmlsZU1hbmFnZXIucHJvbXB0Rm9yRmlsZVJlbmFtZShmaWxlKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9KTtcbiAgICAgICAgdGhpcy5hZGRJdGVtKGkgPT4gaS5zZXRUaXRsZShvcHROYW1lKFwiZGVsZXRlXCIpKS5zZXRJY29uKFwidHJhc2hcIikub25DbGljaygoKSA9PiB7XG4gICAgICAgICAgICBpZiAoZmlsZSBpbnN0YW5jZW9mIFRGb2xkZXIpIHtcbiAgICAgICAgICAgICAgICB0aGlzLmFwcC5maWxlTWFuYWdlci5wcm9tcHRGb3JGb2xkZXJEZWxldGlvbihmaWxlKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2UgaWYgKGZpbGUgaW5zdGFuY2VvZiBURmlsZSkge1xuICAgICAgICAgICAgICAgIHRoaXMuYXBwLmZpbGVNYW5hZ2VyLnByb21wdEZvckZpbGVEZWxldGlvbihmaWxlKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSkpO1xuICAgICAgICBpZiAoZmlsZSBpbnN0YW5jZW9mIFRGb2xkZXIgJiYgaGF2ZUZpbGVFeHBsb3Jlcikge1xuICAgICAgICAgICAgdGhpcy5hZGRJdGVtKGkgPT4gaS5zZXRJY29uKFwiZm9sZGVyXCIpLnNldFRpdGxlKGkxOG5leHQudCgncGx1Z2lucy5maWxlLWV4cGxvcmVyLmFjdGlvbi1yZXZlYWwtZmlsZScpKS5vbkNsaWNrKCgpID0+IHtcbiAgICAgICAgICAgICAgICB0aGlzLndpdGhFeHBsb3JlcihmaWxlKTtcbiAgICAgICAgICAgIH0pKTtcbiAgICAgICAgfVxuICAgICAgICBpZiAoZmlsZSA9PT0gd29ya3NwYWNlLmdldEFjdGl2ZUZpbGUoKSkge1xuICAgICAgICAgICAgd29ya3NwYWNlLnRyaWdnZXIoXCJmaWxlLW1lbnVcIiwgdGhpcywgZmlsZSwgXCJxdWljay1leHBsb3JlclwiLCB3b3Jrc3BhY2UuYWN0aXZlTGVhZik7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB3b3Jrc3BhY2UudHJpZ2dlcihcImZpbGUtbWVudVwiLCB0aGlzLCBmaWxlLCBcInF1aWNrLWV4cGxvcmVyXCIpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgd2l0aEV4cGxvcmVyKGZpbGU6IFRBYnN0cmFjdEZpbGUpIHtcbiAgICAgICAgY29uc3QgZXhwbG9yZXIgPSB0aGlzLmFwcC5pbnRlcm5hbFBsdWdpbnMucGx1Z2luc1tcImZpbGUtZXhwbG9yZXJcIl07XG4gICAgICAgIGlmIChleHBsb3Jlci5lbmFibGVkKSB7XG4gICAgICAgICAgICBleHBsb3Jlci5pbnN0YW5jZS5yZXZlYWxJbkZvbGRlcihmaWxlKTtcbiAgICAgICAgICAgIHJldHVybiB0aGlzLmFwcC53b3Jrc3BhY2UuZ2V0TGVhdmVzT2ZUeXBlKFwiZmlsZS1leHBsb3JlclwiKVswXS52aWV3IGFzIEZpbGVFeHBsb3JlclZpZXdcbiAgICAgICAgfVxuICAgIH1cbn1cbiIsImltcG9ydCB7IFRBYnN0cmFjdEZpbGUsIFRGaWxlLCBURm9sZGVyLCBLZXltYXAsIE5vdGljZSwgQXBwLCBNZW51LCBIb3ZlclBhcmVudCwgZGVib3VuY2UsIE1lbnVJdGVtIH0gZnJvbSBcIm9ic2lkaWFuXCI7XG5pbXBvcnQgeyBob3ZlclNvdXJjZSwgc3RhcnREcmFnIH0gZnJvbSBcIi4vRXhwbG9yZXJcIjtcbmltcG9ydCB7IFBvcHVwTWVudSwgTWVudVBhcmVudCB9IGZyb20gXCIuL21lbnVzXCI7XG5pbXBvcnQgeyBDb250ZXh0TWVudSB9IGZyb20gXCIuL0NvbnRleHRNZW51XCI7XG5cbmRlY2xhcmUgbW9kdWxlIFwib2JzaWRpYW5cIiB7XG4gICAgaW50ZXJmYWNlIEhvdmVyUG9wb3ZlciB7XG4gICAgICAgIGhpZGUoKTogdm9pZFxuICAgICAgICBob3ZlckVsOiBIVE1MRGl2RWxlbWVudFxuICAgIH1cbiAgICBpbnRlcmZhY2UgQXBwIHtcbiAgICAgICAgdmlld1JlZ2lzdHJ5OiB7XG4gICAgICAgICAgICBpc0V4dGVuc2lvblJlZ2lzdGVyZWQoZXh0OiBzdHJpbmcpOiBib29sZWFuXG4gICAgICAgICAgICBnZXRUeXBlQnlFeHRlbnNpb24oZXh0OiBzdHJpbmcpOiBzdHJpbmdcbiAgICAgICAgfVxuICAgIH1cbiAgICBpbnRlcmZhY2UgVmF1bHQge1xuICAgICAgICBnZXRDb25maWcob3B0aW9uOiBzdHJpbmcpOiBhbnlcbiAgICAgICAgZ2V0Q29uZmlnKG9wdGlvbjpcInNob3dVbnN1cHBvcnRlZEZpbGVzXCIpOiBib29sZWFuXG4gICAgfVxufVxuXG5jb25zdCBhbHBoYVNvcnQgPSBuZXcgSW50bC5Db2xsYXRvcih1bmRlZmluZWQsIHt1c2FnZTogXCJzb3J0XCIsIHNlbnNpdGl2aXR5OiBcImJhc2VcIiwgbnVtZXJpYzogdHJ1ZX0pLmNvbXBhcmU7XG5cbmNvbnN0IHByZXZpZXdJY29uczogUmVjb3JkPHN0cmluZywgc3RyaW5nPiA9IHtcbiAgICBtYXJrZG93bjogXCJkb2N1bWVudFwiLFxuICAgIGltYWdlOiBcImltYWdlLWZpbGVcIixcbiAgICBhdWRpbzogXCJhdWRpby1maWxlXCIsXG4gICAgcGRmOiBcInBkZi1maWxlXCIsXG59XG5cbmNvbnN0IHZpZXd0eXBlSWNvbnM6IFJlY29yZDxzdHJpbmcsIHN0cmluZz4gPSB7XG4gICAgLi4ucHJldmlld0ljb25zLFxuICAgIC8vIGFkZCB0aGlyZC1wYXJ0eSBwbHVnaW5zXG4gICAgZXhjYWxpZHJhdzogXCJleGNhbGlkcmF3LWljb25cIixcbn07XG5cblxuLy8gR2xvYmFsIGF1dG8gcHJldmlldyBtb2RlXG5sZXQgYXV0b1ByZXZpZXcgPSBmYWxzZVxuXG5leHBvcnQgY2xhc3MgRm9sZGVyTWVudSBleHRlbmRzIFBvcHVwTWVudSB7XG5cbiAgICBwYXJlbnRGb2xkZXI6IFRGb2xkZXIgPSB0aGlzLnBhcmVudCBpbnN0YW5jZW9mIEZvbGRlck1lbnUgPyB0aGlzLnBhcmVudC5mb2xkZXIgOiBudWxsO1xuXG4gICAgY29uc3RydWN0b3IocHVibGljIHBhcmVudDogTWVudVBhcmVudCwgcHVibGljIGZvbGRlcjogVEZvbGRlciwgcHVibGljIHNlbGVjdGVkRmlsZT86IFRBYnN0cmFjdEZpbGUsIHB1YmxpYyBvcGVuZXI/OiBIVE1MRWxlbWVudCkge1xuICAgICAgICBzdXBlcihwYXJlbnQpO1xuICAgICAgICB0aGlzLmxvYWRGaWxlcyhmb2xkZXIsIHNlbGVjdGVkRmlsZSk7XG4gICAgICAgIHRoaXMuc2NvcGUucmVnaXN0ZXIoW10sICAgICAgICBcIlRhYlwiLCAgIHRoaXMudG9nZ2xlUHJldmlld01vZGUuYmluZCh0aGlzKSk7XG4gICAgICAgIHRoaXMuc2NvcGUucmVnaXN0ZXIoW1wiTW9kXCJdLCAgIFwiRW50ZXJcIiwgdGhpcy5vbkVudGVyLmJpbmQodGhpcykpO1xuICAgICAgICB0aGlzLnNjb3BlLnJlZ2lzdGVyKFtcIkFsdFwiXSwgICBcIkVudGVyXCIsIHRoaXMub25LZXlib2FyZENvbnRleHRNZW51LmJpbmQodGhpcykpO1xuICAgICAgICB0aGlzLnNjb3BlLnJlZ2lzdGVyKFtdLCAgICAgICAgXCJcXFxcXCIsICAgIHRoaXMub25LZXlib2FyZENvbnRleHRNZW51LmJpbmQodGhpcykpO1xuICAgICAgICB0aGlzLnNjb3BlLnJlZ2lzdGVyKFtdLCAgICAgICAgXCJGMlwiLCAgICB0aGlzLmRvUmVuYW1lLmJpbmQodGhpcykpO1xuICAgICAgICB0aGlzLnNjb3BlLnJlZ2lzdGVyKFtcIlNoaWZ0XCJdLCBcIkYyXCIsICAgIHRoaXMuZG9Nb3ZlLmJpbmQodGhpcykpO1xuXG4gICAgICAgIC8vIFNjcm9sbCBwcmV2aWV3IHdpbmRvdyB1cCBhbmQgZG93blxuICAgICAgICB0aGlzLnNjb3BlLnJlZ2lzdGVyKFtdLCAgICAgICBcIlBhZ2VVcFwiLCB0aGlzLmRvU2Nyb2xsLmJpbmQodGhpcywgLTEsIGZhbHNlKSk7XG4gICAgICAgIHRoaXMuc2NvcGUucmVnaXN0ZXIoW10sICAgICBcIlBhZ2VEb3duXCIsIHRoaXMuZG9TY3JvbGwuYmluZCh0aGlzLCAgMSwgZmFsc2UpKTtcbiAgICAgICAgdGhpcy5zY29wZS5yZWdpc3RlcihbXCJNb2RcIl0sICAgIFwiSG9tZVwiLCB0aGlzLmRvU2Nyb2xsLmJpbmQodGhpcywgIDAsIHRydWUpKTtcbiAgICAgICAgdGhpcy5zY29wZS5yZWdpc3RlcihbXCJNb2RcIl0sICAgICBcIkVuZFwiLCB0aGlzLmRvU2Nyb2xsLmJpbmQodGhpcywgIDEsIHRydWUpKTtcblxuICAgICAgICBjb25zdCB7IGRvbSB9ID0gdGhpcztcbiAgICAgICAgZG9tLnN0eWxlLnNldFByb3BlcnR5KFxuICAgICAgICAgICAgLy8gQWxsb3cgcG9wb3ZlcnMgKGhvdmVyIHByZXZpZXcpIHRvIG92ZXJsYXkgdGhpcyBtZW51XG4gICAgICAgICAgICBcIi0tbGF5ZXItbWVudVwiLCBcIlwiICsgKHBhcnNlSW50KGdldENvbXB1dGVkU3R5bGUoZG9jdW1lbnQuYm9keSkuZ2V0UHJvcGVydHlWYWx1ZShcIi0tbGF5ZXItcG9wb3ZlclwiKSkgLSAxKVxuICAgICAgICApO1xuXG4gICAgICAgIGNvbnN0IG1lbnVJdGVtID0gXCIubWVudS1pdGVtW2RhdGEtZmlsZS1wYXRoXVwiO1xuICAgICAgICBkb20ub24oXCJjbGlja1wiLCAgICAgICBtZW51SXRlbSwgdGhpcy5vbkl0ZW1DbGljaywgdHJ1ZSk7XG4gICAgICAgIGRvbS5vbihcImNvbnRleHRtZW51XCIsIG1lbnVJdGVtLCB0aGlzLm9uSXRlbU1lbnUgKTtcbiAgICAgICAgZG9tLm9uKCdtb3VzZW92ZXInICAsIG1lbnVJdGVtLCB0aGlzLm9uSXRlbUhvdmVyKTtcbiAgICAgICAgZG9tLm9uKFwibW91c2Vkb3duXCIsICAgbWVudUl0ZW0sIGUgPT4ge2Uuc3RvcFByb3BhZ2F0aW9uKCl9LCB0cnVlKTsgIC8vIEZpeCBkcmFnIGNhbmNlbGxpbmdcbiAgICAgICAgZG9tLm9uKCdkcmFnc3RhcnQnLCAgIG1lbnVJdGVtLCAoZXZlbnQsIHRhcmdldCkgPT4ge1xuICAgICAgICAgICAgc3RhcnREcmFnKHRoaXMuYXBwLCB0YXJnZXQuZGF0YXNldC5maWxlUGF0aCwgZXZlbnQpO1xuICAgICAgICB9KTtcblxuICAgICAgICAvLyBXaGVuIHdlIHVubG9hZCwgcmVhY3RpdmF0ZSBwYXJlbnQgbWVudSdzIGhvdmVyLCBpZiBuZWVkZWRcbiAgICAgICAgdGhpcy5yZWdpc3RlcigoKSA9PiB7IGF1dG9QcmV2aWV3ICYmIHRoaXMucGFyZW50IGluc3RhbmNlb2YgRm9sZGVyTWVudSAmJiB0aGlzLnBhcmVudC5zaG93UG9wb3ZlcigpOyB9KVxuICAgIH1cblxuICAgIG9uQXJyb3dMZWZ0KCk6IGJvb2xlYW4gfCB1bmRlZmluZWQge1xuICAgICAgICByZXR1cm4gc3VwZXIub25BcnJvd0xlZnQoKSA/PyB0aGlzLm9wZW5CcmVhZGNydW1iKHRoaXMub3BlbmVyPy5wcmV2aW91c0VsZW1lbnRTaWJsaW5nKTtcbiAgICB9XG5cbiAgICBvbktleWJvYXJkQ29udGV4dE1lbnUoKSB7XG4gICAgICAgIGNvbnN0IHRhcmdldCA9IHRoaXMuaXRlbXNbdGhpcy5zZWxlY3RlZF0/LmRvbSwgZmlsZSA9IHRhcmdldCAmJiB0aGlzLmZpbGVGb3JEb20odGFyZ2V0KTtcbiAgICAgICAgaWYgKGZpbGUpIG5ldyBDb250ZXh0TWVudSh0aGlzLCBmaWxlKS5jYXNjYWRlKHRhcmdldCk7XG4gICAgfVxuXG4gICAgZG9TY3JvbGwoZGlyZWN0aW9uOiBudW1iZXIsIHRvRW5kOiBib29sZWFuLCBldmVudDogS2V5Ym9hcmRFdmVudCkge1xuICAgICAgICBjb25zdCBwcmV2aWV3ID0gdGhpcy5ob3ZlclBvcG92ZXI/LmhvdmVyRWwuZmluZChcIi5tYXJrZG93bi1wcmV2aWV3LXZpZXdcIik7XG4gICAgICAgIGlmIChwcmV2aWV3KSB7XG4gICAgICAgICAgICBwcmV2aWV3LnN0eWxlLnNjcm9sbEJlaGF2aW9yID0gdG9FbmQgPyBcImF1dG9cIjogXCJzbW9vdGhcIjtcbiAgICAgICAgICAgIGNvbnN0IG9sZFRvcCA9IHByZXZpZXcuc2Nyb2xsVG9wO1xuICAgICAgICAgICAgY29uc3QgbmV3VG9wID0gKHRvRW5kID8gMCA6IHByZXZpZXcuc2Nyb2xsVG9wKSArIGRpcmVjdGlvbiAqICh0b0VuZCA/IHByZXZpZXcuc2Nyb2xsSGVpZ2h0IDogcHJldmlldy5jbGllbnRIZWlnaHQpO1xuICAgICAgICAgICAgcHJldmlldy5zY3JvbGxUb3AgPSBuZXdUb3A7XG4gICAgICAgICAgICBpZiAoIXRvRW5kKSB7XG4gICAgICAgICAgICAgICAgLy8gUGFnaW5nIHBhc3QgdGhlIGJlZ2lubmluZyBvciBlbmRcbiAgICAgICAgICAgICAgICBpZiAobmV3VG9wID49IHByZXZpZXcuc2Nyb2xsSGVpZ2h0KSB7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMub25BcnJvd0Rvd24oZXZlbnQpO1xuICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAobmV3VG9wIDwgMCkge1xuICAgICAgICAgICAgICAgICAgICBpZiAob2xkVG9wID4gMCkgcHJldmlldy5zY3JvbGxUb3AgPSAwOyBlbHNlIHRoaXMub25BcnJvd1VwKGV2ZW50KTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBpZiAoIWF1dG9QcmV2aWV3KSB7IGF1dG9QcmV2aWV3ID0gdHJ1ZTsgdGhpcy5zaG93UG9wb3ZlcigpOyB9XG4gICAgICAgICAgICAvLyBObyBwcmV2aWV3LCBqdXN0IGdvIHRvIG5leHQgb3IgcHJldmlvdXMgaXRlbVxuICAgICAgICAgICAgZWxzZSBpZiAoZGlyZWN0aW9uID4gMCkgdGhpcy5vbkFycm93RG93bihldmVudCk7IGVsc2UgdGhpcy5vbkFycm93VXAoZXZlbnQpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgZG9SZW5hbWUoKSB7XG4gICAgICAgIGNvbnN0IGZpbGUgPSB0aGlzLmN1cnJlbnRGaWxlKClcbiAgICAgICAgaWYgKGZpbGUpIHRoaXMuYXBwLmZpbGVNYW5hZ2VyLnByb21wdEZvckZpbGVSZW5hbWUoZmlsZSk7XG4gICAgfVxuXG4gICAgZG9Nb3ZlKCkge1xuICAgICAgICBjb25zdCBleHBsb3JlclBsdWdpbiA9IHRoaXMuYXBwLmludGVybmFsUGx1Z2lucy5wbHVnaW5zW1wiZmlsZS1leHBsb3JlclwiXTtcbiAgICAgICAgaWYgKCFleHBsb3JlclBsdWdpbi5lbmFibGVkKSB7XG4gICAgICAgICAgICBuZXcgTm90aWNlKFwiRmlsZSBleHBsb3JlciBjb3JlIHBsdWdpbiBtdXN0IGJlIGVuYWJsZWQgdG8gbW92ZSBmaWxlcyBvciBmb2xkZXJzXCIpO1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG4gICAgICAgIGNvbnN0IG1vZGFsID0gZXhwbG9yZXJQbHVnaW4uaW5zdGFuY2UubW92ZUZpbGVNb2RhbDtcbiAgICAgICAgbW9kYWwuc2V0Q3VycmVudEZpbGUodGhpcy5jdXJyZW50RmlsZSgpKTtcbiAgICAgICAgbW9kYWwub3BlbigpXG4gICAgfVxuXG4gICAgY3VycmVudEl0ZW0oKSB7XG4gICAgICAgIHJldHVybiB0aGlzLml0ZW1zW3RoaXMuc2VsZWN0ZWRdO1xuICAgIH1cblxuICAgIGN1cnJlbnRGaWxlKCkge1xuICAgICAgICByZXR1cm4gdGhpcy5maWxlRm9yRG9tKHRoaXMuY3VycmVudEl0ZW0oKT8uZG9tKVxuICAgIH1cblxuICAgIGZpbGVGb3JEb20odGFyZ2V0RWw6IEhUTUxEaXZFbGVtZW50KSB7XG4gICAgICAgIGNvbnN0IHsgZmlsZVBhdGggfSA9IHRhcmdldEVsPy5kYXRhc2V0O1xuICAgICAgICBpZiAoZmlsZVBhdGgpIHJldHVybiB0aGlzLmFwcC52YXVsdC5nZXRBYnN0cmFjdEZpbGVCeVBhdGgoZmlsZVBhdGgpO1xuICAgIH1cblxuICAgIGl0ZW1Gb3JQYXRoKGZpbGVQYXRoOiBzdHJpbmcpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuaXRlbXMuZmluZEluZGV4KGkgPT4gaS5kb20uZGF0YXNldC5maWxlUGF0aCA9PT0gZmlsZVBhdGgpO1xuICAgIH1cblxuICAgIG9wZW5CcmVhZGNydW1iKGVsZW1lbnQ6IEVsZW1lbnQpIHtcbiAgICAgICAgaWYgKGVsZW1lbnQgJiYgdGhpcy5yb290TWVudSgpID09PSB0aGlzKSB7XG4gICAgICAgICAgICBjb25zdCBwcmV2RXhwbG9yYWJsZSA9IHRoaXMub3BlbmVyLnByZXZpb3VzRWxlbWVudFNpYmxpbmc7XG4gICAgICAgICAgICB0aGlzLmhpZGUoKTtcbiAgICAgICAgICAgIChlbGVtZW50IGFzIEhUTUxEaXZFbGVtZW50KS5jbGljaygpXG4gICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBvbkFycm93UmlnaHQoKTogYm9vbGVhbiB8IHVuZGVmaW5lZCB7XG4gICAgICAgIGNvbnN0IGZpbGUgPSB0aGlzLmN1cnJlbnRGaWxlKCk7XG4gICAgICAgIGlmIChmaWxlIGluc3RhbmNlb2YgVEZvbGRlciAmJiBmaWxlICE9PSB0aGlzLnNlbGVjdGVkRmlsZSkge1xuICAgICAgICAgICAgdGhpcy5vbkNsaWNrRmlsZShmaWxlLCB0aGlzLmN1cnJlbnRJdGVtKCkuZG9tKTtcbiAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gdGhpcy5vcGVuQnJlYWRjcnVtYih0aGlzLm9wZW5lcj8ubmV4dEVsZW1lbnRTaWJsaW5nKTtcbiAgICB9XG5cbiAgICBsb2FkRmlsZXMoZm9sZGVyOiBURm9sZGVyLCBzZWxlY3RlZEZpbGU/OiBUQWJzdHJhY3RGaWxlKSB7XG4gICAgICAgIHRoaXMuZG9tLmVtcHR5KCk7IHRoaXMuaXRlbXMgPSBbXTtcbiAgICAgICAgY29uc3QgYWxsRmlsZXMgPSB0aGlzLmFwcC52YXVsdC5nZXRDb25maWcoXCJzaG93VW5zdXBwb3J0ZWRGaWxlc1wiKTtcbiAgICAgICAgY29uc3Qge2NoaWxkcmVuLCBwYXJlbnR9ID0gZm9sZGVyO1xuICAgICAgICBjb25zdCBpdGVtcyA9IGNoaWxkcmVuLnNsaWNlKCkuc29ydCgoYTogVEFic3RyYWN0RmlsZSwgYjogVEFic3RyYWN0RmlsZSkgPT4gYWxwaGFTb3J0KGEubmFtZSwgYi5uYW1lKSlcbiAgICAgICAgY29uc3QgZm9sZGVycyA9IGl0ZW1zLmZpbHRlcihmID0+IGYgaW5zdGFuY2VvZiBURm9sZGVyKSBhcyBURm9sZGVyW107XG4gICAgICAgIGNvbnN0IGZpbGVzICAgPSBpdGVtcy5maWx0ZXIoZiA9PiBmIGluc3RhbmNlb2YgVEZpbGUgJiYgKGFsbEZpbGVzIHx8IHRoaXMuZmlsZUljb24oZikpKSBhcyBURmlsZVtdO1xuICAgICAgICBmb2xkZXJzLnNvcnQoKGEsIGIpID0+IGFscGhhU29ydChhLm5hbWUsIGIubmFtZSkpO1xuICAgICAgICBmaWxlcy5zb3J0KChhLCBiKSA9PiBhbHBoYVNvcnQoYS5iYXNlbmFtZSwgYi5iYXNlbmFtZSkpO1xuICAgICAgICBpZiAocGFyZW50KSBmb2xkZXJzLnVuc2hpZnQocGFyZW50KTtcbiAgICAgICAgZm9sZGVycy5tYXAodGhpcy5hZGRGaWxlLCB0aGlzKTtcbiAgICAgICAgaWYgKGZvbGRlcnMubGVuZ3RoICYmIGZpbGVzLmxlbmd0aCkgdGhpcy5hZGRTZXBhcmF0b3IoKTtcbiAgICAgICAgZmlsZXMubWFwKCAgdGhpcy5hZGRGaWxlLCB0aGlzKTtcbiAgICAgICAgaWYgKHNlbGVjdGVkRmlsZSkgdGhpcy5zZWxlY3QodGhpcy5pdGVtRm9yUGF0aChzZWxlY3RlZEZpbGUucGF0aCkpOyBlbHNlIHRoaXMuc2VsZWN0ZWQgPSAtMTtcbiAgICB9XG5cbiAgICBmaWxlSWNvbihmaWxlOiBUQWJzdHJhY3RGaWxlKSB7XG4gICAgICAgIGlmIChmaWxlIGluc3RhbmNlb2YgVEZvbGRlcikgcmV0dXJuIFwiZm9sZGVyXCI7XG4gICAgICAgIGlmIChmaWxlIGluc3RhbmNlb2YgVEZpbGUpIHtcbiAgICAgICAgICAgIGNvbnN0IHZpZXdUeXBlID0gdGhpcy5hcHAudmlld1JlZ2lzdHJ5LmdldFR5cGVCeUV4dGVuc2lvbihmaWxlLmV4dGVuc2lvbik7XG4gICAgICAgICAgICBpZiAodmlld1R5cGUpIHJldHVybiB2aWV3dHlwZUljb25zW3ZpZXdUeXBlXSA/PyBcImRvY3VtZW50XCI7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBmaWxlQ291bnQ6IChmaWxlOiBUQWJzdHJhY3RGaWxlKSA9PiBudW1iZXIgPSAoZmlsZTogVEFic3RyYWN0RmlsZSkgPT4gKFxuICAgICAgICBmaWxlIGluc3RhbmNlb2YgVEZvbGRlciA/IGZpbGUuY2hpbGRyZW4ubWFwKHRoaXMuZmlsZUNvdW50KS5yZWR1Y2UoKGEsYikgPT4gYStiLCAwKSA6ICh0aGlzLmZpbGVJY29uKGZpbGUpID8gMSA6IDApXG4gICAgKVxuXG4gICAgYWRkRmlsZShmaWxlOiBUQWJzdHJhY3RGaWxlKSB7XG4gICAgICAgIGNvbnN0IGljb24gPSB0aGlzLmZpbGVJY29uKGZpbGUpO1xuICAgICAgICB0aGlzLmFkZEl0ZW0oaSA9PiB7XG4gICAgICAgICAgICBpLnNldFRpdGxlKChmaWxlID09PSB0aGlzLmZvbGRlci5wYXJlbnQpID8gXCIuLlwiIDogZmlsZS5uYW1lKTtcbiAgICAgICAgICAgIGkuZG9tLmRhdGFzZXQuZmlsZVBhdGggPSBmaWxlLnBhdGg7XG4gICAgICAgICAgICBpLmRvbS5zZXRBdHRyKFwiZHJhZ2dhYmxlXCIsIFwidHJ1ZVwiKTtcbiAgICAgICAgICAgIGkuZG9tLmFkZENsYXNzIChmaWxlIGluc3RhbmNlb2YgVEZvbGRlciA/IFwiaXMtcWUtZm9sZGVyXCIgOiBcImlzLXFlLWZpbGVcIik7XG4gICAgICAgICAgICBpZiAoaWNvbikgaS5zZXRJY29uKGljb24pO1xuICAgICAgICAgICAgaWYgKGZpbGUgaW5zdGFuY2VvZiBURmlsZSkge1xuICAgICAgICAgICAgICAgIGkuc2V0VGl0bGUoZmlsZS5iYXNlbmFtZSk7XG4gICAgICAgICAgICAgICAgaWYgKGZpbGUuZXh0ZW5zaW9uICE9PSBcIm1kXCIpIGkuZG9tLmNyZWF0ZURpdih7dGV4dDogZmlsZS5leHRlbnNpb24sIGNsczogW1wibmF2LWZpbGUtdGFnXCIsXCJxZS1leHRlbnNpb25cIl19KTtcbiAgICAgICAgICAgIH0gZWxzZSBpZiAoZmlsZSAhPT0gdGhpcy5mb2xkZXIucGFyZW50KSB7XG4gICAgICAgICAgICAgICAgY29uc3QgY291bnQgPSB0aGlzLmZpbGVDb3VudChmaWxlKTtcbiAgICAgICAgICAgICAgICBpZiAoY291bnQpIGkuZG9tLmNyZWF0ZURpdih7dGV4dDogXCJcIitjb3VudCwgY2xzOiBcIm5hdi1maWxlLXRhZyBxZS1maWxlLWNvdW50XCJ9KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGkub25DbGljayhlID0+IHRoaXMub25DbGlja0ZpbGUoZmlsZSwgaS5kb20sIGUpKVxuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICB0b2dnbGVQcmV2aWV3TW9kZSgpIHtcbiAgICAgICAgaWYgKGF1dG9QcmV2aWV3ID0gIWF1dG9QcmV2aWV3KSB0aGlzLnNob3dQb3BvdmVyKCk7IGVsc2UgdGhpcy5oaWRlUG9wb3ZlcigpO1xuICAgIH1cblxuICAgIG9ubG9hZCgpIHtcbiAgICAgICAgc3VwZXIub25sb2FkKCk7XG4gICAgICAgIHRoaXMucmVnaXN0ZXJFdmVudCh0aGlzLmFwcC52YXVsdC5vbihcInJlbmFtZVwiLCAoZmlsZSwgb2xkUGF0aCkgPT4ge1xuICAgICAgICAgICAgaWYgKHRoaXMuZm9sZGVyID09PSBmaWxlLnBhcmVudCkge1xuICAgICAgICAgICAgICAgIC8vIERlc3RpbmF0aW9uIHdhcyBoZXJlOyByZWZyZXNoIHRoZSBsaXN0XG4gICAgICAgICAgICAgICAgY29uc3Qgc2VsZWN0ZWRGaWxlID0gdGhpcy5pdGVtRm9yUGF0aChvbGRQYXRoKSA+PSAwID8gZmlsZSA6IHRoaXMuY3VycmVudEZpbGUoKTtcbiAgICAgICAgICAgICAgICB0aGlzLmxvYWRGaWxlcyh0aGlzLmZvbGRlciwgc2VsZWN0ZWRGaWxlKTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgLy8gUmVtb3ZlIGl0IGlmIGl0IHdhcyBtb3ZlZCBvdXQgb2YgaGVyZVxuICAgICAgICAgICAgICAgIHRoaXMucmVtb3ZlSXRlbUZvclBhdGgob2xkUGF0aCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pKTtcbiAgICAgICAgdGhpcy5yZWdpc3RlckV2ZW50KHRoaXMuYXBwLnZhdWx0Lm9uKFwiZGVsZXRlXCIsIGZpbGUgPT4gdGhpcy5yZW1vdmVJdGVtRm9yUGF0aChmaWxlLnBhdGgpKSk7XG5cbiAgICAgICAgLy8gQWN0aXZhdGUgcHJldmlldyBpbW1lZGlhdGVseSBpZiBhcHBsaWNhYmxlXG4gICAgICAgIGlmIChhdXRvUHJldmlldyAmJiB0aGlzLnNlbGVjdGVkICE9IC0xKSB0aGlzLnNob3dQb3BvdmVyKCk7XG4gICAgfVxuXG4gICAgcmVtb3ZlSXRlbUZvclBhdGgocGF0aDogc3RyaW5nKSB7XG4gICAgICAgIGNvbnN0IHBvc24gPSB0aGlzLml0ZW1Gb3JQYXRoKHBhdGgpO1xuICAgICAgICBpZiAocG9zbiA8IDApIHJldHVybjtcbiAgICAgICAgY29uc3QgaXRlbSA9IHRoaXMuaXRlbXNbcG9zbl07XG4gICAgICAgIGlmICh0aGlzLnNlbGVjdGVkID4gcG9zbikgdGhpcy5zZWxlY3RlZCAtPSAxO1xuICAgICAgICBpdGVtLmRvbS5kZXRhY2goKVxuICAgICAgICB0aGlzLml0ZW1zLnJlbW92ZShpdGVtKTtcbiAgICB9XG5cbiAgICBvbkVzY2FwZSgpIHtcbiAgICAgICAgc3VwZXIub25Fc2NhcGUoKTtcbiAgICAgICAgaWYgKHRoaXMucGFyZW50IGluc3RhbmNlb2YgUG9wdXBNZW51KSB0aGlzLnBhcmVudC5vbkVzY2FwZSgpO1xuICAgIH1cblxuICAgIGhpZGUoKSB7XG4gICAgICAgIHRoaXMuaGlkZVBvcG92ZXIoKTtcbiAgICAgICAgcmV0dXJuIHN1cGVyLmhpZGUoKTtcbiAgICB9XG5cbiAgICBzZXRDaGlsZE1lbnUobWVudTogUG9wdXBNZW51KSB7XG4gICAgICAgIHN1cGVyLnNldENoaWxkTWVudShtZW51KTtcbiAgICAgICAgaWYgKGF1dG9QcmV2aWV3ICYmIHRoaXMuY2FuU2hvd1BvcG92ZXIoKSkgdGhpcy5zaG93UG9wb3ZlcigpO1xuICAgIH1cblxuICAgIHNlbGVjdChpZHg6IG51bWJlciwgc2Nyb2xsID0gdHJ1ZSkge1xuICAgICAgICBjb25zdCBvbGQgPSB0aGlzLnNlbGVjdGVkO1xuICAgICAgICBzdXBlci5zZWxlY3QoaWR4LCBzY3JvbGwpO1xuICAgICAgICBpZiAob2xkICE9PSB0aGlzLnNlbGVjdGVkKSB7XG4gICAgICAgICAgICAvLyBzZWxlY3RlZCBpdGVtIGNoYW5nZWQ7IHRyaWdnZXIgbmV3IHBvcG92ZXIgb3IgaGlkZSB0aGUgb2xkIG9uZVxuICAgICAgICAgICAgaWYgKGF1dG9QcmV2aWV3KSB0aGlzLnNob3dQb3BvdmVyKCk7IGVsc2UgdGhpcy5oaWRlUG9wb3ZlcigpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgaGlkZVBvcG92ZXIoKSB7XG4gICAgICAgIHRoaXMuaG92ZXJQb3BvdmVyPy5oaWRlKCk7XG4gICAgfVxuXG4gICAgY2FuU2hvd1BvcG92ZXIoKSB7XG4gICAgICAgIHJldHVybiAhdGhpcy5jaGlsZCAmJiB0aGlzLnZpc2libGU7XG4gICAgfVxuXG4gICAgc2hvd1BvcG92ZXIgPSBkZWJvdW5jZSgoKSA9PiB7XG4gICAgICAgIHRoaXMuaGlkZVBvcG92ZXIoKTtcbiAgICAgICAgaWYgKCFhdXRvUHJldmlldykgcmV0dXJuO1xuICAgICAgICB0aGlzLm1heWJlSG92ZXIodGhpcy5jdXJyZW50SXRlbSgpPy5kb20sIGZpbGUgPT4gdGhpcy5hcHAud29ya3NwYWNlLnRyaWdnZXIoJ2xpbmstaG92ZXInLCB0aGlzLCBudWxsLCBmaWxlLnBhdGgsIFwiXCIpKTtcbiAgICB9LCA1MCwgdHJ1ZSlcblxuICAgIG9uSXRlbUhvdmVyID0gKGV2ZW50OiBNb3VzZUV2ZW50LCB0YXJnZXRFbDogSFRNTERpdkVsZW1lbnQpID0+IHtcbiAgICAgICAgaWYgKCFhdXRvUHJldmlldykgdGhpcy5tYXliZUhvdmVyKHRhcmdldEVsLCBmaWxlID0+IHRoaXMuYXBwLndvcmtzcGFjZS50cmlnZ2VyKCdob3Zlci1saW5rJywge1xuICAgICAgICAgICAgZXZlbnQsIHNvdXJjZTogaG92ZXJTb3VyY2UsIGhvdmVyUGFyZW50OiB0aGlzLCB0YXJnZXRFbCwgbGlua3RleHQ6IGZpbGUucGF0aFxuICAgICAgICB9KSk7XG4gICAgfVxuXG4gICAgbWF5YmVIb3Zlcih0YXJnZXRFbDogSFRNTERpdkVsZW1lbnQsIGNiOiAoZmlsZTogVEZpbGUpID0+IHZvaWQpIHtcbiAgICAgICAgaWYgKCF0aGlzLmNhblNob3dQb3BvdmVyKCkpIHJldHVybjtcbiAgICAgICAgbGV0IGZpbGUgPSB0aGlzLmZpbGVGb3JEb20odGFyZ2V0RWwpXG4gICAgICAgIGlmIChmaWxlIGluc3RhbmNlb2YgVEZvbGRlcikgZmlsZSA9IHRoaXMuZm9sZGVyTm90ZShmaWxlKTtcbiAgICAgICAgaWYgKGZpbGUgaW5zdGFuY2VvZiBURmlsZSAmJiBwcmV2aWV3SWNvbnNbdGhpcy5hcHAudmlld1JlZ2lzdHJ5LmdldFR5cGVCeUV4dGVuc2lvbihmaWxlLmV4dGVuc2lvbildKSB7XG4gICAgICAgICAgICBjYihmaWxlKVxuICAgICAgICB9O1xuICAgIH1cblxuICAgIGZvbGRlck5vdGUoZm9sZGVyOiBURm9sZGVyKSB7XG4gICAgICAgIHJldHVybiB0aGlzLmFwcC52YXVsdC5nZXRBYnN0cmFjdEZpbGVCeVBhdGgodGhpcy5mb2xkZXJOb3RlUGF0aChmb2xkZXIpKTtcbiAgICB9XG5cbiAgICBmb2xkZXJOb3RlUGF0aChmb2xkZXI6IFRGb2xkZXIpIHtcbiAgICAgICAgcmV0dXJuIGAke2ZvbGRlci5wYXRofS8ke2ZvbGRlci5uYW1lfS5tZGA7XG4gICAgfVxuXG5cbiAgICBfcG9wb3ZlcjogSG92ZXJQYXJlbnRbXCJob3ZlclBvcG92ZXJcIl07XG5cbiAgICBnZXQgaG92ZXJQb3BvdmVyKCkgeyByZXR1cm4gdGhpcy5fcG9wb3ZlcjsgfVxuXG4gICAgc2V0IGhvdmVyUG9wb3Zlcihwb3BvdmVyKSB7XG4gICAgICAgIGlmIChwb3BvdmVyICYmICF0aGlzLmNhblNob3dQb3BvdmVyKCkpIHsgcG9wb3Zlci5oaWRlKCk7IHJldHVybjsgfVxuICAgICAgICB0aGlzLl9wb3BvdmVyID0gcG9wb3ZlcjtcbiAgICAgICAgaWYgKGF1dG9QcmV2aWV3ICYmIHBvcG92ZXIgJiYgdGhpcy5jdXJyZW50SXRlbSgpKSB7XG4gICAgICAgICAgICAvLyBQb3NpdGlvbiB0aGUgcG9wb3ZlciBzbyBpdCBkb2Vzbid0IG92ZXJsYXAgdGhlIG1lbnUgaG9yaXpvbnRhbGx5IChhcyBsb25nIGFzIGl0IGZpdHMpXG4gICAgICAgICAgICAvLyBhbmQgc28gdGhhdCBpdHMgdmVydGljYWwgcG9zaXRpb24gb3ZlcmxhcHMgdGhlIHNlbGVjdGVkIG1lbnUgaXRlbSAocGxhY2luZyB0aGUgdG9wIGFcbiAgICAgICAgICAgIC8vIGJpdCBhYm92ZSB0aGUgY3VycmVudCBpdGVtLCB1bmxlc3MgaXQgd291bGQgZ28gb2ZmIHRoZSBib3R0b20gb2YgdGhlIHNjcmVlbilcbiAgICAgICAgICAgIGNvbnN0IGhvdmVyRWwgPSBwb3BvdmVyLmhvdmVyRWw7XG4gICAgICAgICAgICBob3ZlckVsLnNob3coKTtcbiAgICAgICAgICAgIGNvbnN0XG4gICAgICAgICAgICAgICAgbWVudSA9IHRoaXMuZG9tLmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpLFxuICAgICAgICAgICAgICAgIHNlbGVjdGVkID0gdGhpcy5jdXJyZW50SXRlbSgpLmRvbS5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKSxcbiAgICAgICAgICAgICAgICBjb250YWluZXIgPSBob3ZlckVsLm9mZnNldFBhcmVudCB8fCBkb2N1bWVudC5kb2N1bWVudEVsZW1lbnQsXG4gICAgICAgICAgICAgICAgcG9wdXBIZWlnaHQgPSBob3ZlckVsLm9mZnNldEhlaWdodCxcbiAgICAgICAgICAgICAgICBsZWZ0ID0gTWF0aC5taW4obWVudS5yaWdodCArIDIsIGNvbnRhaW5lci5jbGllbnRXaWR0aCAtIGhvdmVyRWwub2Zmc2V0V2lkdGgpLFxuICAgICAgICAgICAgICAgIHRvcCA9IE1hdGgubWluKE1hdGgubWF4KDAsIHNlbGVjdGVkLnRvcCAtIHBvcHVwSGVpZ2h0LzgpLCBjb250YWluZXIuY2xpZW50SGVpZ2h0IC0gcG9wdXBIZWlnaHQpXG4gICAgICAgICAgICA7XG4gICAgICAgICAgICBob3ZlckVsLnN0eWxlLnRvcCA9IHRvcCArIFwicHhcIjtcbiAgICAgICAgICAgIGhvdmVyRWwuc3R5bGUubGVmdCA9IGxlZnQgKyBcInB4XCI7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBvbkl0ZW1DbGljayA9IChldmVudDogTW91c2VFdmVudCwgdGFyZ2V0OiBIVE1MRGl2RWxlbWVudCkgPT4ge1xuICAgICAgICBjb25zdCBmaWxlID0gdGhpcy5maWxlRm9yRG9tKHRhcmdldCk7XG4gICAgICAgIGlmICghZmlsZSkgcmV0dXJuO1xuICAgICAgICBpZiAoIXRoaXMub25DbGlja0ZpbGUoZmlsZSwgdGFyZ2V0LCBldmVudCkpIHtcbiAgICAgICAgICAgIC8vIEtlZXAgY3VycmVudCBtZW51IHRyZWUgb3BlblxuICAgICAgICAgICAgZXZlbnQuc3RvcFByb3BhZ2F0aW9uKCk7XG4gICAgICAgICAgICBldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgb25DbGlja0ZpbGUoZmlsZTogVEFic3RyYWN0RmlsZSwgdGFyZ2V0OiBIVE1MRGl2RWxlbWVudCwgZXZlbnQ/OiBNb3VzZUV2ZW50fEtleWJvYXJkRXZlbnQpIHtcbiAgICAgICAgdGhpcy5oaWRlUG9wb3ZlcigpO1xuICAgICAgICBjb25zdCBpZHggPSB0aGlzLml0ZW1Gb3JQYXRoKGZpbGUucGF0aCk7XG4gICAgICAgIGlmIChpZHggPj0gMCAmJiB0aGlzLnNlbGVjdGVkICE9IGlkeCkgdGhpcy5zZWxlY3QoaWR4KTtcblxuICAgICAgICBpZiAoZmlsZSBpbnN0YW5jZW9mIFRGaWxlKSB7XG4gICAgICAgICAgICBpZiAodGhpcy5hcHAudmlld1JlZ2lzdHJ5LmlzRXh0ZW5zaW9uUmVnaXN0ZXJlZChmaWxlLmV4dGVuc2lvbikpIHtcbiAgICAgICAgICAgICAgICB0aGlzLmFwcC53b3Jrc3BhY2Uub3BlbkxpbmtUZXh0KGZpbGUucGF0aCwgXCJcIiwgZXZlbnQgJiYgS2V5bWFwLmlzTW9kaWZpZXIoZXZlbnQsIFwiTW9kXCIpKTtcbiAgICAgICAgICAgICAgICAvLyBDbG9zZSB0aGUgZW50aXJlIG1lbnUgdHJlZVxuICAgICAgICAgICAgICAgIHRoaXMucm9vdE1lbnUoKS5oaWRlKCk7XG4gICAgICAgICAgICAgICAgZXZlbnQ/LnN0b3BQcm9wYWdhdGlvbigpO1xuICAgICAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBuZXcgTm90aWNlKGAuJHtmaWxlLmV4dGVuc2lvbn0gZmlsZXMgY2Fubm90IGJlIG9wZW5lZCBpbiBPYnNpZGlhbjsgVXNlIFwiT3BlbiBpbiBEZWZhdWx0IEFwcFwiIHRvIG9wZW4gdGhlbSBleHRlcm5hbGx5YCk7XG4gICAgICAgICAgICAgICAgLy8gZmFsbCB0aHJvdWdoXG4gICAgICAgICAgICB9XG4gICAgICAgIH0gZWxzZSBpZiAoZmlsZSA9PT0gdGhpcy5wYXJlbnRGb2xkZXIpIHtcbiAgICAgICAgICAgIC8vIFdlJ3JlIGEgY2hpbGQgbWVudSBhbmQgc2VsZWN0ZWQgXCIuLlwiOiBqdXN0IHJldHVybiB0byBwcmV2aW91cyBtZW51XG4gICAgICAgICAgICB0aGlzLmhpZGUoKTtcbiAgICAgICAgfSBlbHNlIGlmIChmaWxlID09PSB0aGlzLmZvbGRlci5wYXJlbnQpIHtcbiAgICAgICAgICAgIC8vIE5vdCBhIGNoaWxkIG1lbnUsIGJ1dCBzZWxlY3RlZCBcIi4uXCI6IGdvIHRvIHByZXZpb3VzIGJyZWFkY3J1bWJcbiAgICAgICAgICAgIHRoaXMub25BcnJvd0xlZnQoKTtcbiAgICAgICAgfSBlbHNlIGlmIChmaWxlID09PSB0aGlzLnNlbGVjdGVkRmlsZSkge1xuICAgICAgICAgICAgLy8gVGFyZ2V0aW5nIHRoZSBpbml0aWFsbHktc2VsZWN0ZWQgc3ViZm9sZGVyOiBnbyB0byBuZXh0IGJyZWFkY3J1bWJcbiAgICAgICAgICAgIHRoaXMub3BlbkJyZWFkY3J1bWIodGhpcy5vcGVuZXI/Lm5leHRFbGVtZW50U2libGluZyk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAvLyBPdGhlcndpc2UsIHBvcCBhIG5ldyBtZW51IGZvciB0aGUgc3ViZm9sZGVyXG4gICAgICAgICAgICBjb25zdCBmb2xkZXJNZW51ID0gbmV3IEZvbGRlck1lbnUodGhpcywgZmlsZSBhcyBURm9sZGVyLCB0aGlzLmZvbGRlck5vdGUoZmlsZSBhcyBURm9sZGVyKSB8fCB0aGlzLmZvbGRlcik7XG4gICAgICAgICAgICBmb2xkZXJNZW51LmNhc2NhZGUodGFyZ2V0LCBldmVudCBpbnN0YW5jZW9mIE1vdXNlRXZlbnQgPyBldmVudCA6IHVuZGVmaW5lZCk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBvbkl0ZW1NZW51ID0gKGV2ZW50OiBNb3VzZUV2ZW50LCB0YXJnZXQ6IEhUTUxEaXZFbGVtZW50KSA9PiB7XG4gICAgICAgIGNvbnN0IGZpbGUgPSB0aGlzLmZpbGVGb3JEb20odGFyZ2V0KTtcbiAgICAgICAgaWYgKGZpbGUpIHtcbiAgICAgICAgICAgIGNvbnN0IGlkeCA9IHRoaXMuaXRlbUZvclBhdGgoZmlsZS5wYXRoKTtcbiAgICAgICAgICAgIGlmIChpZHggPj0gMCAmJiB0aGlzLnNlbGVjdGVkICE9IGlkeCkgdGhpcy5zZWxlY3QoaWR4KTtcbiAgICAgICAgICAgIG5ldyBDb250ZXh0TWVudSh0aGlzLCBmaWxlKS5jYXNjYWRlKHRhcmdldCwgZXZlbnQpO1xuICAgICAgICAgICAgLy8gS2VlcCBjdXJyZW50IG1lbnUgdHJlZSBvcGVuXG4gICAgICAgICAgICBldmVudC5zdG9wUHJvcGFnYXRpb24oKTtcbiAgICAgICAgfVxuICAgIH1cbn1cbiIsImltcG9ydCB7IEFwcCwgVEFic3RyYWN0RmlsZSwgVEZpbGUsIFRGb2xkZXIgfSBmcm9tIFwib2JzaWRpYW5cIjtcbmltcG9ydCB7IGxpc3QsIGVsIH0gZnJvbSBcInJlZG9tXCI7XG5pbXBvcnQgeyBDb250ZXh0TWVudSB9IGZyb20gXCIuL0NvbnRleHRNZW51XCI7XG5pbXBvcnQgeyBGb2xkZXJNZW51IH0gZnJvbSBcIi4vRm9sZGVyTWVudVwiO1xuXG5leHBvcnQgY29uc3QgaG92ZXJTb3VyY2UgPSBcInF1aWNrLWV4cGxvcmVyOmZvbGRlci1tZW51XCI7XG5cbmRlY2xhcmUgbW9kdWxlIFwib2JzaWRpYW5cIiB7XG4gICAgaW50ZXJmYWNlIEFwcCB7XG4gICAgICAgIGRyYWdNYW5hZ2VyOiBhbnlcbiAgICB9XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBzdGFydERyYWcoYXBwOiBBcHAsIHBhdGg6IHN0cmluZywgZXZlbnQ6IERyYWdFdmVudCkge1xuICAgIGlmICghcGF0aCB8fCBwYXRoID09PSBcIi9cIikgcmV0dXJuO1xuICAgIGNvbnN0IGZpbGUgPSBhcHAudmF1bHQuZ2V0QWJzdHJhY3RGaWxlQnlQYXRoKHBhdGgpO1xuICAgIGlmICghZmlsZSkgcmV0dXJuO1xuICAgIGNvbnN0IHsgZHJhZ01hbmFnZXIgfSA9IGFwcDtcbiAgICBjb25zdCBkcmFnRGF0YSA9IGZpbGUgaW5zdGFuY2VvZiBURmlsZSA/IGRyYWdNYW5hZ2VyLmRyYWdGaWxlKGV2ZW50LCBmaWxlKSA6IGRyYWdNYW5hZ2VyLmRyYWdGb2xkZXIoZXZlbnQsIGZpbGUpO1xuICAgIGRyYWdNYW5hZ2VyLm9uRHJhZ1N0YXJ0KGV2ZW50LCBkcmFnRGF0YSk7XG59XG5cbmNsYXNzIEV4cGxvcmFibGUge1xuICAgIGVsOiBIVE1MU3BhbkVsZW1lbnQgPSA8c3BhbiBkcmFnZ2FibGUgY2xhc3M9XCJleHBsb3JhYmxlIHRpdGxlYmFyLWJ1dHRvblwiIC8+XG4gICAgdXBkYXRlKGRhdGE6IHtmaWxlOiBUQWJzdHJhY3RGaWxlLCBwYXRoOiBzdHJpbmd9LCBpbmRleDogbnVtYmVyLCBpdGVtczogYW55W10pIHtcbiAgICAgICAgY29uc3Qge2ZpbGUsIHBhdGh9ID0gZGF0YTtcbiAgICAgICAgbGV0IG5hbWUgPSBmaWxlLm5hbWUgfHwgcGF0aDtcbiAgICAgICAgaWYgKGluZGV4IDwgaXRlbXMubGVuZ3RoLTEpIG5hbWUgKz0gXCJcXHUwMEEwL1xcdTAwQTBcIjtcbiAgICAgICAgdGhpcy5lbC50ZXh0Q29udGVudCA9IG5hbWU7XG4gICAgICAgIHRoaXMuZWwuZGF0YXNldC5wYXJlbnRQYXRoID0gZmlsZS5wYXJlbnQ/LnBhdGggPz8gXCIvXCI7XG4gICAgICAgIHRoaXMuZWwuZGF0YXNldC5maWxlUGF0aCA9IHBhdGg7XG4gICAgfVxufVxuXG5leHBvcnQgY2xhc3MgRXhwbG9yZXIge1xuICAgIGxhc3RGaWxlOiBUQWJzdHJhY3RGaWxlID0gbnVsbDtcbiAgICBsYXN0UGF0aDogc3RyaW5nID0gbnVsbDtcbiAgICBlbDogSFRNTEVsZW1lbnQgPSA8ZGl2IGlkPVwicXVpY2stZXhwbG9yZXJcIiAvPjtcbiAgICBsaXN0ID0gbGlzdCh0aGlzLmVsLCBFeHBsb3JhYmxlKTtcblxuICAgIGNvbnN0cnVjdG9yKHB1YmxpYyBhcHA6IEFwcCkge1xuICAgICAgICB0aGlzLmVsLm9uKFwiY29udGV4dG1lbnVcIiwgXCIuZXhwbG9yYWJsZVwiLCAoZXZlbnQsIHRhcmdldCkgPT4ge1xuICAgICAgICAgICAgY29uc3QgeyBmaWxlUGF0aCB9ID0gdGFyZ2V0LmRhdGFzZXQ7XG4gICAgICAgICAgICBjb25zdCBmaWxlID0gYXBwLnZhdWx0LmdldEFic3RyYWN0RmlsZUJ5UGF0aChmaWxlUGF0aCk7XG4gICAgICAgICAgICBuZXcgQ29udGV4dE1lbnUoYXBwLCBmaWxlKS5jYXNjYWRlKHRhcmdldCwgZXZlbnQpO1xuICAgICAgICB9KTtcbiAgICAgICAgdGhpcy5lbC5vbihcImNsaWNrXCIsIFwiLmV4cGxvcmFibGVcIiwgKGV2ZW50LCB0YXJnZXQpID0+IHtcbiAgICAgICAgICAgIHRoaXMuZm9sZGVyTWVudSh0YXJnZXQsIGV2ZW50LmlzVHJ1c3RlZCAmJiBldmVudCk7XG4gICAgICAgIH0pO1xuICAgICAgICB0aGlzLmVsLm9uKCdkcmFnc3RhcnQnLCBcIi5leHBsb3JhYmxlXCIsIChldmVudCwgdGFyZ2V0KSA9PiB7XG4gICAgICAgICAgICBzdGFydERyYWcoYXBwLCB0YXJnZXQuZGF0YXNldC5maWxlUGF0aCwgZXZlbnQpO1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBmb2xkZXJNZW51KG9wZW5lcjogSFRNTEVsZW1lbnQgPSB0aGlzLmVsLmZpcnN0RWxlbWVudENoaWxkIGFzIEhUTUxFbGVtZW50LCBldmVudD86IE1vdXNlRXZlbnQpIHtcbiAgICAgICAgY29uc3QgeyBmaWxlUGF0aCwgcGFyZW50UGF0aCB9ID0gb3BlbmVyLmRhdGFzZXRcbiAgICAgICAgY29uc3Qgc2VsZWN0ZWQgPSB0aGlzLmFwcC52YXVsdC5nZXRBYnN0cmFjdEZpbGVCeVBhdGgoZmlsZVBhdGgpO1xuICAgICAgICBjb25zdCBmb2xkZXIgPSB0aGlzLmFwcC52YXVsdC5nZXRBYnN0cmFjdEZpbGVCeVBhdGgocGFyZW50UGF0aCkgYXMgVEZvbGRlcjtcbiAgICAgICAgcmV0dXJuIG5ldyBGb2xkZXJNZW51KHRoaXMuYXBwLCBmb2xkZXIsIHNlbGVjdGVkLCBvcGVuZXIpLmNhc2NhZGUob3BlbmVyLCBldmVudCk7XG4gICAgfVxuXG4gICAgYnJvd3NlVmF1bHQoKSB7XG4gICAgICAgIHJldHVybiB0aGlzLmZvbGRlck1lbnUoKTtcbiAgICB9XG5cbiAgICBicm93c2VDdXJyZW50KCkge1xuICAgICAgICByZXR1cm4gdGhpcy5mb2xkZXJNZW51KHRoaXMuZWwubGFzdEVsZW1lbnRDaGlsZCBhcyBIVE1MRGl2RWxlbWVudCk7XG4gICAgfVxuXG4gICAgYnJvd3NlRmlsZShmaWxlOiBUQWJzdHJhY3RGaWxlKSB7XG4gICAgICAgIGlmIChmaWxlID09PSB0aGlzLmFwcC53b3Jrc3BhY2UuZ2V0QWN0aXZlRmlsZSgpKSByZXR1cm4gdGhpcy5icm93c2VDdXJyZW50KCk7XG4gICAgICAgIGxldCBtZW51OiBGb2xkZXJNZW51O1xuICAgICAgICBsZXQgb3BlbmVyOiBIVE1MRWxlbWVudCA9IHRoaXMuZWwuZmlyc3RFbGVtZW50Q2hpbGQgYXMgSFRNTEVsZW1lbnQ7XG4gICAgICAgIGNvbnN0IHBhdGggPSBbXSwgcGFydHMgPSBmaWxlLnBhdGguc3BsaXQoXCIvXCIpLmZpbHRlcihwPT5wKTtcbiAgICAgICAgd2hpbGUgKG9wZW5lciAmJiBwYXJ0cy5sZW5ndGgpIHtcbiAgICAgICAgICAgIHBhdGgucHVzaChwYXJ0c1swXSk7XG4gICAgICAgICAgICBpZiAob3BlbmVyLmRhdGFzZXQuZmlsZVBhdGggIT09IHBhdGguam9pbihcIi9cIikpIHtcbiAgICAgICAgICAgICAgICBtZW51ID0gdGhpcy5mb2xkZXJNZW51KG9wZW5lcik7XG4gICAgICAgICAgICAgICAgcGF0aC5wb3AoKTtcbiAgICAgICAgICAgICAgICBicmVha1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcGFydHMuc2hpZnQoKTtcbiAgICAgICAgICAgIG9wZW5lciA9IG9wZW5lci5uZXh0RWxlbWVudFNpYmxpbmcgYXMgSFRNTEVsZW1lbnQ7XG4gICAgICAgIH1cbiAgICAgICAgd2hpbGUgKG1lbnUgJiYgcGFydHMubGVuZ3RoKSB7XG4gICAgICAgICAgICBwYXRoLnB1c2gocGFydHMuc2hpZnQoKSk7XG4gICAgICAgICAgICBjb25zdCBpZHggPSBtZW51Lml0ZW1Gb3JQYXRoKHBhdGguam9pbihcIi9cIikpO1xuICAgICAgICAgICAgaWYgKGlkeCA9PSAtMSkgYnJlYWtcbiAgICAgICAgICAgIG1lbnUuc2VsZWN0KGlkeCk7XG4gICAgICAgICAgICBpZiAocGFydHMubGVuZ3RoIHx8IGZpbGUgaW5zdGFuY2VvZiBURm9sZGVyKSB7XG4gICAgICAgICAgICAgICAgbWVudS5vbkFycm93UmlnaHQoKTtcbiAgICAgICAgICAgICAgICBtZW51ID0gbWVudS5jaGlsZCBhcyBGb2xkZXJNZW51O1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHJldHVybiBtZW51O1xuICAgIH1cblxuICAgIHVwZGF0ZShmaWxlOiBUQWJzdHJhY3RGaWxlKSB7XG4gICAgICAgIGZpbGUgPz89IHRoaXMuYXBwLnZhdWx0LmdldEFic3RyYWN0RmlsZUJ5UGF0aChcIi9cIik7XG4gICAgICAgIGlmIChmaWxlID09IHRoaXMubGFzdEZpbGUgJiYgZmlsZS5wYXRoID09IHRoaXMubGFzdFBhdGgpIHJldHVybjtcbiAgICAgICAgdGhpcy5sYXN0RmlsZSA9IGZpbGU7XG4gICAgICAgIHRoaXMubGFzdFBhdGggPSBmaWxlLnBhdGg7XG4gICAgICAgIGNvbnN0IHBhcnRzID0gW107XG4gICAgICAgIHdoaWxlIChmaWxlKSB7XG4gICAgICAgICAgICBwYXJ0cy51bnNoaWZ0KHsgZmlsZSwgcGF0aDogZmlsZS5wYXRoIH0pO1xuICAgICAgICAgICAgZmlsZSA9IGZpbGUucGFyZW50O1xuICAgICAgICB9XG4gICAgICAgIGlmIChwYXJ0cy5sZW5ndGggPiAxKSBwYXJ0cy5zaGlmdCgpO1xuICAgICAgICB0aGlzLmxpc3QudXBkYXRlKHBhcnRzKTtcbiAgICB9XG5cbn1cbiIsImltcG9ydCB7TWVudUl0ZW0sIFBsdWdpbiwgVEFic3RyYWN0RmlsZSwgVEZvbGRlcn0gZnJvbSBcIm9ic2lkaWFuXCI7XG5pbXBvcnQge21vdW50LCB1bm1vdW50fSBmcm9tIFwicmVkb21cIjtcbmltcG9ydCB7RXhwbG9yZXIsIGhvdmVyU291cmNlfSBmcm9tIFwiLi9FeHBsb3JlclwiO1xuXG5pbXBvcnQgXCIuL3JlZG9tLWpzeFwiO1xuaW1wb3J0IFwiLi9zdHlsZXMuc2Nzc1wiXG5cbmRlY2xhcmUgbW9kdWxlIFwib2JzaWRpYW5cIiB7XG4gICAgaW50ZXJmYWNlIFdvcmtzcGFjZSB7XG4gICAgICAgIHJlZ2lzdGVySG92ZXJMaW5rU291cmNlKHNvdXJjZTogc3RyaW5nLCBpbmZvOiB7ZGlzcGxheTogc3RyaW5nLCBkZWZhdWx0TW9kPzogYm9vbGVhbn0pOiB2b2lkXG4gICAgICAgIHVucmVnaXN0ZXJIb3ZlckxpbmtTb3VyY2Uoc291cmNlOiBzdHJpbmcpOiB2b2lkXG4gICAgfVxufVxuXG5leHBvcnQgZGVmYXVsdCBjbGFzcyBleHRlbmRzIFBsdWdpbiB7XG4gICAgc3RhdHVzYmFySXRlbTogSFRNTEVsZW1lbnRcbiAgICBleHBsb3JlcjogRXhwbG9yZXJcblxuICAgIG9ubG9hZCgpIHtcbiAgICAgICAgdGhpcy5hcHAud29ya3NwYWNlLm9uTGF5b3V0UmVhZHkoICgpID0+IHtcbiAgICAgICAgICAgIGNvbnN0IGJ1dHRvbkNvbnRhaW5lciA9IGRvY3VtZW50LmJvZHkuZmluZChcIi50aXRsZWJhciAudGl0bGViYXItYnV0dG9uLWNvbnRhaW5lci5tb2QtbGVmdFwiKTtcbiAgICAgICAgICAgIHRoaXMucmVnaXN0ZXIoKCkgPT4gdW5tb3VudChidXR0b25Db250YWluZXIsIHRoaXMuZXhwbG9yZXIpKTtcbiAgICAgICAgICAgIG1vdW50KGJ1dHRvbkNvbnRhaW5lciwgdGhpcy5leHBsb3JlciA9IG5ldyBFeHBsb3Jlcih0aGlzLmFwcCkpO1xuICAgICAgICAgICAgdGhpcy5leHBsb3Jlci51cGRhdGUodGhpcy5hcHAud29ya3NwYWNlLmdldEFjdGl2ZUZpbGUoKSlcbiAgICAgICAgICAgIHRoaXMucmVnaXN0ZXJFdmVudCh0aGlzLmFwcC53b3Jrc3BhY2Uub24oXCJmaWxlLW9wZW5cIiwgdGhpcy5leHBsb3Jlci51cGRhdGUsIHRoaXMuZXhwbG9yZXIpKTtcbiAgICAgICAgICAgIHRoaXMucmVnaXN0ZXJFdmVudCh0aGlzLmFwcC52YXVsdC5vbihcInJlbmFtZVwiLCB0aGlzLm9uRmlsZUNoYW5nZSwgdGhpcykpO1xuICAgICAgICAgICAgdGhpcy5yZWdpc3RlckV2ZW50KHRoaXMuYXBwLnZhdWx0Lm9uKFwiZGVsZXRlXCIsIHRoaXMub25GaWxlQ2hhbmdlLCB0aGlzKSk7XG4gICAgICAgIH0pO1xuICAgICAgICB0aGlzLmFwcC53b3Jrc3BhY2UucmVnaXN0ZXJIb3ZlckxpbmtTb3VyY2UoaG92ZXJTb3VyY2UsIHtcbiAgICAgICAgICAgIGRpc3BsYXk6ICdRdWljayBFeHBsb3JlcicsIGRlZmF1bHRNb2Q6IHRydWVcbiAgICAgICAgfSk7XG5cbiAgICAgICAgdGhpcy5hZGRDb21tYW5kKHsgaWQ6IFwiYnJvd3NlLXZhdWx0XCIsICAgbmFtZTogXCJCcm93c2UgdmF1bHRcIiwgICAgICAgICAgY2FsbGJhY2s6ICgpID0+IHsgdGhpcy5leHBsb3Jlcj8uYnJvd3NlVmF1bHQoKTsgfSwgfSk7XG4gICAgICAgIHRoaXMuYWRkQ29tbWFuZCh7IGlkOiBcImJyb3dzZS1jdXJyZW50XCIsIG5hbWU6IFwiQnJvd3NlIGN1cnJlbnQgZm9sZGVyXCIsIGNhbGxiYWNrOiAoKSA9PiB7IHRoaXMuZXhwbG9yZXI/LmJyb3dzZUN1cnJlbnQoKTsgfSwgfSk7XG5cbiAgICAgICAgdGhpcy5yZWdpc3RlckV2ZW50KHRoaXMuYXBwLndvcmtzcGFjZS5vbihcImZpbGUtbWVudVwiLCAobWVudSwgZmlsZSwgc291cmNlKSA9PiB7XG4gICAgICAgICAgICBsZXQgaXRlbTogTWVudUl0ZW1cbiAgICAgICAgICAgIGlmIChzb3VyY2UgIT09IFwicXVpY2stZXhwbG9yZXJcIikgbWVudS5hZGRJdGVtKGkgPT4ge1xuICAgICAgICAgICAgICAgIGkuc2V0SWNvbihcImZvbGRlclwiKS5zZXRUaXRsZShcIlNob3cgaW4gUXVpY2sgRXhwbG9yZXJcIikub25DbGljayhlID0+IHsgdGhpcy5leHBsb3Jlcj8uYnJvd3NlRmlsZShmaWxlKTsgfSk7XG4gICAgICAgICAgICAgICAgaXRlbSA9IGk7XG4gICAgICAgICAgICB9KVxuICAgICAgICAgICAgaWYgKGl0ZW0pIHtcbiAgICAgICAgICAgICAgICBjb25zdCByZXZlYWxGaWxlID0gaTE4bmV4dC50KGBwbHVnaW5zLmZpbGUtZXhwbG9yZXIuYWN0aW9uLXJldmVhbC1maWxlYCk7XG4gICAgICAgICAgICAgICAgY29uc3QgaWR4ID0gbWVudS5pdGVtcy5maW5kSW5kZXgoaSA9PiBpLnRpdGxlRWwudGV4dENvbnRlbnQgPT09IHJldmVhbEZpbGUpO1xuICAgICAgICAgICAgICAgIChtZW51LmRvbSBhcyBIVE1MRWxlbWVudCkuaW5zZXJ0QmVmb3JlKGl0ZW0uZG9tLCBtZW51Lml0ZW1zW2lkeCsxXS5kb20pO1xuICAgICAgICAgICAgICAgIG1lbnUuaXRlbXMucmVtb3ZlKGl0ZW0pO1xuICAgICAgICAgICAgICAgIG1lbnUuaXRlbXMuc3BsaWNlKGlkeCsxLCAwLCBpdGVtKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSkpO1xuXG4gICAgICAgIE9iamVjdC5kZWZpbmVQcm9wZXJ0eShURm9sZGVyLnByb3RvdHlwZSwgXCJiYXNlbmFtZVwiLCB7Z2V0KCl7IHJldHVybiB0aGlzLm5hbWU7IH0sIGNvbmZpZ3VyYWJsZTogdHJ1ZX0pXG4gICAgfVxuXG4gICAgb251bmxvYWQoKSB7XG4gICAgICAgIHRoaXMuYXBwLndvcmtzcGFjZS51bnJlZ2lzdGVySG92ZXJMaW5rU291cmNlKGhvdmVyU291cmNlKTtcbiAgICB9XG5cbiAgICBvbkZpbGVDaGFuZ2UoZmlsZTogVEFic3RyYWN0RmlsZSkge1xuICAgICAgICBpZiAoZmlsZSA9PT0gdGhpcy5leHBsb3Jlci5sYXN0RmlsZSkgdGhpcy5leHBsb3Jlci51cGRhdGUoZmlsZSk7XG4gICAgfVxufVxuIl0sIm5hbWVzIjpbIk1lbnUiLCJBcHAiLCJkZWJvdW5jZSIsIlNjb3BlIiwiTWVudUl0ZW0iLCJLZXltYXAiLCJURm9sZGVyIiwiTm90aWNlIiwiVEZpbGUiLCJQbHVnaW4iXSwibWFwcGluZ3MiOiI7Ozs7QUFBQSxTQUFTLFVBQVUsRUFBRSxLQUFLLEVBQUU7QUFDNUIsRUFBRSxJQUFJLE1BQU0sR0FBRyxLQUFLLENBQUMsS0FBSyxDQUFDLFFBQVEsQ0FBQyxDQUFDO0FBQ3JDLEVBQUUsSUFBSSxPQUFPLEdBQUcsRUFBRSxDQUFDO0FBQ25CLEVBQUUsSUFBSSxFQUFFLEdBQUcsRUFBRSxDQUFDO0FBQ2QsRUFBRSxJQUFJLFVBQVUsR0FBRyxFQUFFLENBQUM7QUFDdEI7QUFDQSxFQUFFLEtBQUssSUFBSSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsR0FBRyxNQUFNLENBQUMsTUFBTSxFQUFFLENBQUMsRUFBRSxFQUFFO0FBQzFDLElBQUksSUFBSSxLQUFLLEdBQUcsTUFBTSxDQUFDLENB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Q0FBQztBQUVkO0FBQ0EsSUFBSSxDQUFDLE1BQU0sR0FBRyxTQUFTLFVBQVUsRUFBRSxLQUFLLEVBQUU7QUFDMUMsRUFBRSxJQUFJLElBQUksR0FBRyxFQUFFLEVBQUUsR0FBRyxHQUFHLFNBQVMsQ0FBQyxNQUFNLEdBQUcsQ0FBQyxDQUFDO0FBQzVDLEVBQUUsUUFBUSxHQUFHLEVBQUUsR0FBRyxDQUFDLEdBQUcsSUFBSSxFQUFFLEdBQUcsRUFBRSxHQUFHLFNBQVMsRUFBRSxHQUFHLEdBQUcsQ0FBQyxFQUFFLENBQUM7QUFDekQ7QUFDQSxFQUFFLElBQUksS0FBSyxHQUFHLFdBQVcsQ0FBQyxLQUFLLENBQUMsQ0FBQztBQUNqQztBQUNBLEVBQUUsT0FBTyxJQUFJLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxJQUFJLEVBQUUsRUFBRSxJQUFJLEVBQUUsS0FBSyxFQUFFLENBQUMsTUFBTSxFQUFFLElBQUksRUFBRSxDQUFDLENBQUM7QUFDL0QsQ0FBQyxDQUFDO0FBQ0Y7QUFDQSxTQUFTLFdBQVcsRUFBRSxLQUFLLEVBQUU7QUFDN0IsRUFBRSxPQUFPLFNBQVMsQ0FBQyxLQUFLLENBQUMsS0FBSyxTQUFTLENBQUMsS0FBSyxDQUFDLEdBQUcsYUFBYSxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUM7QUFDdkUsQ0FBQztBQUNEO0FBQ0EsU0FBUyxXQUFXLEVBQUUsTUFBTSxFQUFFO0FBQzlCLEVBQUUsSUFBSSxRQUFRLEdBQUcsRUFBRSxFQUFFLEdBQUcsR0FBRyxTQUFTLENBQUMsTUFBTSxHQUFHLENBQUMsQ0FBQztBQUNoRCxFQUFFLFFBQVEsR0FBRyxFQUFFLEdBQUcsQ0FBQyxHQUFHLFFBQVEsRUFBRSxHQUFHLEVBQUUsR0FBRyxTQUFTLEVBQUUsR0FBRyxHQUFHLENBQUMsRUFBRSxDQUFDO0FBQzdEO0FBQ0EsRUFBRSxJQUFJLFFBQVEsR0FBRyxLQUFLLENBQUMsTUFBTSxDQUFDLENBQUM7QUFDL0IsRUFBRSxJQUFJLE9BQU8sR0FBRyxRQUFRLENBQUMsTUFBTSxFQUFFLFFBQVEsRUFBRSxRQUFR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
