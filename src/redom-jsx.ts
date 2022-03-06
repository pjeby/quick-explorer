import { RedomComponent, RedomElement, RedomElementOfElQuery } from "redom";
declare global {
    namespace JSX {
        export interface IntrinsicElements {
            [elemName: string]: any;
        }
        export type ElementClass = RedomComponent
        export type Element = HTMLElement
    }
}
