import { RedomComponent } from "redom";

/* eslint-disable @typescript-eslint/no-namespace -- namespaces are required for compatibility */
declare global {
    namespace JSX {
        export type IntrinsicElements = {
            [K in keyof HTMLElementTagNameMap]: Partial<HTMLElementTagNameMap[K] & {
                class: string
            }>
        }
        export type ElementClass = RedomComponent
        export type Element = HTMLElement
    }
}
/* eslint-enable @typescript-eslint/no-namespace -- namespaces are required for compatibility */
