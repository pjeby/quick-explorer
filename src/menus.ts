import {Menu, App, MenuItem, debounce, Keymap} from "obsidian";
import {around} from "monkey-around";

declare module "obsidian" {
    interface Menu {
        app: App
        dom: HTMLDivElement
        scope: Scope
        items: MenuItem[]

        // 0.12.12+
        select?(n: number): void
        selected: number
        onArrowDown?(e: KeyboardEvent): false
        onArrowUp(e: KeyboardEvent): false
    }

    export const Keymap: {
        isModifier(event: Event, modifier: string): boolean
        getModifiers(event: Event): string
    }

    interface MenuItem {
        dom: HTMLDivElement
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

    constructor(public parent: MenuParent) {
        super(parent instanceof App ? parent : parent.app);
        if (parent instanceof PopupMenu) parent.setChildMenu(this);

        // Escape to close the menu
        this.scope.register(null, "Escape", this.hide.bind(this));
        this.scope.register([], "ArrowLeft", this.onArrowLeft.bind(this));

        // 0.12.12+
        if (Menu.prototype.select) {
            this.scope.register(null, "Home", this.onHome.bind(this));
            this.scope.register(null, "End",  this.onEnd.bind(this));
            this.scope.register([], "ArrowRight", this.onArrowRight.bind(this));
        }

        // Make obsidian.Menu think mousedowns on our child menu(s) are happening
        // on us, so we won't close before an actual click occurs
        const menu = this;
        around(this.dom, {contains(prev){ return function(target: Node) {
            const ret = prev.call(this, target) || menu.child?.dom.contains(target);
            return ret;
        }}});
    }

    onload() {
        this.scope.register(null, null, this.onKeyDown.bind(this));
        super.onload();
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
            if (this.items[pos].disabled) continue;
            if (this.items[pos].dom.textContent.match(pattern)) {
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

    select(n: number) {
        this.match = "" // reset search on move
        if (!Menu.prototype.select) return;  // <0.12.12
        super.select(n);
        this.items[this.selected].dom.scrollIntoView()
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
        const {left, right, top, bottom} = target.getBoundingClientRect();
        const centerX = (left+right)/2, centerY = (top+bottom)/2;
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
        this.showAtPosition(point);

        // Flag the clicked item as active, until we close
        target.toggleClass("selected", true);
        if (this.parent instanceof App || !Menu.prototype.select) this.onHide(() => target.toggleClass("selected", false));
        return this;
    }
}

function escapeRegex(s: string) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}