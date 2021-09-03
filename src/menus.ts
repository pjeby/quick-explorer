import {Menu, App, MenuItem, debounce, Keymap, Scope} from "obsidian";
import {around} from "monkey-around";

declare module "obsidian" {
    interface Menu {
        app: App
        dom: HTMLDivElement
        scope: Scope
        items: MenuItem[]

        select(n: number): void
        selected: number
        onArrowDown(e: KeyboardEvent): false
        onArrowUp(e: KeyboardEvent): false
    }

    export const Keymap: {
        isModifier(event: Event, modifier: string): boolean
        getModifiers(event: Event): string
    }

    interface MenuItem {
        dom: HTMLDivElement
        titleEl: HTMLDivElement
        handleEvent(event: Event): void
        disabled: boolean
    }
}

export type MenuParent = App | PopupMenu;

export class PopupMenu extends Menu {
    /** The child menu popped up over this one */
    child: Menu

    match: string = ""
    resetSearchOnTimeout = debounce(() => {this.match = "";}, 1500, true)
    visible: boolean = false

    constructor(public parent: MenuParent) {
        super(parent instanceof App ? parent : parent.app);
        if (parent instanceof PopupMenu) parent.setChildMenu(this);

        this.scope = new Scope;
        this.scope.register([], "ArrowUp",   this.onArrowUp.bind(this));
        this.scope.register([], "ArrowDown", this.onArrowDown.bind(this));
        this.scope.register([], "Enter",     this.onEnter.bind(this));
        this.scope.register([], "Escape",    this.onEscape.bind(this));
        this.scope.register([], "ArrowLeft", this.onArrowLeft.bind(this));

        this.scope.register([], "Home", this.onHome.bind(this));
        this.scope.register([], "End",  this.onEnd.bind(this));
        this.scope.register([], "ArrowRight", this.onArrowRight.bind(this));

        // Make obsidian.Menu think mousedowns on our child menu(s) are happening
        // on us, so we won't close before an actual click occurs
        const menu = this;
        around(this.dom, {contains(prev){ return function(target: Node) {
            const ret = prev.call(this, target) || menu.child?.dom.contains(target);
            return ret;
        }}});
        this.dom.addClass("qe-popup-menu");
    }

    onEscape() {
        this.hide();
    }

    onload() {
        this.scope.register(null, null, this.onKeyDown.bind(this));
        super.onload();
        this.visible = true;
        // We wait until now to register so that any initial mouseover of the old mouse position will be skipped
        this.register(onElement(this.dom, "mouseover", ".menu-item", (event: MouseEvent, target: HTMLDivElement) => {
            if (mouseMoved(event) && !target.hasClass("is-disabled") && !this.child) {
                this.select(this.items.findIndex(i => i.dom === target), false);
            }
        }));
    }

    onunload() {
        this.visible = false;
        super.onunload();
    }

    // Override to avoid having a mouseover event handler
    addItem(cb: (i: MenuItem) => any) {
        const i = new MenuItem(this);
        this.items.push(i);
        cb(i);
        return this;
    }

    onKeyDown(event: KeyboardEvent) {
        const mod = Keymap.getModifiers(event);
        if (event.key.length === 1 && !event.isComposing && (!mod || mod === "Shift") ) {
            let match = this.match + event.key;
            // Throw away pieces of the match until something matches or nothing's left
            while (match && !this.searchFor(match)) match = match.substr(1);
            this.match = match;
            this.resetSearchOnTimeout();
        }
        return false;   // block all keys other than ours
    }

    searchFor(match: string) {
        const parts = match.split("").map(escapeRegex);
        return (
            this.find(new RegExp("^"+ parts.join(""), "ui")) ||
            this.find(new RegExp("^"+ parts.join(".*"), "ui")) ||
            this.find(new RegExp(parts.join(".*"), "ui"))
        );
    }

    find(pattern: RegExp) {
        let pos = Math.min(0, this.selected);
        for (let i=this.items.length; i; ++pos, i--) {
            if (this.items[pos]?.disabled) continue;
            if (this.items[pos]?.dom.textContent.match(pattern)) {
                this.select(pos);
                return true;
            }
        }
        return false
    }

    onEnter(event: KeyboardEvent) {
        const item = this.items[this.selected];
        if (item) {
            item.handleEvent(event);
            // Only hide if we don't have a submenu
            if (!this.child) this.hide();
        }
        return false;
    }

    select(n: number, scroll = true) {
        this.match = "" // reset search on move
        super.select(n);
        if (scroll)  {
            const el = this.items[this.selected].dom;
            const me = this.dom.getBoundingClientRect(), my = el.getBoundingClientRect();
            if (my.top < me.top || my.bottom > me.bottom) el.scrollIntoView();
        }
    }

    unselect() {
        this.items[this.selected]?.dom.removeClass("selected");
    }

    onEnd(e: KeyboardEvent) {
        this.unselect();
        this.selected = this.items.length;
        this.onArrowUp(e);
        if (this.selected === this.items.length) this.selected = -1;
    }

    onHome(e: KeyboardEvent) {
        this.unselect();
        this.selected = -1;
        this.onArrowDown(e);
    }

    onArrowLeft(): boolean | undefined {
        if (this.rootMenu() !== this) {
            this.hide();
            return false;
        }
    }

    onArrowRight(): boolean | undefined {
        // no-op in base class
        return;
    }

    hide() {
        this.setChildMenu();  // hide child menu(s) first
        return super.hide();
    }

    setChildMenu(menu?: Menu) {
        this.child?.hide();
        this.child = menu;
    }

    rootMenu(): PopupMenu {
        return this.parent instanceof App ? this : this.parent.rootMenu();
    }

    cascade(target: HTMLElement, event?: MouseEvent,  hOverlap = 15, vOverlap = 5) {
        const {left, right, top, bottom, width} = target.getBoundingClientRect();
        const centerX = left+Math.min(150, width/3), centerY = (top+bottom)/2;
        const {innerHeight, innerWidth} = window;

        // Try to cascade down and to the right from the mouse or horizontal center
        // of the clicked item
        const point = {x: event ? event.clientX  - hOverlap : centerX , y: bottom - vOverlap};

        // Measure the menu and see if it fits
        document.body.appendChild(this.dom);
        const {offsetWidth, offsetHeight} = this.dom;
        const fitsBelow = point.y + offsetHeight < innerHeight;
        const fitsRight = point.x + offsetWidth <= innerWidth;

        // If it doesn't fit underneath us, position it at the bottom of the screen, unless
        // the clicked item is close to the bottom (in which case, position it above so
        // the item will still be visible.)
        if (!fitsBelow) {
            point.y = (bottom > innerHeight - (bottom-top)) ? top + vOverlap: innerHeight;
        }

        // If it doesn't fit to the right, then position it at the right edge of the screen,
        // so long as it fits entirely above or below us.  Otherwise, position it using the
        // item center, so at least one side of the previous menu/item will still be seen.
        if (!fitsRight) {
            point.x = (offsetHeight < (bottom - vOverlap) || fitsBelow) ? innerWidth : centerX;
        }

        // Done!  Show our work.
        if (event instanceof MouseEvent) mouseMoved(event);
        this.showAtPosition(point);

        // Flag the clicked item as active, until we close
        target.toggleClass("selected", true);
        this.onHide(() => {
            if (this.parent instanceof App) target.toggleClass("selected", false);
            else if (this.parent instanceof PopupMenu) this.parent.setChildMenu();
        });
        return this;
    }
}

function escapeRegex(s: string) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

let oldX = 0, oldY = 0

function mouseMoved({clientX, clientY}: {clientX: number, clientY: number}) {
    if ( Math.abs(oldX-clientX) || Math.abs(oldY-clientY) ) {
        oldX = clientX;
        oldY = clientY;
        return true;
    }
    return false;
}

function onElement<K extends keyof HTMLElementEventMap>(
    el: HTMLElement, type: K, selector:string,
    listener: (this: HTMLElement, ev: HTMLElementEventMap[K], delegateTarget: HTMLElement) => any,
    options: boolean | AddEventListenerOptions = false
) {
    el.on(type, selector, listener, options)
    return () => el.off(type, selector, listener, options);
}