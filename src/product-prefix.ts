import type { MyntraProduct } from './types.js';
import { classifyMyxPayload, extractMyxData, toRecord, type MyxPayloadClassification } from './routes.js';

const white = (source: string, at: number) => {
    while (/\s/.test(source[at] ?? '') && at < source.length) at++;
    return at;
};

/** Locate a complete JSON value without evaluating page JavaScript. */
function valueEnd(source: string, start: number): number | null {
    let quoted = false;
    let escaped = false;
    const closes: string[] = [];
    const first = source[start];
    if (first !== '{' && first !== '[' && first !== '"') {
        const primitive = /^(?:true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)/.exec(source.slice(start));
        if (!primitive) return null;
        const end = start + primitive[0].length;
        return /[\s,}\]]/.test(source[end] ?? '') ? end : null;
    }
    for (let at = start; at < source.length; at++) {
        const char = source[at];
        if (quoted) {
            if (escaped) escaped = false;
            else if (char === '\\') escaped = true;
            else if (char === '"') {
                quoted = false;
                if (first === '"' && closes.length === 0) return at + 1;
            }
        } else if (char === '"') quoted = true;
        else if (char === '{') closes.push('}');
        else if (char === '[') closes.push(']');
        else if (char === '}' || char === ']') {
            if (closes.pop() !== char) return null;
            if (closes.length === 0) return at + 1;
        }
    }
    return null;
}

function memberStart(source: string, objectStart: number, key: string): number | null {
    if (source[objectStart] !== '{') return null;
    let at = white(source, objectStart + 1);
    for (let field = 0; field < 256; field++) {
        if (source[at] !== '"') return null;
        const end = valueEnd(source, at);
        if (end === null) return null;
        let name: unknown;
        try { name = JSON.parse(source.slice(at, end)); } catch { return null; }
        at = white(source, end);
        if (source[at] !== ':') return null;
        at = white(source, at + 1);
        if (name === key) return at;
        const skipped = valueEnd(source, at);
        if (skipped === null) return null;
        try { JSON.parse(source.slice(at, skipped)); } catch { return null; }
        at = white(source, skipped);
        if (source[at] !== ',') return null;
        at = white(source, at + 1);
    }
    return null;
}

/**
 * Read only actual complete product objects on the explicit JSON path. This is
 * not a reconstructed full page/payload: callers must stop at their result cap
 * and report that they intentionally consumed only a listing prefix.
 */
export function extractProductPrefix(html: string, requested: number,
    usableKey: (product: MyntraProduct) => string | null): { products: MyntraProduct[] } | null {
    if (!Number.isInteger(requested) || requested < 1 || requested > 500) return null;
    const assignments = /window\.__myx\s*=\s*/g;
    for (let attempt = 0; attempt < 32; attempt++) {
        const assignment = assignments.exec(html);
        if (!assignment) break;
        let at: number | null = assignment.index + assignment[0].length;
        for (const key of ['searchData', 'results', 'products']) {
            at = memberStart(html, at, key);
            if (at === null) break;
        }
        if (at === null || html[at] !== '[') continue;
        at = white(html, at + 1);
        const products: MyntraProduct[] = [];
        const keys = new Set<string>();
        for (let row = 0; row < 1000; row++) {
            if (html[at] !== '{') break;
            const end = valueEnd(html, at);
            if (end === null) break;
            const delimiter = white(html, end);
            if (html[delimiter] !== ',' && html[delimiter] !== ']') break;
            let product: MyntraProduct;
            try { product = JSON.parse(html.slice(at, end)); } catch { break; }
            products.push(product);
            const key = usableKey(product);
            if (key !== null) keys.add(key);
            if (keys.size >= requested) return { products };
            if (html[delimiter] !== ',') break;
            at = white(html, delimiter + 1);
        }
    }
    return null;
}

/** A prefix is usable only after the outstanding unique-result cap is fulfilled. */
export function readRequestedPayload(html: string, requested: number, seen: ReadonlySet<string>):
    MyxPayloadClassification & { stoppedAtProductLimit: boolean } {
    const full = classifyMyxPayload(extractMyxData(html));
    if (full.kind !== 'invalid') return { ...full, stoppedAtProductLimit: false };
    const prefix = extractProductPrefix(html, requested, product => {
        const record = toRecord(product, null, null, 1);
        if (!record) return null;
        const key = record.productId ?? record.productUrl ?? record.title;
        return seen.has(key) ? null : key;
    });
    return prefix ? { kind: 'products', products: prefix.products, stoppedAtProductLimit: true }
        : { ...full, stoppedAtProductLimit: false };
}
