import { TransformStream } from "node:stream/web"
import { Feature, FeatureEnqueuer } from "./types"

const ocurly = '{'.charCodeAt(0)
const ccurly = '}'.charCodeAt(0)
const obracket = '['.charCodeAt(0)
const cbracket = ']'.charCodeAt(0)
const colon = ':'.charCodeAt(0)
const coma = ','.charCodeAt(0)
const quote = '"'.charCodeAt(0)
const space = ' '.charCodeAt(0)
const multi = 128

export class GeojsonRS extends TransformStream<Uint8Array, Feature> {
    state = 'any'
    stack: [string, number][] = []
    pos = 0
    line = 0
    col = 0
    enqueuer?: FeatureEnqueuer = { enqueue: (feature: Feature) => void 0 }
    resolve?: Function
    reject?: Function
    chars: number[] = []
    withLocation = false
    constructor(withLocation = false) {
        super({
            transform: (chunk, controller) => {
                this.enqueuer = controller
                chunk.forEach(charcode => this.put(charcode))
            }
        })
        this.withLocation = withLocation
    }
    static forEach(array: Uint8Array, action: (feature: Feature) => void) {
        const rs = new GeojsonRS()
            rs.init({ enqueue: action })
            array.forEach(charcode => rs.put(charcode))
    }

    private init(enqueuer: FeatureEnqueuer = { enqueue: (feature: Feature) => void 0 }) {
        this.state = 'any'
        this.pos = this.line = this.col = 0
        this.stack = []
        this.enqueuer = enqueuer
    }
    // put next char in parsing
    private put(charcode: number) {
        //console.log(`PUT: [${this.pos}=${charcode} > ${String.fromCharCode(charcode)} `)
        if (charcode === 0x0A) { this.line++; this.col = 0 }
        this.col++
        if (this.stack.length >= 2 && !(this.chars.length == 0 && charcode == coma))
            this.chars.push(charcode)
        else
            this.chars = []
        if (charcode !== 0x5C) { // skip backslashed char
            charcode = Math.min(multi, Math.max(space, charcode))
            this.automata[this.state](charcode)
        }
        this.pos++
    }
    // push current state and offset in stack
    private push() {
        this.stack.push([this.state, this.pos])
    }
    // pop saved state and call onobject if object have been parsed
    private pop() {
        const arr = this.stack.pop();
        if (!arr) throw (`Error Poping empty stack while expecting something !!!`)
        this.state = this.stack.length ? this.stack[this.stack.length - 1][0] : 'any';
        const estate = arr[0];
        const offset = arr[1];
        const end = this.pos;
        const length = end - offset + 1

        if (estate == 'object' && this.stack.length == 2) {
            const str = Buffer.from(this.chars).toString("utf-8")
            const feature = JSON.parse(str) as Feature
            if (this.withLocation) feature._location = { offset, length }
            this.enqueuer.enqueue(feature)
            this.chars = []
        }
        return [offset, end]
    }
    unexpected(charcode: number) {
        throw new Error(`Unexpected char '${String.fromCharCode(charcode)}' at ${this.line}:${this.col} `)
    }

    // finite state automata for parsing next char  
    private automata: { [name: string]: (charcode: number) => void } = {
        any: (charcode: number) => {
            switch (charcode) {
                case space: break;
                case ocurly: this.state = 'object'; this.push(); break;
                case obracket: this.state = 'array'; this.push(); break;
                case quote: this.state = 'string'; this.push(); break;
                case ccurly:
                case cbracket:
                case colon:
                case coma:
                case multi: this.unexpected(charcode); break;
                default: this.state = 'value'; this.push(); break;
            }
        },
        object: (charcode: number) => {
            switch (charcode) {
                case space: break;
                case ccurly: this.pop(); break;
                case quote: this.state = 'field'; this.push(); break;
                case coma: break;
                default: this.unexpected(charcode); break;
            }
        },
        field: (charcode: number) => {
            switch (charcode) {
                case quote: this.pop(); this.state = 'colon'; break;
                // all other are allowed field chars
            }
        },
        colon: (charcode: number) => {
            switch (charcode) {
                case space: break;
                case colon: this.state = 'any'; break;
                default: this.unexpected(charcode)
            }
        },
        array: (charcode: number) => {
            switch (charcode) {
                case space: break;
                case coma: break;
                case cbracket: this.pop(); break;
                case ocurly: this.state = 'object'; this.push(); break;
                case obracket: this.state = 'array'; this.push(); break;
                case quote: this.state = 'string'; this.push(); break;
                case ccurly:
                case colon:
                case multi: this.unexpected(charcode); break;
                default: this.state = 'value'; this.push(); break;
            }
        },
        string: (charcode: number) => {
            switch (charcode) {
                case quote: this.pop(); break;
                // all other are allowed field chars
            }
        },
        value: (charcode: number) => {
            if ([ocurly, ccurly, obracket, cbracket, colon, coma, quote, space, multi].includes(charcode)) {
                // value end
                this.pos--;
                this.chars.pop()
                const bounds = this.pop()
                //const value = jsonbuf.subarray(bounds[0], bounds[1] + 1).toString()
                //if (value === 'true' || value === 'false' || value === 'null' || !isNaN(value as unknown as number)) return
                //throw new Error(`syntax error at ${bounds[0]} expected true,false,null or a number found ${value} at ${this.line}:${this.col}`);
                this.put(charcode)
            }
        },
    }
}
