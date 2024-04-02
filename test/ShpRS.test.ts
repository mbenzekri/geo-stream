import { ShpRS } from "../src/ShapefileRS"
import { Feature } from "../src/types"
import { NodeS2WebS, ArrayWS, toByteRS, copyFeature } from "../src/utils"
import * as fs from "fs"

const o_buf = fs.readFileSync("./test/data/point_3.shp")
const o_str = fs.readFileSync("./test/data/point_3.geojson", "utf-8")
const o_geojson = JSON.parse(o_str)
o_geojson.features.forEach(f => f.properties = null)
const o_locations = [{ offset: 108, length: 20 }, { offset: 136, length: 20 }, { offset: 164, length: 20 }]
const features_with_locations = copyFeature(o_geojson.features, o_locations)

describe("ShpRS test", () => {

    it("is instantiable", () => {
        expect(new ShpRS()).toBeInstanceOf(ShpRS)
    })

    it("can parse Uint8Array buffer", () => {
        let features: Feature[] = []
        ShpRS.forEach(o_buf, feature => features.push(feature))
        expect(features).toStrictEqual(o_geojson.features)
    })

    it("can parse a byte Stream ", async () => {
        const rs = new toByteRS(o_buf)
        const ws = new ArrayWS<Feature>()
        await rs.pipeThrough(new ShpRS()).pipeTo(ws)
        expect(ws.store).toStrictEqual(o_geojson.features)
    })

    it("can parse a node fs.createReadStream()", async () => {
        const rs = NodeS2WebS(fs.createReadStream("./test/data/point_3.shp"))
        const ws = new ArrayWS<Feature>()
        await rs.pipeThrough(new ShpRS()).pipeTo(ws)
        expect(ws.store).toStrictEqual(o_geojson.features)
    })

    it("can iterate through", async () => {
        const rs = new toByteRS(o_buf)
        let features: Feature[] = []
        for await (const feature of rs.pipeThrough(new ShpRS())) {
            features.push(feature)
        }
        expect(features).toStrictEqual(o_geojson.features)
    })

    it("can iterate through values() method", async () => {
        const rs = new toByteRS(o_buf)
        let features: Feature[] = []
        for await (const feature of rs.pipeThrough(new ShpRS()).values()) {
            features.push(feature)
        }
        expect(features).toStrictEqual(o_geojson.features)
    })

    it("can return feature locations", async () => {
        const rs = new toByteRS(o_buf)
        const ws = new ArrayWS<Feature>()
        await rs.pipeThrough(new ShpRS(true)).pipeTo(ws)
        expect(ws.store).toStrictEqual(features_with_locations)
    })

})
