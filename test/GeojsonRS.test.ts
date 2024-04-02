import { GeojsonRS } from "../src/GeojsonRS"
import { Feature } from "../src/types"
import { NodeS2WebS, ArrayWS, toByteRS, copy, copyFeature } from "../src/utils"
import { ReadableStream, WritableStream } from "node:stream/web"
import * as fs from "fs"

const o_str = fs.readFileSync("./test/data/point_3.geojson","utf-8")
const o_geojson = JSON.parse(o_str)
const o_locations  = [{ offset: 97, length:112 },{ offset: 224, length: 112},{ offset: 351, length: 112}]
const o_features_with_locations = copyFeature(o_geojson.features, o_locations)

describe("Geojson test", () => {

    it("is instantiable", () => {
        expect(new GeojsonRS()).toBeInstanceOf(GeojsonRS)
    })

    it("can parse Uint8Array buffer", () => {
        let features: Feature[] = []
        const buffer = Buffer.from(JSON.stringify(o_geojson))
        GeojsonRS.forEach(buffer, feature => features.push(feature))
        expect(features).toStrictEqual(o_geojson.features)
    })

    it("can parse a byte Stream ", async () => {
        const rs = new toByteRS(o_geojson)
        const ws = new ArrayWS<Feature>()
        await rs.pipeThrough(new GeojsonRS()).pipeTo(ws)
        expect(ws.store).toStrictEqual(o_geojson.features)
    })

    it("can parse a node fs.createReadStream()", async () => {
        const rs = NodeS2WebS(fs.createReadStream("./test/data/poi_3.geojson"))
        const ws = new ArrayWS<Feature>()
        await rs.pipeThrough(new GeojsonRS()).pipeTo(ws)
        expect(ws.store.length).toBe(3)
    })

    it("can iterate through", async () => {
        const rs = new toByteRS(o_geojson)
        let features: Feature[] = []
        for await (const feature of rs.pipeThrough(new GeojsonRS())) {
            features.push(feature)
        }
        expect(features).toStrictEqual(o_geojson.features)
    })

    it("can iterate through values() method", async () => {
        const rs = new toByteRS(o_geojson)
        let features: Feature[] = []
        for await (const feature of rs.pipeThrough(new GeojsonRS()).values()) {
            features.push(feature)
        }
        expect(features).toStrictEqual(o_geojson.features)
    })

    it("can return feature locations", async () => {
        const rs = new toByteRS(o_str)
        const ws = new ArrayWS<Feature>()
        await rs.pipeThrough(new GeojsonRS(true)).pipeTo(ws)
        expect(ws.store).toStrictEqual(o_features_with_locations)
    })

})
