import { ReadableStream, WritableStream } from "node:stream/web"
import { Feature, FeatureLocation } from "./types";

export function iter(offset = 0, count = 1, size = 1): Iterable<number> {
    if (offset < 0 || count <= 0 || size <= 0) throw Error("iter(offset,count,step) all the argument must be positive")
    // Create an Object
    return {
        // Make it Iterable
        [Symbol.iterator]() {
            let current = offset;
            let index = 0
            return {
                next() {
                    const value = index < count ? current : null
                    const done = value == null
                    current += size
                    index++
                    return { value, done }
                }
            }
        }
    }
}

export function NodeS2WebS(nodeStream: any) {

    async function* nodeStreamToIterator(stream: any) {
        for await (const chunk of stream) {
            yield chunk;
        }
    }
    const iterator = nodeStreamToIterator(nodeStream)

    return new ReadableStream<Uint8Array>({
        async pull(controller) {
            const { value, done } = await iterator.next()
            if (done) {
                controller.close()
            } else {
                controller.enqueue(new Uint8Array(value))
            }
        },
    })
}

// Fonction pour fusionner deux ReadableStreams
export function joinStreams<T1, T2, O>(stream1: ReadableStream<T1>, stream2: ReadableStream<T2>, join: (value1: T1, value2: T2) => O) {
    const reader1 = stream1.getReader();
    const reader2 = stream2.getReader();

    return new ReadableStream<O>({
        async start(controller) {
            while (true) {
                const { value: value1, done: done1 } = await reader1.read();
                const { value: value2, done: done2 } = await reader2.read();

                if (done1 || done2) {
                    // Les deux streams sont terminés
                    controller.close();
                    return;
                }
                const value = join(value1, value2)
                controller.enqueue(value);
            }
        }
    });
}

export class ArrayWS<T> extends WritableStream<T> {
    store: T[] = []
    constructor() {
        super({ write: (chunk: T) => { this.store.push(chunk) } })
    }
}

export class ArrayRS<T> extends ReadableStream<T> {
    index = 0
    array = [] as T[]
    constructor(array: T[]) {
        super({
            start: () => { this.index = 0; this.array = [] },
            pull: (ctrl) => { (this.index < this.array.length) ? ctrl.enqueue(this.array[this.index++]) : ctrl.close() },
        })
    }
}

export class toByteRS extends ReadableStream<Uint8Array> {
    stream : ReadableStream<Uint8Array>
    constructor(input: any) {
        super({
            pull: async (controller) => {
                for await (const chunk of this.stream) controller.enqueue(chunk)
                controller.close()
            }
        })
        const buf = this.toBuffer(input)
        this.stream = new Blob([buf]).stream() as ReadableStream<Uint8Array>
    }
    private toBuffer(input:any): Uint8Array {
        switch(true) {
            case typeof(input) == "string" : return Buffer.from(input) 
            case input instanceof Buffer : return input
        }
        return Buffer.from(JSON.stringify(input)) 
    }
}

export function copy<T>(o: T): T {
    return JSON.parse(JSON.stringify(o))
}

// return the area of a polygon 
// info: area is positive if polygon is clokwise negative otherwise
export function area(coordinates: [number, number][]) {
    let area = 0;
    for (var i = 0; i < coordinates.length; i++) {
        const j = (i + 1) % coordinates.length;
        area += coordinates[i][0] * coordinates[j][1];
        area -= coordinates[j][0] * coordinates[i][1];
    }
    return area / 2;
}

export function ringContainsSome(ring: [number, number][], hole: [number, number][]) {
    for (const point of hole) {
        const c = ringContains(ring, point)
        if (c) return c > 0
    }
    return false;
}

function ringContains(ring: [number, number][], point: [number, number]) {
    var x = point[0], y = point[1], contains = -1;
    for (var i = 0, n = ring.length, j = n - 1; i < n; j = i++) {
        var pi = ring[i], xi = pi[0], yi = pi[1],
            pj = ring[j], xj = pj[0], yj = pj[1];
        if (segmentContains(pi, pj, point))  return 0;
        if (((yi > y) !== (yj > y)) && ((x < (xj - xi) * (y - yi) / (yj - yi) + xi)))  contains = -contains
    }
    return contains;
}

function segmentContains(p0: [number, number], p1: [number, number], p2: [number, number]) {
    var x20 = p2[0] - p0[0], y20 = p2[1] - p0[1];
    if (x20 === 0 && y20 === 0) return true;
    var x10 = p1[0] - p0[0], y10 = p1[1] - p0[1];
    if (x10 === 0 && y10 === 0) return false;
    var t = (x20 * x10 + y20 * y10) / (x10 * x10 + y10 * y10);
    return t < 0 || t > 1 ? false : t === 0 || t === 1 ? true : t * x10 === x20 && t * y10 === y20;
}

export function copyFeature(features: Feature[],locations?:FeatureLocation[]) {
    return features.map((f,i) => { 
        const c = copy(f);
        if (locations) c._location = locations[i]
        return c
     })
}