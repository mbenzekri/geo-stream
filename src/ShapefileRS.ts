import { TransformStream } from "node:stream/web"
import { Feature, FeatureEnqueuer, Properties, PropertiesEnqueuer } from "./types"
import { iter, area, ringContainsSome } from "./utils"

const SHP_HEADER_SIZE = 100
const SHP_RECORD_HEADER_SIZE = 8
enum ShpState { header, rheader, record }
type ShpHeader = {
    length: number,
    version: number,
    type: ShpType,
    xmin: number, ymin: number,
    xmax: number, ymax: number,
    zmin: number, zmax: number,
    mmin: number, mmax: number,
}
enum ShpType {
    Null = 0,
    Point = 1,
    PolyLine = 3,
    Polygon = 5,
    MultiPoint = 8,
    PointZ = 11,
    PolyLineZ = 13,
    PolygonZ = 15,
    MultiPointZ = 18,
    PointM = 21,
    PolyLineM = 23,
    PolygonM = 25,
    MultiPointM = 28,
    MultiPatch = 31,
}

export class ShpRS extends TransformStream<Uint8Array, Feature> {
    pos = 0
    start = 0
    state = ShpState.header
    expected = SHP_HEADER_SIZE
    bytes: number[] = []
    enqueuer?: FeatureEnqueuer = { enqueue: () => void 0 }
    withLocation = false
    header: ShpHeader
    constructor(withLocation = false) {
        super({
            transform: (chunk, controller) => {
                this.enqueuer = controller
                chunk.forEach(byte => this.put(byte))
            }
        })
        this.withLocation = withLocation
    }

    static forEach(array: Uint8Array, action: (feature: Feature) => void) {
        const rs = new ShpRS()
        rs.init({ enqueue: action })
        array.forEach(charcode => rs.put(charcode))
    }

    private init(enqueuer: FeatureEnqueuer) {
        this.state = ShpState.header
        this.start =
            this.pos = 0
        this.expected = SHP_HEADER_SIZE
        this.bytes = []
        this.enqueuer = enqueuer ?? { enqueue: (feature: Feature) => void 0 }
    }

    private put(byte: number) {
        this.bytes.push(byte)
        if (this.bytes.length == this.expected) {
            const data = new DataView(new Uint8Array(this.bytes).buffer)
            this.automata(data)
            this.bytes = []
            this.start = this.pos + 1
        }
        this.pos++
    }
    private automata(buffer: DataView) {
        switch (this.state) {
            case ShpState.header:
                this.header = this.decodeHeader(buffer)
                this.state = ShpState.rheader;
                this.expected = SHP_RECORD_HEADER_SIZE
                break;
            case ShpState.rheader:
                const { recnum, length } = this.decodeRecordHeader(buffer)
                this.state = ShpState.record;
                this.expected = length // length in word (16bit)
                break;
            case ShpState.record:
                const feature = this.decodeRecord(buffer)
                if (this.withLocation) feature._location = { offset: this.start, length: buffer.byteLength }
                this.enqueuer.enqueue(feature)
                this.state = ShpState.rheader;
                this.expected = SHP_RECORD_HEADER_SIZE
                break;
        }
    }
    private decodeHeader(buffer: DataView) {
        // Position Field               Value       Type        Order
        // Byte     0 File Code         9994        Integer     Big
        // Byte     4 Unused            0           Integer     Big
        // Byte     8 Unused            0           Integer     Big
        // Byte     12 Unused           0           Integer     Big
        // Byte     16 Unused           0           Integer     Big
        // Byte     20 Unused           0           Integer     Big
        // Byte     24 File Length      File Length Integer     Big
        // Byte     28 Version          1000        Integer     Little
        // Byte     32 Shape Type       Shape Type  Integer     Little
        // Byte     36 Bounding Box     Xmin        Double      Little
        // Byte     44 Bounding Box     Ymin        Double      Little
        // Byte     52 Bounding Box     Xmax        Double      Little
        // Byte     60 Bounding Box     Ymax        Double      Little
        // Byte     68* Bounding Box    Zmin        Double      Little
        // Byte     76* Bounding Box    Zmax        Double      Little
        // Byte     84* Bounding Box    Mmin        Double      Little
        // Byte     92* Bounding Box    Mmax        Double      Little
        return {
            length: buffer.getUint32(24, false) * 2,// words of 16bits converted to byte length
            version: buffer.getUint32(28, true),
            type: buffer.getUint32(32, true),
            xmin: buffer.getFloat64(36, true),
            ymin: buffer.getFloat64(44, true),
            xmax: buffer.getFloat64(52, true),
            ymax: buffer.getFloat64(60, true),
            zmin: buffer.getFloat64(68, true),
            zmax: buffer.getFloat64(76, true),
            mmin: buffer.getFloat64(84, true),
            mmax: buffer.getFloat64(92, true),
        }
    }
    private decodeRecordHeader(buffer: DataView) {
        // Position Field Value Type Order
        // Byte 0 Record Number Record Number Integer Big
        // Byte 4 Content Length Content Length Integer Big
        // 
        // The content length for a record is the length of the record contents 
        // section measured in 16-bit words
        return {
            recnum: buffer.getUint32(0, false),
            length: buffer.getUint32(4, false) * 2, // words of 16bits converted to byte length
        }
    }
    private decodeRecord(buffer: DataView) {
        const type = buffer.getUint32(0, true)
        return this.decoders[type](buffer)
    }
    private decoders: { [name: number]: (d: DataView) => Feature } = {
        [ShpType.Null]: () => {
            return { type: "Feature", properties: null, geometry: null }
        },
        [ShpType.Point]: (buffer: DataView) => {
            // Position Field       Value   Type    Number  Order
            // Byte 0   ShapeType   1       Integer 1       Little
            // Byte 4   X           X       Double  1       Little
            // Byte 12  Y           Y       Double  1       Little
            const coordinates: [number, number] = [buffer.getFloat64(4, true), buffer.getFloat64(12, true)]
            return { type: "Feature", properties: null, geometry: { type: "Point", coordinates } }
        },
        [ShpType.PolyLine]: (buffer: DataView) => {
            // Position Field       Value       Type    Number      Order
            // Byte 0   Shape Type  3           Integer 1           Little
            // Byte 4   Box         Box         Double  4           Little
            // Byte 36  NumParts    NumParts    Integer 1           Little
            // Byte 40  NumPoints   NumPoints   Integer 1           Little
            // Byte 44  Parts       Parts       Integer NumParts    Little
            // Byte X   Points      Points      Point   NumPoints   Little
            //
            // Note: X = 44 + 4 * NumParts
            const numparts = buffer.getUint32(36, true)
            const numpoints = buffer.getUint32(40, true)
            const parts: number[] = []
            for (const offset of iter(44, numparts, 4)) {
                const part = buffer.getUint32(offset, true)
                parts.push(part)
            }
            const points: [number, number][] = []
            for (const offset of iter(44 + 4 * numparts, numpoints, 8)) {
                points.push([buffer.getFloat64(offset, true), buffer.getFloat64(offset + 4, true)])
            }
            const coordinates = parts.map((part, i) => points.slice(part, parts[i + 1 == parts.length ? numpoints : i + 1]))
            return { type: "Feature", properties: null, geometry: { type: "MultiLineString", coordinates } }
        },
        [ShpType.Polygon]: (buffer: DataView) => {
            // Position Field       Value       Type        Number      Order
            // Byte 0   ShapeType   5           Integer     1           Little
            // Byte 4   Box         Box         Double      4           Little
            // Byte 36  NumParts    NumParts    Integer     1           Little
            // Byte 40  NumPoints   NumPoints   Integer     1           Little
            // Byte 44  Parts       Parts       Integer     NumParts    Little
            // Byte X   Points      Points      Point       NumPoints   Little
            //
            // Note: X = 44 + 4 * NumParts
            const numparts = buffer.getUint32(36, true)
            const numpoints = buffer.getUint32(40, true)
            const parts: number[] = []
            const polygons: [number, number][][][] = []
            const holes = []
            for (const offset of iter(44, numparts, 4)) {
                const part = buffer.getUint32(offset, true)
                parts.push(part)
            }
            const points: [number, number][] = []
            for (const offset of iter(44 + 4 * numparts, numpoints, 8)) {
                points.push([buffer.getFloat64(offset, true), buffer.getFloat64(offset + 4, true)])
            }
            parts.forEach(function (i, j) {
                const ring = points.slice(i, parts[j + 1])
                area(ring) > 0 ? polygons.push([ring]) : holes.push(ring)
            })
            holes.forEach((hole) => {
                polygons.some((polygon) => {
                    if (ringContainsSome(polygon[0], hole)) {
                        polygon.push(hole);
                        return true;
                    }
                }) || polygons.push([hole]);
            });
            return polygons.length === 1
                ? { type: "Feature", properties: null, geometry: { type: "Polygon", coordinates: polygons[0] } }
                : { type: "Feature", properties: null, geometry: { type: "MultiPolygon", coordinates: polygons } }
        },
        [ShpType.MultiPoint]: (buffer: DataView) => {
            // Position Field       Value       Type    Number      Order
            // Byte 0   Shape Type  8           Integer 1           Little
            // Byte 4   Box         Box         Double  4           Little
            // Byte 36  NumPoints   NumPoints   Integer 1           Little
            // Byte 40  Points      Points      Point   NumPoints   Little
            const coordinates: [number, number][] = []
            const count = buffer.getUint32(36, true)
            for (const offset of iter(0, count * 8, 8)) {
                coordinates.push([buffer.getFloat64(offset, true), buffer.getFloat64(offset + 4, true)])
            }
            return { type: "Feature", properties: null, geometry: { type: "MultiPoint", coordinates } }
        },
        [ShpType.PointZ]: () => { throw Error("geometry type PointZ parsing not implemented") },
        [ShpType.PolyLineZ]: () => { throw Error("geometry type PolyLineZ parsing not implemented") },
        [ShpType.PolygonZ]: () => { throw Error("geometry type PolygonZ parsing not implemented") },
        [ShpType.MultiPointZ]: () => { throw Error("geometry type MultiPointZ parsing not implemented") },
        [ShpType.PointM]: () => { throw Error("geometry type PointM parsing not implemented") },
        [ShpType.PolyLineM]: () => { throw Error("geometry type PolyLineM parsing not implemented") },
        [ShpType.PolygonM]: () => { throw Error("geometry type PolygonM parsing not implemented") },
        [ShpType.MultiPointM]: () => { throw Error("geometry type MultiPointM parsing not implemented") },
        [ShpType.MultiPatch]: () => { throw Error("geometry type MultiPatch parsing not implemented") },
    }
}

const DBF_HEADER_SIZE = 32
const DBF_FIELD_SIZE = 32
enum DbfState { header, field, terminator, record }
type DbfHeader = {
    version: number,
    lastUpdate: string,
    recordCount: number,
    headerSize: number,
    recordSize: number,
    fieldCount: number,
}
enum DbfType { char = 'C', date = "D", number = "N", logical = "L", memo = "M" }
// C (Character)	All OEM code page characters.
// D (Date)	Numbers and a character to separate month, day, and year (stored internally as 8 digits in YYYYMMDD format).
// N (Numeric)	- . 0 1 2 3 4 5 6 7 8 9
// L (Logical)	? Y y N n T t F f (? when not initialized).
// M (Memo)	All OEM code page characters (stored internally as 10 digits representing a .DBT block number).
type DbfField = {
    name: string,
    type: DbfType,
    offset: number,
    length: number,
    decimal: number,
}
export class DbfRS extends TransformStream<Uint8Array, {[x:string]:any} > {
    pos = 0
    start = 0
    state = DbfState.header
    expected = DBF_HEADER_SIZE
    bytes: number[] = []
    enqueuer?: PropertiesEnqueuer = { enqueue: () => void 0 }
    withLocation = false
    header: DbfHeader
    fields: DbfField[]
    constructor(withLocation = false) {
        super({
            transform: (chunk, controller) => {
                this.enqueuer = controller
                chunk.forEach(byte => this.put(byte))
            }
        })
        this.withLocation = withLocation
    }

    static forEach(array: Uint8Array, action: (properties: Properties) => void) {
        const rs = new DbfRS()
        rs.init({ enqueue: action })
        array.forEach(charcode => rs.put(charcode))
    }

    private init(enqueuer: PropertiesEnqueuer) {
        this.state = DbfState.header
        this.start =
            this.pos = 0
        this.expected = DBF_HEADER_SIZE
        this.bytes = []
        this.enqueuer = enqueuer ?? { enqueue: (properties: Properties) => void 0 }
    }

    private put(byte: number) {
        this.bytes.push(byte)
        if (this.bytes.length == this.expected) {
            const data = new DataView(new Uint8Array(this.bytes).buffer)
            this.automata(data)
            this.bytes = []
            this.start = this.pos + 1
        }
        this.pos++
    }
    private automata(buffer: DataView) {
        switch (this.state) {
            case DbfState.header:
                this.header = this.decodeHeader(buffer)
                this.state = DbfState.field;
                this.expected = this.header.fieldCount * DBF_FIELD_SIZE
                break;
            case DbfState.field:
                this.fields = this.decodeFields(buffer)
                this.state = DbfState.terminator;
                this.expected = 1 // skip 0x0D
                break;
            case DbfState.terminator:
                this.state = DbfState.record;
                this.expected = this.header.recordSize
                break;
            case DbfState.record:
                const properties = this.decodeRecord(buffer)
                //if (this.withLocation) feature._location = { offset: this.start, length: buffer.byteLength }
                this.enqueuer.enqueue(properties)
                this.state = DbfState.record;
                this.expected = this.header.recordSize
                break;
        }
    }
    private decodeHeader(buffer: DataView) {
        // Byte	    Contents	    Description
        // 0	    1 byte	        Valid dBASE III PLUS table file (03h without a memo .DBT file; 83h with a memo).
        // 1-3	    3 bytes	        Date of last update; in YYMMDD format.
        // 4-7	    32-bit number	Number of records in the table.
        // 8-9	    16-bit number	Number of bytes in the header.
        // 10-11	16-bit number	Number of bytes in the record.
        // 12-14	3 bytes	        Reserved bytes.
        // 15-27	13 bytes	    Reserved for dBASE III PLUS on a LAN.
        // 28-31	4 bytes	        Reserved bytes.
        // 32-n	    32 bytes	    Field descriptor array (the structure of this array is each shown below)
        // n+1	    1 byte	        0Dh stored as the field terminator.
        return {
            version: buffer.getUint8(0),
            lastUpdate: `${buffer.getUint8(3)}/${buffer.getUint8(2)}/${buffer.getUint8(1) + 1900}`,
            recordCount: buffer.getUint32(4, true),
            headerSize: buffer.getUint16(8, true),
            recordSize: buffer.getUint16(10, true),
            fieldCount: (buffer.getUint16(8, true) - DBF_HEADER_SIZE - 1) / 32
        }
    }
    private decodeFields(buffer: DataView) {
        // Byte	    Contents    Description
        // 0-10	    11 bytes	Field name in ASCII (zero-filled).
        // 11	    1 byte	    Field type in ASCII (C, D, L, M, or N).
        // 12-15	4 bytes	    Field data address (address is set in memory; not useful on disk).
        // 16	    1 byte	    Field length in binary.
        // 17	    1 byte	    Field decimal count in binary.
        // 18-19	2 bytes	    Reserved for dBASE III PLUS on a LAN.
        // 20	    1 byte	    Work area ID.
        // 21-22	2 bytes	    Reserved for dBASE III PLUS on a LAN.
        // 23	    1 byte	    SET FIELDS flag.
        // 24-31	1 byte	    Reserved bytes.
        const fields: DbfField[] = []
        let offset = 0
        let fieldOffset = 1
        while (offset < buffer.byteLength) {
            const field = {
                name: new TextDecoder().decode(buffer.buffer.slice(offset, offset + 11)).replace(/[\u0000-\u001F\u007F-\u009F]/g,''),
                type: String.fromCharCode(buffer.getUint8(offset + 11)) as DbfType,
                offset: fieldOffset,
                length: buffer.getUint8(offset + 16),
                decimal: buffer.getUint8(offset + 17),
            }
            fields.push(field)
            fieldOffset += field.length
            offset += DBF_FIELD_SIZE
        }
        return fields
    }

    private decodeRecord(buffer: DataView): Properties {
        const properties:Properties={}
        const td = new TextDecoder()
        for (const field of this.fields) {
            switch(field.type) {
                case DbfType.char : 
                    properties[field.name] = td.decode(buffer.buffer.slice(field.offset, field.offset + field.length)).trimEnd()
                    break
                case DbfType.date : 
                    const str_date = td.decode(buffer.buffer.slice(field.offset, field.offset + 8))
                    properties[field.name] = new Date(`${str_date.substring(0,4)}-${str_date.substring(4,6)}-${str_date.substring(6,8)}`)
                    break
                case DbfType.number : 
                    const str_num = td.decode(buffer.buffer.slice(field.offset, field.offset + field.length))
                    properties[field.name] = parseFloat(str_num)
                    break
                case DbfType.logical : 
                    const str_log = String.fromCharCode(buffer.getUint8(field.offset))
                    properties[field.name] = (str_log == '?') ? null : ['Y', 'y', 'T', 't'].includes(str_log)
                    break 
                case DbfType.memo : 
                    properties[field.name] = td.decode(buffer.buffer.slice(field.offset, field.offset + field.length))
                    break
                }
        }
        return properties
    }
}
