import { DbfRS } from "../src/ShapefileRS"
import { Properties } from "../src/types"
import { NodeS2WebS, ArrayWS, toByteRS } from "../src/utils"
import * as fs from "fs"

const o_buf = fs.readFileSync("./test/data/point_3.dbf")
const o_properties = [{ name: "A" }, { name: "B" }, { name: "C" }]

describe("DbfRS test", () => {

    it("is instantiable", () => {
        expect(new DbfRS()).toBeInstanceOf(DbfRS)
    })

    it("can parse Uint8Array buffer", () => {
        let properties: Properties[] = []
        DbfRS.forEach(o_buf, feature => properties.push(feature))
        expect(properties).toStrictEqual(o_properties)
    })

    it("can parse a byte Stream ", async () => {
        const rs = new toByteRS(o_buf)
        const ws = new ArrayWS<Properties>()
        await rs.pipeThrough(new DbfRS()).pipeTo(ws)
        expect(ws.store).toStrictEqual(o_properties)
    })

    it("can parse a node fs.createReadStream()", async () => {
        const rs = NodeS2WebS(fs.createReadStream("./test/data/point_3.dbf"))
        const ws = new ArrayWS<Properties>()
        await rs.pipeThrough(new DbfRS()).pipeTo(ws)
        expect(ws.store).toStrictEqual(o_properties)
    })

    it("can iterate through", async () => {
        const rs = new toByteRS(o_buf)
        let properties: Properties[] = []
        for await (const feature of rs.pipeThrough(new DbfRS())) {
            properties.push(feature)
        }
        expect(properties).toStrictEqual(o_properties)
    })

    it("can iterate through values() method", async () => {
        const rs = new toByteRS(o_buf)
        let properties: Properties[] = []
        for await (const feature of rs.pipeThrough(new DbfRS()).values()) {
            properties.push(feature)
        }
        expect(properties).toStrictEqual(o_properties)
    })

})
