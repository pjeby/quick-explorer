import {Menu, App} from "obsidian";
import {around} from "monkey-around";

declare module "obsidian" {
    interface Menu {
        app: App
        dom: HTMLDivElement
        scope: Scope
    }
    interface MenuItem {
        dom: HTMLDivElement
    }
}

export type MenuParent = App | PopupMenu;

export class PopupMenu extends Menu {
    /** The child menu popped up over this one */
    child: Menu

    constructor(protected parent: MenuParent) {
        super(parent instanceof App ? parent : parent.app);
        if (parent instanceof PopupMenu) parent.setChildMenu(this);

        // Escape to close the menu
        this.scope.register(null, "Escape", this.hide.bind(this));

        // Make obsidian.Menu think mousedowns on our child menu(s) are happening
        // on us, so we won't close before an actual click occurs
        const menu = this;
        around(this.dom, {contains(prev){ return function(target: Node) {
            const ret = prev.call(this, target) || menu.child?.dom.contains(target);
            return ret;
        }}});
    }

    onload() {
        this.scope.register(null, null, () => false); // block all keys other than ours
        super.onload();
    }

    hide() {
        this.setChildMenu();  // hide child menu(s) first
        return super.hide();
    }

    setChildMenu(menu?: Menu) {
        this.child?.hide();
        this.child = menu;
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
        target.toggleClass("is-active", true);
        this.onHide(() => target.toggleClass("is-active", false));
        return this;
    }
}
